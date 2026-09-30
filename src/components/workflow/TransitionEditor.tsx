import { useState } from "react";
import { ArrowLeftIcon, ArrowRightIcon, PlusIcon, XIcon } from "lucide-react";

import IconButton from "@/components/ui/IconButton";
import {
  withTransitionAdded,
  withTransitionRemoved,
  withTransitionsInto,
  type WorkflowDraft,
} from "@/services/workflow/draft";
import type { WorkflowEdit } from "@/services/workflow/usePublishWorkflow";
import { cn } from "@/utils/cn";

import { InspectorSection } from "./InspectorParts";
import StatusLozenge from "./StatusLozenge";
import { SELECT } from "./workflowChrome";

type Direction = "out" | "in";

// One status's edges, read from the same draft.transitions the diagram draws:
// adding or removing here is adding or removing that exact A -> B.
export default function TransitionEditor({
  draft,
  statusId,
  edit,
  anyTarget = false,
  onSelectEdge,
}: {
  draft: WorkflowDraft;
  statusId: string;
  edit: (change: WorkflowEdit) => boolean;
  anyTarget?: boolean;
  onSelectEdge?: (from: string, to: string) => void;
}) {
  return (
    <>
      <Group
        direction="out"
        draft={draft}
        statusId={statusId}
        edit={edit}
        onSelectEdge={onSelectEdge}
      />

      <Group
        direction="in"
        draft={draft}
        statusId={statusId}
        edit={edit}
        anyTarget={anyTarget}
        onSelectEdge={onSelectEdge}
      />
    </>
  );
}

function Group({
  direction,
  draft,
  statusId,
  edit,
  anyTarget = false,
  onSelectEdge,
}: {
  direction: Direction;
  draft: WorkflowDraft;
  statusId: string;
  edit: (change: WorkflowEdit) => boolean;
  anyTarget?: boolean;
  onSelectEdge?: (from: string, to: string) => void;
}) {
  const outgoing = direction === "out";
  const [adding, setAdding] = useState(false);

  const byId = new Map(draft.statuses.map((status) => [status.id, status]));
  const self = byId.get(statusId);

  const others = draft.transitions
    .filter((edge) => (outgoing ? edge.from : edge.to) === statusId)
    .map((edge) => byId.get(outgoing ? edge.to : edge.from))
    .filter((status) => status !== undefined);

  const connected = new Set(others.map((status) => status.id));
  const candidates = draft.statuses.filter(
    (status) => status.id !== statusId && !connected.has(status.id),
  );
  const title = outgoing ? "Can move to" : "Can arrive from";

  function pair(otherId: string): [string, string] {
    return outgoing ? [statusId, otherId] : [otherId, statusId];
  }

  const Arrow = outgoing ? ArrowRightIcon : ArrowLeftIcon;

  return (
    <InspectorSection
      title={title}
      count={others.length}
      defaultOpen={!anyTarget}
      action={
        <IconButton
          label={
            outgoing
              ? `Add a transition out of ${self?.name ?? "this status"}`
              : `Add a transition into ${self?.name ?? "this status"}`
          }
          size="xs"
          disabled={candidates.length === 0}
          onClick={() => setAdding(true)}
        >
          <PlusIcon />
        </IconButton>
      }
    >
      {anyTarget && (
        <p className="text-ink-2 text-mini mb-1.5 flex items-center gap-1.5">
          <span className="bg-ink text-canvas text-micro rounded-full px-1.5 font-semibold">
            Any
          </span>
          Every other status can move here.
        </p>
      )}

      {others.length === 0 && !adding ? (
        <p
          className={cn(
            "text-mini",
            outgoing && self?.category !== "done"
              ? "text-status-orange"
              : "text-ink-3",
          )}
        >
          {outgoing
            ? self?.category === "done"
              ? "Nothing leads out — work here is finished."
              : "Work here can't move anywhere."
            : "No status leads here."}
        </p>
      ) : (
        <ul className="-mx-1 flex flex-col">
          {others.map((other) => {
            const [from, to] = pair(other.id);
            const lozenge = (
              <>
                <Arrow aria-hidden className="text-ink-3 size-3.5 shrink-0" />

                <span className="min-w-0 flex-1">
                  <StatusLozenge
                    name={other.name}
                    category={other.category}
                    hidden={other.is_hidden}
                  />
                </span>
              </>
            );

            return (
              <li
                key={other.id}
                className="group/edge hover:bg-wash rounded-control flex items-center gap-1 pr-0.5"
              >
                {onSelectEdge ? (
                  <button
                    type="button"
                    onClick={() => onSelectEdge(from, to)}
                    title="Open this transition"
                    className="focus-visible:ring-brand rounded-control flex min-w-0 flex-1 items-center gap-1.5 px-1 py-1 text-left outline-none focus-visible:ring-2"
                  >
                    {lozenge}
                  </button>
                ) : (
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 px-1 py-1">
                    {lozenge}
                  </span>
                )}

                <IconButton
                  label={`Remove transition ${
                    outgoing
                      ? `${self?.name ?? ""} to ${other.name}`
                      : `${other.name} to ${self?.name ?? ""}`
                  }`}
                  size="xs"
                  onClick={() =>
                    edit((next) => withTransitionRemoved(next, from, to))
                  }
                  className="opacity-0 group-hover/edge:opacity-100 focus-visible:opacity-100"
                >
                  <XIcon />
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}

      {adding && candidates.length > 0 && (
        <select
          autoFocus
          aria-label={
            outgoing ? "Add outgoing transition" : "Add incoming transition"
          }
          value=""
          onBlur={() => setAdding(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              // marks it for Modal, so Escape closes the picker and not the dialog
              event.preventDefault();
              setAdding(false);
            }
          }}
          onChange={(event) => {
            const [from, to] = pair(event.target.value);

            edit((next) => withTransitionAdded(next, from, to));
            setAdding(false);
          }}
          className={cn(SELECT, "mt-1.5")}
        >
          <option value="" disabled>
            {outgoing ? "Move to..." : "Arrive from..."}
          </option>

          {candidates.map((status) => (
            <option key={status.id} value={status.id}>
              {status.name}
            </option>
          ))}
        </select>
      )}

      {!outgoing && !anyTarget && candidates.length > 0 && (
        <button
          type="button"
          onClick={() => edit((next) => withTransitionsInto(next, statusId))}
          className="text-brand hover:bg-brand-soft focus-visible:ring-brand rounded-control text-mini mt-1.5 flex h-7 items-center gap-1 px-1.5 font-medium outline-none focus-visible:ring-2 [&_svg]:size-3.5"
        >
          <PlusIcon />
          Allow from every status
        </button>
      )}
    </InspectorSection>
  );
}
