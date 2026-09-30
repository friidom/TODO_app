import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  EyeOffIcon,
  MaximizeIcon,
  MinusIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { categoryLabelKey, categoryOf } from "@/constants/columns";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  NODE_H,
  NODE_W,
  drawnAs,
  edgeKey,
  edgeSegment,
  fitView,
  nodeAt,
  revealed,
  routeEdges,
  zoomAt,
  type DisplayEdge,
  type Point,
  type Viewport,
} from "@/services/workflow/diagramLayout";
import type { WorkflowDraft } from "@/services/workflow/draft";
import { cn } from "@/utils/cn";

export type Selection =
  | { kind: "status"; id: string }
  | { kind: "edge"; from: string; to: string }
  | null;

const DRAG_THRESHOLD = 4;
const ZOOM_STEP = 1.2;
// Past this many lines, unrelated ones recede until something is focused.
const CROWDED = 40;

type Gesture =
  | { kind: "move"; id: string; grab: Point; origin: Point; moved: boolean }
  | { kind: "link"; from: string; at: Point; over: string | null }
  | { kind: "pan"; origin: Point; from: Viewport };

type Tone = "idle" | "out" | "in" | "selected" | "dim";

const TONE_ORDER: Record<Tone, number> = {
  dim: 0,
  idle: 1,
  in: 2,
  out: 3,
  selected: 4,
};

const MARKERS: { id: Tone; fill: string }[] = [
  { id: "idle", fill: "fill-ink-3" },
  { id: "in", fill: "fill-ink-2" },
  { id: "out", fill: "fill-brand" },
  { id: "selected", fill: "fill-brand" },
];

export default function WorkflowDiagram({
  draft,
  layout,
  edges,
  anyTargets,
  flagged,
  selection,
  onSelect,
  onMove,
  onMoveEnd,
  onAutoLayout,
  onConnect,
  onRemoveEdge,
}: {
  draft: WorkflowDraft;
  layout: Record<string, Point>;
  edges: DisplayEdge[];
  anyTargets: ReadonlySet<string>;
  flagged: ReadonlySet<string>;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onMove: (id: string, at: Point) => void;
  onMoveEnd: () => void;
  onAutoLayout: () => void;
  onConnect: (from: string, to: string) => void;
  onRemoveEdge: (from: string, to: string) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SVGGElement>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [view, setView] = useState<Viewport>({ zoom: 1, x: 0, y: 0 });
  const [hover, setHover] = useState<string | null>(null);
  const { t } = useTranslation();

  // Held in a ref so "fit to screen" stays a stable callback: depending on the
  // layout directly would re-fit on every node drag and undo the reader's pan.
  const layoutRef = useRef(layout);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  const frameSize = () => {
    const rect = frameRef.current?.getBoundingClientRect();

    return rect && rect.width > 0 && rect.height > 0
      ? { width: rect.width, height: rect.height }
      : null;
  };

  const fit = useCallback(() => {
    const size = frameSize();

    if (size) setView(fitView(layoutRef.current, size));
  }, []);

  // Without a fit once the frame has been measured, the first paint puts the
  // workflow at 1:1 in the top-left corner, where a wide one hangs off the
  // canvas before the reader has touched anything.
  useLayoutEffect(fit, [fit]);

  // The wheel listener cannot be a React prop: React attaches wheel passively,
  // and a passive listener may not preventDefault, so the dialog behind would
  // scroll while the canvas zoomed.
  useEffect(() => {
    const frame = frameRef.current;

    if (!frame) return;

    function onWheel(event: WheelEvent) {
      event.preventDefault();

      const rect = frame!.getBoundingClientRect();

      setView((current) =>
        zoomAt(
          current,
          current.zoom * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP),
          { x: event.clientX - rect.left, y: event.clientY - rect.top },
        ),
      );
    }

    frame.addEventListener("wheel", onWheel, { passive: false });

    return () => frame.removeEventListener("wheel", onWheel);
  }, []);

  // Keyed on the selection, not the layout, so a pan the reader makes after
  // picking something from the inspector is left alone.
  const revealFrom =
    selection?.kind === "status"
      ? selection.id
      : selection?.kind === "edge"
        ? selection.from
        : null;
  const revealTo = selection?.kind === "edge" ? selection.to : null;

  useEffect(() => {
    const size = frameSize();

    if (!size) return;

    for (const id of [revealFrom, revealTo]) {
      const at = id ? layoutRef.current[id] : undefined;

      if (at) setView((current) => revealed(current, at, size));
    }
  }, [revealFrom, revealTo]);

  function step(factor: number) {
    const size = frameSize();

    if (!size) return;

    setView((current) =>
      zoomAt(current, current.zoom * factor, {
        x: size.width / 2,
        y: size.height / 2,
      }),
    );
  }

  // Diagram coordinates, read through the scene's own matrix so the zoom and
  // the pan are already accounted for.
  function pointOf(event: PointerEvent): Point {
    const matrix = sceneRef.current?.getScreenCTM();

    if (!matrix) return { x: event.clientX, y: event.clientY };

    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );

    return { x: point.x, y: point.y };
  }

  function startMove(event: PointerEvent, id: string) {
    if (event.button !== 0) return;

    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    const at = pointOf(event);
    const origin = layout[id]!;

    setGesture({
      kind: "move",
      id,
      grab: { x: at.x - origin.x, y: at.y - origin.y },
      origin: at,
      moved: false,
    });
  }

  function startLink(event: PointerEvent, from: string) {
    if (event.button !== 0) return;

    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setGesture({ kind: "link", from, at: pointOf(event), over: null });
  }

  function startPan(event: PointerEvent) {
    if (event.button !== 0) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    setGesture({
      kind: "pan",
      origin: { x: event.clientX, y: event.clientY },
      from: view,
    });
  }

  function track(event: PointerEvent) {
    if (!gesture) return;

    if (gesture.kind === "pan") {
      setView({
        zoom: gesture.from.zoom,
        x: gesture.from.x + (event.clientX - gesture.origin.x),
        y: gesture.from.y + (event.clientY - gesture.origin.y),
      });

      return;
    }

    const at = pointOf(event);

    if (gesture.kind === "link") {
      setGesture({ ...gesture, at, over: nodeAt(layout, at, gesture.from) });

      return;
    }

    const moved =
      gesture.moved ||
      Math.hypot(at.x - gesture.origin.x, at.y - gesture.origin.y) >
        DRAG_THRESHOLD;

    if (!moved) return;

    setGesture({ ...gesture, moved });
    onMove(gesture.id, { x: at.x - gesture.grab.x, y: at.y - gesture.grab.y });
  }

  function finish(event: PointerEvent) {
    if (!gesture) return;

    if (gesture.kind === "link") {
      const target = nodeAt(layout, pointOf(event), gesture.from);

      if (target) onConnect(gesture.from, target);
    } else if (gesture.kind === "move") {
      if (gesture.moved) onMoveEnd();
      else onSelect({ kind: "status", id: gesture.id });
    }

    setGesture(null);
  }

  const routes = useMemo(() => routeEdges(layout, edges), [layout, edges]);

  const linking = gesture?.kind === "link" ? gesture : null;
  const chosen = selection?.kind === "edge" ? selection : null;
  const focus = linking
    ? null
    : selection?.kind === "status"
      ? selection.id
      : selection === null
        ? hover
        : null;

  // What stays at full strength while something is focused: the two ends of a
  // selected transition, or a status and everything it connects to. Every
  // status connects to an "any" target, so those always stay.
  const related = useMemo(() => {
    if (chosen) return new Set([chosen.from, chosen.to]);

    if (!focus) return null;

    const ids = new Set([focus, ...anyTargets]);

    for (const edge of edges) {
      if (edge.from === focus) ids.add(edge.to);
      if (edge.to === focus) ids.add(edge.from);
    }

    return ids;
  }, [chosen, focus, anyTargets, edges]);

  function toneOf(edge: DisplayEdge): Tone {
    if (chosen) {
      return drawnAs(edge, chosen.from, chosen.to) ? "selected" : "dim";
    }

    if (focus) {
      if (edge.from === focus || (edge.twoWay && edge.to === focus)) {
        return "out";
      }

      return edge.to === focus ? "in" : "dim";
    }

    return "idle";
  }

  const drawn = edges
    .map((edge) => ({ edge, tone: toneOf(edge) }))
    .sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);

  const crowded = edges.length > CROWDED;
  const chosenRoute = chosen
    ? edges
        .filter((edge) => drawnAs(edge, chosen.from, chosen.to))
        .map((edge) => routes.get(edgeKey(edge.from, edge.to)))[0]
    : undefined;

  const nameOf = (id: string) =>
    draft.statuses.find((status) => status.id === id)?.name ?? "";

  const preview = linking
    ? linking.over && layout[linking.over]
      ? edgeSegment(layout[linking.from]!, layout[linking.over]!)
      : {
          x1: layout[linking.from]!.x + NODE_W,
          y1: layout[linking.from]!.y + NODE_H / 2,
          x2: linking.at.x,
          y2: linking.at.y,
        }
    : null;

  return (
    <div
      ref={frameRef}
      className="border-hairline bg-canvas rounded-surface relative h-full min-h-0 overflow-hidden border"
    >
      <svg
        role="group"
        aria-label={t("workflow.diagramLabel")}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) startPan(event);
        }}
        onPointerMove={track}
        onPointerUp={finish}
        onPointerCancel={() => setGesture(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) onSelect(null);
        }}
        className={cn(
          "h-full w-full touch-none select-none",
          gesture?.kind === "pan" ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        <defs>
          <pattern
            id="wf-grid"
            width={24}
            height={24}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}
          >
            <circle cx={1} cy={1} r={1} className="fill-ink/[0.07]" />
          </pattern>

          {MARKERS.map((marker) => (
            <marker
              key={marker.id}
              id={`wf-arrow-${marker.id}`}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L10 5 L0 10 z" className={marker.fill} />
            </marker>
          ))}
        </defs>

        <rect
          width="100%"
          height="100%"
          fill="url(#wf-grid)"
          pointerEvents="none"
        />

        <g
          ref={sceneRef}
          transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}
        >
          {drawn.map(({ edge, tone }) => {
            const route = routes.get(edgeKey(edge.from, edge.to));

            if (!route) return null;

            // On a selected two-way line only the chosen direction's head is lit.
            const head = (node: string) =>
              `url(#wf-arrow-${
                tone === "dim" || (tone === "selected" && chosen?.to !== node)
                  ? "idle"
                  : tone
              })`;
            const startNode = route.reversed ? edge.to : edge.from;
            const endNode = route.reversed ? edge.from : edge.to;
            const label = edge.twoWay
              ? t("workflow.edgeTwoWay", {
                  from: nameOf(edge.from),
                  to: nameOf(edge.to),
                })
              : t("workflow.edgeOneWay", {
                  from: nameOf(edge.from),
                  to: nameOf(edge.to),
                });

            return (
              <g
                key={edgeKey(edge.from, edge.to)}
                role="button"
                tabIndex={0}
                aria-label={label}
                aria-pressed={tone === "selected"}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect({ kind: "edge", from: edge.from, to: edge.to });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect({ kind: "edge", from: edge.from, to: edge.to });
                  }
                }}
                className="group/edge cursor-pointer outline-none"
                opacity={
                  tone === "dim" || (tone === "idle" && crowded) ? 0.12 : 1
                }
              >
                <path
                  d={route.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  pointerEvents="stroke"
                />

                <path
                  d={route.d}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={
                    tone === "selected"
                      ? 2.75
                      : tone === "out" || tone === "in"
                        ? 2
                        : 1.5
                  }
                  strokeDasharray={tone === "in" ? "5 4" : undefined}
                  markerEnd={head(endNode)}
                  markerStart={edge.twoWay ? head(startNode) : undefined}
                  className={cn(
                    tone === "selected" || tone === "out"
                      ? "stroke-brand"
                      : tone === "in"
                        ? "stroke-ink-2"
                        : "stroke-ink-3 group-hover/edge:stroke-ink-2 group-focus-visible/edge:stroke-brand",
                  )}
                />
              </g>
            );
          })}

          {chosen && chosenRoute && (
            <foreignObject
              x={chosenRoute.mid.x - 14}
              y={chosenRoute.mid.y - 14}
              width={28}
              height={28}
              className="overflow-visible"
            >
              <button
                type="button"
                aria-label={t("workflow.removeTransition", {
                  from: nameOf(chosen.from),
                  to: nameOf(chosen.to),
                })}
                title={t("workflow.removeTransitionShort")}
                onClick={(event) => {
                  event.stopPropagation();
                  onRemoveEdge(chosen.from, chosen.to);
                }}
                className="border-hairline bg-surface text-status-red hover:bg-status-red hover:border-status-red focus-visible:ring-brand shadow-e2 grid size-7 place-items-center rounded-full border transition-colors outline-none hover:text-white focus-visible:ring-2 [&_svg]:size-3.5"
              >
                <Trash2Icon />
              </button>
            </foreignObject>
          )}

          {preview && (
            <line
              {...preview}
              strokeDasharray="5 4"
              strokeWidth={2}
              strokeLinecap="round"
              markerEnd={linking?.over ? "url(#wf-arrow-out)" : undefined}
              className="stroke-brand pointer-events-none"
            />
          )}

          {draft.statuses.map((status) => {
            const at = layout[status.id];

            if (!at) return null;

            const selected =
              selection?.kind === "status" && selection.id === status.id;
            const dragging =
              gesture?.kind === "move" &&
              gesture.id === status.id &&
              gesture.moved;
            const dimmed = related !== null && !related.has(status.id);
            const target = linking?.over === status.id;
            const candidate = linking !== null && linking.from !== status.id;
            const tag =
              chosen?.from === status.id
                ? t("workflow.from")
                : chosen?.to === status.id
                  ? t("workflow.to")
                  : null;
            const column = draft.columns.find(
              (it) => it.id === status.column_id,
            );
            const showHandle =
              !linking && !gesture && (hover === status.id || selected);

            return (
              <g
                key={status.id}
                transform={`translate(${at.x} ${at.y})`}
                onPointerEnter={() => setHover(status.id)}
                onPointerLeave={() =>
                  setHover((current) =>
                    current === status.id ? null : current,
                  )
                }
                className={cn(
                  "transition-opacity duration-150",
                  dimmed && "opacity-35",
                )}
              >
                <foreignObject
                  width={NODE_W}
                  height={NODE_H}
                  className="overflow-visible"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`Status ${status.name}`}
                    aria-pressed={selected}
                    onPointerDown={(event) => startMove(event, status.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect({ kind: "status", id: status.id });
                      }
                    }}
                    style={{ width: NODE_W, height: NODE_H }}
                    className={cn(
                      "bg-elevated rounded-control focus-visible:ring-brand block outline-none focus-visible:ring-2",
                      dragging ? "shadow-e3 cursor-grabbing" : "cursor-grab",
                      selected
                        ? "ring-brand ring-offset-canvas shadow-e2 ring-2 ring-offset-2"
                        : "shadow-e1",
                      candidate &&
                        (target
                          ? "outline-brand outline-2 outline-offset-2"
                          : "outline-ink-3/40 outline-1 outline-offset-2 outline-dashed"),
                    )}
                  >
                    <div
                      className={cn(
                        "rounded-control flex size-full flex-col justify-center gap-0.5 overflow-hidden border px-3",
                        categoryOf(status.category).lozenge,
                      )}
                    >
                      <span className="text-ink text-mini flex min-w-0 items-center gap-1 font-semibold tracking-wide uppercase">
                        {status.is_hidden && (
                          <EyeOffIcon
                            aria-label={t("workflow.hidden")}
                            className="size-3 shrink-0"
                          />
                        )}

                        <span className="truncate">{status.name}</span>

                        {flagged.has(status.id) && (
                          <TriangleAlertIcon
                            aria-label={t("workflow.needsAttention")}
                            className="text-status-orange ml-auto size-3 shrink-0"
                          />
                        )}
                      </span>

                      <span className="text-ink-3 text-micro truncate">
                        {t(categoryLabelKey(status.category))}
                        {!column
                          ? ` · ${t("workflow.notOnBoard")}`
                          : column.title.toLowerCase() !==
                              status.name.toLowerCase()
                            ? ` · ${column.title}`
                            : null}
                      </span>
                    </div>
                  </div>
                </foreignObject>

                {anyTargets.has(status.id) && (
                  <foreignObject
                    x={NODE_W - 64}
                    y={-9}
                    width={60}
                    height={18}
                    className="overflow-visible"
                  >
                    <span
                      title={t("workflow.everyOtherCanMoveHere")}
                      className={cn(
                        "text-micro ml-auto grid h-[18px] w-fit place-items-center rounded-full px-1.5 font-semibold whitespace-nowrap",
                        focus && focus !== status.id
                          ? "bg-brand text-brand-fg"
                          : "bg-ink text-canvas",
                      )}
                    >
                      {t("workflow.fromAny")}
                    </span>
                  </foreignObject>
                )}

                {tag && (
                  <foreignObject
                    x={0}
                    y={-22}
                    width={NODE_W}
                    height={18}
                    className="overflow-visible"
                  >
                    <span className="bg-brand text-brand-fg text-micro inline-grid h-[18px] place-items-center rounded px-1.5 font-semibold tracking-wide uppercase">
                      {tag}
                    </span>
                  </foreignObject>
                )}

                <g
                  aria-hidden
                  className={cn(
                    "transition-opacity duration-100",
                    showHandle
                      ? "opacity-100"
                      : "pointer-events-none opacity-0",
                  )}
                >
                  <circle
                    cx={NODE_W}
                    cy={NODE_H / 2}
                    r={12}
                    fill="transparent"
                    onPointerDown={(event) => startLink(event, status.id)}
                    className="peer cursor-crosshair"
                  >
                    <title>{t("workflow.dragToConnect")}</title>
                  </circle>

                  <circle
                    cx={NODE_W}
                    cy={NODE_H / 2}
                    r={5.5}
                    strokeWidth={2}
                    className="fill-surface stroke-brand peer-hover:fill-brand pointer-events-none transition-colors"
                  />
                </g>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-end justify-between gap-3">
        <div className="bg-surface/85 rounded-control text-ink-3 text-mini hidden px-2 py-1 backdrop-blur-sm lg:block">
          {focus ? (
            <span className="flex items-center gap-3">
              <Legend dashed={false}>{t("workflow.legendMoveTo")}</Legend>
              <Legend dashed>{t("workflow.legendArriveFrom")}</Legend>
              {anyTargets.size > 0 && (
                <span className="flex items-center gap-1">
                  <span className="bg-brand text-brand-fg rounded-full px-1.5 font-semibold">
                    {t("workflow.fromAny")}
                  </span>
                  {t("workflow.legendFromAny")}
                </span>
              )}
            </span>
          ) : chosen ? (
            t("workflow.hintSelected")
          ) : crowded ? (
            t("workflow.hintCrowded")
          ) : (
            t("workflow.hintDefault")
          )}
        </div>

        <div className="border-hairline bg-surface rounded-control shadow-e2 pointer-events-auto ml-auto flex items-center gap-0.5 border p-0.5">
          <CanvasButton
            label={t("workflow.autoLayout")}
            onClick={() => {
              onAutoLayout();
              requestAnimationFrame(fit);
            }}
          >
            <SparklesIcon />
          </CanvasButton>

          <CanvasButton label={t("workflow.fit")} onClick={fit}>
            <MaximizeIcon />
          </CanvasButton>

          <span aria-hidden className="bg-hairline mx-0.5 h-5 w-px" />

          <CanvasButton
            label={t("workflow.zoomOut")}
            disabled={view.zoom <= MIN_ZOOM}
            onClick={() => step(1 / ZOOM_STEP)}
          >
            <MinusIcon />
          </CanvasButton>

          <span className="text-ink-2 text-mini w-11 text-center font-medium tabular-nums">
            {Math.round(view.zoom * 100)}%
          </span>

          <CanvasButton
            label={t("workflow.zoomIn")}
            disabled={view.zoom >= MAX_ZOOM}
            onClick={() => step(ZOOM_STEP)}
          >
            <PlusIcon />
          </CanvasButton>
        </div>
      </div>
    </div>
  );
}

function Legend({
  dashed,
  children,
}: {
  dashed: boolean;
  children: ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <svg aria-hidden width="22" height="6" className="shrink-0">
        <line
          x1="1"
          y1="3"
          x2="21"
          y2="3"
          strokeWidth="2"
          strokeDasharray={dashed ? "4 3" : undefined}
          className={dashed ? "stroke-ink-2" : "stroke-brand"}
        />
      </svg>
      {children}
    </span>
  );
}

function CanvasButton({
  label,
  onClick,
  disabled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="text-ink-2 hover:bg-wash-strong hover:text-ink focus-visible:ring-brand rounded-control grid size-7 place-items-center transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4"
    >
      {children}
    </button>
  );
}
