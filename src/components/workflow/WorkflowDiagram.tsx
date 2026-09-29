import { useRef, useState, type PointerEvent } from "react";

import {
  NODE_H,
  NODE_W,
  canvasSize,
  edgeSegment,
  nodeAt,
  type Point,
} from "@/services/workflow/diagramLayout";
import { withTransitionAdded, type WorkflowDraft } from "@/services/workflow/draft";
import type { WorkflowEdit } from "@/services/workflow/usePublishWorkflow";
import { cn } from "@/utils/cn";

import StatusLozenge from "./StatusLozenge";

export type Selection =
  | { kind: "status"; id: string }
  | { kind: "edge"; from: string; to: string }
  | null;

const DRAG_THRESHOLD = 4;
const PARALLEL_OFFSET = 7;

type Gesture =
  | { kind: "move"; id: string; grab: Point; origin: Point; moved: boolean }
  | { kind: "link"; from: string; at: Point };

export default function WorkflowDiagram({
  draft,
  layout,
  onMove,
  selection,
  onSelect,
  edit,
}: {
  draft: WorkflowDraft;
  layout: Record<string, Point>;
  onMove: (id: string, at: Point) => void;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  edit: (change: WorkflowEdit) => boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const { width, height } = canvasSize(layout);

  function pointOf(event: PointerEvent): Point {
    const svg = svgRef.current!;
    const matrix = svg.getScreenCTM();

    if (!matrix) return { x: event.clientX, y: event.clientY };

    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );

    return { x: point.x, y: point.y };
  }

  function startMove(event: PointerEvent, id: string) {
    if (event.button !== 0) return;

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
    setGesture({ kind: "link", from, at: pointOf(event) });
  }

  function track(event: PointerEvent) {
    if (!gesture) return;

    const at = pointOf(event);

    if (gesture.kind === "link") {
      setGesture({ ...gesture, at });

      return;
    }

    const moved =
      gesture.moved ||
      Math.hypot(at.x - gesture.origin.x, at.y - gesture.origin.y) >
        DRAG_THRESHOLD;

    if (!moved) return;

    setGesture({ ...gesture, moved });
    onMove(gesture.id, {
      x: Math.max(0, at.x - gesture.grab.x),
      y: Math.max(0, at.y - gesture.grab.y),
    });
  }

  function finish(event: PointerEvent) {
    if (!gesture) return;

    if (gesture.kind === "link") {
      const target = nodeAt(layout, pointOf(event), gesture.from);

      if (target) {
        edit((next) => withTransitionAdded(next, gesture.from, target));
        onSelect({ kind: "edge", from: gesture.from, to: target });
      }
    } else if (!gesture.moved) {
      onSelect({ kind: "status", id: gesture.id });
    }

    setGesture(null);
  }

  const edges = draft.transitions.filter(
    (edge) => layout[edge.from] && layout[edge.to],
  );
  const has = new Set(edges.map((edge) => `${edge.from}>${edge.to}`));

  return (
    <div className="border-hairline bg-wash rounded-surface h-full min-h-[22rem] overflow-auto border">
      <svg
        ref={svgRef}
        role="group"
        aria-label="Workflow diagram"
        width={width}
        height={height}
        onPointerMove={track}
        onPointerUp={finish}
        onPointerCancel={() => setGesture(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) onSelect(null);
        }}
        className="touch-none select-none"
      >
        <defs>
          {(["idle", "active"] as const).map((tone) => (
            <marker
              key={tone}
              id={`arrow-${tone}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="8"
              markerHeight="8"
              orient="auto-start-reverse"
            >
              <path
                d="M0 0 L10 5 L0 10 z"
                className={tone === "active" ? "fill-brand" : "fill-ink-3"}
              />
            </marker>
          ))}
        </defs>

        {edges.map((edge) => {
          const active =
            selection?.kind === "edge" &&
            selection.from === edge.from &&
            selection.to === edge.to;
          const near =
            selection?.kind === "status" &&
            (selection.id === edge.from || selection.id === edge.to);
          const segment = edgeSegment(
            layout[edge.from]!,
            layout[edge.to]!,
            has.has(`${edge.to}>${edge.from}`) ? PARALLEL_OFFSET : 0,
          );
          const tone = active || near ? "active" : "idle";

          return (
            <g
              key={`${edge.from}>${edge.to}`}
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
              className="cursor-pointer outline-none [&:focus-visible>line:last-of-type]:stroke-brand"
            >
              <line
                {...segment}
                stroke="transparent"
                strokeWidth={14}
                pointerEvents="stroke"
              />

              <line
                {...segment}
                strokeWidth={active ? 2.25 : 1.5}
                markerEnd={`url(#arrow-${tone})`}
                className={tone === "active" ? "stroke-brand" : "stroke-ink-3"}
              />
            </g>
          );
        })}

        {gesture?.kind === "link" && (
          <line
            x1={layout[gesture.from]!.x + NODE_W}
            y1={layout[gesture.from]!.y + NODE_H / 2}
            x2={gesture.at.x}
            y2={gesture.at.y}
            strokeDasharray="4 3"
            className="stroke-brand pointer-events-none"
            strokeWidth={1.5}
          />
        )}

        {draft.statuses.map((status) => {
          const at = layout[status.id];

          if (!at) return null;

          const selected =
            selection?.kind === "status" && selection.id === status.id;
          const dragging =
            gesture?.kind === "move" && gesture.id === status.id && gesture.moved;

          return (
            <g
              key={status.id}
              transform={`translate(${at.x} ${at.y})`}
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
              className={cn(
                "group outline-none",
                dragging ? "cursor-grabbing" : "cursor-grab",
              )}
            >
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={6}
                className={cn(
                  "fill-elevated stroke-hairline group-focus-visible:stroke-brand",
                  selected && "stroke-brand",
                )}
                strokeWidth={selected ? 2 : 1}
              />

              <foreignObject
                width={NODE_W}
                height={NODE_H}
                className="pointer-events-none"
              >
                <div className="flex h-full items-center px-2">
                  <StatusLozenge
                    name={status.name}
                    category={status.category}
                    hidden={status.is_hidden}
                  />
                </div>
              </foreignObject>

              <circle
                cx={NODE_W}
                cy={NODE_H / 2}
                r={6}
                aria-label={`Connect ${status.name} to another status`}
                onPointerDown={(event) => startLink(event, status.id)}
                className="fill-elevated stroke-ink-3 hover:fill-brand hover:stroke-brand cursor-crosshair opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                strokeWidth={1.5}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function nameOf(draft: WorkflowDraft, id: string): string {
  return draft.statuses.find((status) => status.id === id)?.name ?? "";
}
