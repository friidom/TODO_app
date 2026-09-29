import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
} from "lucide-react";

import { categoryOf } from "@/constants/columns";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  NODE_H,
  NODE_W,
  edgePath,
  fitView,
  nodeAt,
  zoomAt,
  type Point,
  type Viewport,
} from "@/services/workflow/diagramLayout";
import {
  withTransitionAdded,
  withTransitionRemoved,
  type WorkflowDraft,
} from "@/services/workflow/draft";
import type { WorkflowEdit } from "@/services/workflow/usePublishWorkflow";
import { cn } from "@/utils/cn";

export type Selection =
  | { kind: "status"; id: string }
  | { kind: "edge"; from: string; to: string }
  | null;

const DRAG_THRESHOLD = 4;
const ZOOM_STEP = 1.2;

type Gesture =
  | { kind: "move"; id: string; grab: Point; origin: Point; moved: boolean }
  | { kind: "link"; from: string; at: Point; over: string | null }
  | { kind: "pan"; origin: Point; from: Viewport };

export default function WorkflowDiagram({
  draft,
  layout,
  onMove,
  onAutoArrange,
  selection,
  onSelect,
  edit,
}: {
  draft: WorkflowDraft;
  layout: Record<string, Point>;
  onMove: (id: string, at: Point) => void;
  onAutoArrange: () => void;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  edit: (change: WorkflowEdit) => boolean;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SVGGElement>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [view, setView] = useState<Viewport>({ zoom: 1, x: 0, y: 0 });

  // Held in a ref so "fit to screen" stays a stable callback: depending on the
  // layout directly would re-fit on every node drag and undo the reader's pan.
  const layoutRef = useRef(layout);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  const fit = useCallback(() => {
    const frame = frameRef.current;

    if (!frame) return;

    const { width, height } = frame.getBoundingClientRect();

    if (width > 0 && height > 0) {
      setView(fitView(layoutRef.current, { width, height }));
    }
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

  function step(factor: number) {
    const frame = frameRef.current;

    if (!frame) return;

    const { width, height } = frame.getBoundingClientRect();

    setView((current) =>
      zoomAt(current, current.zoom * factor, { x: width / 2, y: height / 2 }),
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

      if (target) {
        edit((next) => withTransitionAdded(next, gesture.from, target));
        onSelect({ kind: "edge", from: gesture.from, to: target });
      }
    } else if (gesture.kind === "move" && !gesture.moved) {
      onSelect({ kind: "status", id: gesture.id });
    }

    setGesture(null);
  }

  const edges = draft.transitions.filter(
    (edge) => layout[edge.from] && layout[edge.to],
  );

  // A pair that points both ways shares one run of canvas, so the second is
  // pushed into a lane of its own rather than drawn on top of the first.
  const lanes = new Map<string, number>();
  const used = new Map<string, number>();

  for (const edge of edges) {
    const key = [edge.from, edge.to].sort().join(">");
    const taken = used.get(key) ?? 0;

    lanes.set(`${edge.from}>${edge.to}`, taken);
    used.set(key, taken + 1);
  }

  const linking = gesture?.kind === "link" ? gesture : null;

  return (
    <div
      ref={frameRef}
      className="border-hairline bg-canvas rounded-surface relative h-full min-h-0 overflow-hidden border"
    >
      <svg
        role="group"
        aria-label="Workflow diagram"
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

          {(["idle", "active"] as const).map((tone) => (
            <marker
              key={tone}
              id={`wf-arrow-${tone}`}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path
                d="M0 0 L10 5 L0 10 z"
                className={tone === "active" ? "fill-brand" : "fill-ink-3"}
              />
            </marker>
          ))}
        </defs>

        <rect width="100%" height="100%" fill="url(#wf-grid)" />

        <g
          ref={sceneRef}
          transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}
        >
          {edges.map((edge) => {
            const active =
              selection?.kind === "edge" &&
              selection.from === edge.from &&
              selection.to === edge.to;
            const near =
              selection?.kind === "status" &&
              (selection.id === edge.from || selection.id === edge.to);
            const { d, mid } = edgePath(
              layout[edge.from]!,
              layout[edge.to]!,
              lanes.get(`${edge.from}>${edge.to}`) ?? 0,
            );
            const tone = active || near ? "active" : "idle";

            return (
              <g key={`${edge.from}>${edge.to}`}>
                <g
                  role="button"
                  tabIndex={0}
                  aria-label={`Transition ${nameOf(draft, edge.from)} to ${nameOf(draft, edge.to)}`}
                  aria-pressed={active}
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
                >
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={16}
                    pointerEvents="stroke"
                  />

                  <path
                    d={d}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={active ? 2.5 : 1.5}
                    markerEnd={`url(#wf-arrow-${tone})`}
                    className={cn(
                      tone === "active" ? "stroke-brand" : "stroke-ink-3",
                      !active &&
                        "group-hover/edge:stroke-brand group-focus-visible/edge:stroke-brand",
                    )}
                  />
                </g>

                {active && (
                  <foreignObject
                    x={mid.x - 14}
                    y={mid.y - 14}
                    width={28}
                    height={28}
                    className="overflow-visible"
                  >
                    <button
                      type="button"
                      aria-label={`Remove transition ${nameOf(draft, edge.from)} to ${nameOf(draft, edge.to)}`}
                      title="Remove transition"
                      onClick={(event) => {
                        event.stopPropagation();
                        edit((next) =>
                          withTransitionRemoved(next, edge.from, edge.to),
                        );
                        onSelect(null);
                      }}
                      className="border-hairline bg-surface text-status-red hover:bg-status-red hover:border-status-red focus-visible:ring-brand shadow-e2 grid size-7 place-items-center rounded-full border transition-colors outline-none hover:text-white focus-visible:ring-2 [&_svg]:size-3.5"
                    >
                      <Trash2Icon />
                    </button>
                  </foreignObject>
                )}
              </g>
            );
          })}

          {linking && (
            <line
              x1={layout[linking.from]!.x + NODE_W}
              y1={layout[linking.from]!.y + NODE_H / 2}
              x2={linking.at.x}
              y2={linking.at.y}
              strokeDasharray="5 4"
              strokeWidth={2}
              strokeLinecap="round"
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
            const target = linking?.over === status.id;
            const column = draft.columns.find(
              (it) => it.id === status.column_id,
            );

            return (
              <g key={status.id} transform={`translate(${at.x} ${at.y})`}>
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
                      "rounded-card focus-visible:ring-brand flex flex-col justify-center overflow-hidden border px-3 outline-none focus-visible:ring-2",
                      categoryOf(status.category).lozenge,
                      dragging ? "shadow-e3 cursor-grabbing" : "cursor-grab",
                      selected
                        ? "ring-brand ring-offset-canvas shadow-e2 ring-2 ring-offset-2"
                        : "shadow-e1",
                      target && "ring-brand ring-dashed ring-2",
                      status.is_hidden && "opacity-70",
                    )}
                  >
                    <span className="text-ink text-mini flex min-w-0 items-center gap-1 font-semibold tracking-wide uppercase">
                      {status.is_hidden && (
                        <EyeOffIcon className="size-3 shrink-0" />
                      )}

                      <span className="truncate">{status.name}</span>
                    </span>

                    <span className="text-ink-3 text-micro truncate">
                      {column ? column.title : "Unmapped"}
                    </span>
                  </div>
                </foreignObject>

                <circle
                  cx={NODE_W}
                  cy={NODE_H / 2}
                  r={7}
                  role="button"
                  aria-label={`Connect ${status.name} to another status`}
                  onPointerDown={(event) => startLink(event, status.id)}
                  className={cn(
                    "fill-surface stroke-ink-3 hover:fill-brand hover:stroke-brand cursor-crosshair transition-opacity",
                    linking || selected ? "opacity-100" : "opacity-0",
                  )}
                  strokeWidth={2}
                />
              </g>
            );
          })}
        </g>
      </svg>

      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-end justify-between gap-3">
        <p className="text-ink-3 text-mini bg-surface/80 rounded-control hidden px-2 py-1 backdrop-blur-sm lg:block">
          Drag a status to move it · drag its right-hand dot onto another to
          connect · select an arrow to remove it
        </p>

        <div className="border-hairline bg-surface rounded-control shadow-e2 pointer-events-auto ml-auto flex items-center gap-0.5 border p-0.5">
          <CanvasButton
            label="Auto-arrange"
            onClick={() => {
              onAutoArrange();
              requestAnimationFrame(fit);
            }}
          >
            <SparklesIcon />
          </CanvasButton>

          <CanvasButton label="Fit to screen" onClick={fit}>
            <MaximizeIcon />
          </CanvasButton>

          <span aria-hidden className="bg-hairline mx-0.5 h-5 w-px" />

          <CanvasButton
            label="Zoom out"
            disabled={view.zoom <= MIN_ZOOM}
            onClick={() => step(1 / ZOOM_STEP)}
          >
            <MinusIcon />
          </CanvasButton>

          <span className="text-ink-2 text-mini w-11 text-center font-medium tabular-nums">
            {Math.round(view.zoom * 100)}%
          </span>

          <CanvasButton
            label="Zoom in"
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

function nameOf(draft: WorkflowDraft, id: string): string {
  return draft.statuses.find((status) => status.id === id)?.name ?? "";
}
