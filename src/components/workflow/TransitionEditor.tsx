import { useState } from "react";
import { ChevronRightIcon, PlusIcon, XIcon } from "lucide-react";

import IconButton from "@/components/ui/IconButton";
import {
  withTransitionAdded,
  withTransitionRemoved,
  type WorkflowDraft,
} from "@/services/workflow/draft";
import type { WorkflowEdit } from "@/services/workflow/usePublishWorkflow";
import { cn } from "@/utils/cn";

import StatusLozenge from "./StatusLozenge";
import { SELECT } from "./workflowChrome";

type Direction = "out" | "in";

// One status's edges, read from the same draft.transitions the diagram draws:
// adding or removing here is adding or removing that exact A -> B.
export default function TransitionEditor({
  draft,
  statusId,
  edit,
}: {
  draft: WorkflowDraft;
  statusId: string;
  edit: (change: WorkflowEdit) => boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <h4 className="text-ink text-meta font-semibold">Transitions</h4>

        <p className="text-ink-3 text-mini mt-0.5 leading-relaxed">
          Transitions are the moves work can make out of and into this status.
        </p>
      </div>

      <div className="border-hairline rounded-control divide-hairline divide-y border">
        <Group direction="out" draft={draft} statusId={statusId} edit={edit} />
        <Group direction="in" draft={draft} statusId={statusId} edit={edit} />
      </div>
    </div>
  );
}

function Group({
  direction,
  draft,
  statusId,
  edit,
}: {
  direction: Direction;
  draft: WorkflowDraft;
  statusId: string;
  edit: (change: WorkflowEdit) => boolean;
}) {
  const outgoing = direction === "out";
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);

  const byId = new Map(draft.statuses.map((status) => [status.id, status]));

  const others = draft.transitions
    .filter((edge) => (outgoing ? edge.from : edge.to) === statusId)
    .map((edge) => byId.get(outgoing ? edge.to : edge.from))
    .filter((status) => status !== undefined);

  const connected = new Set(others.map((status) => status.id));
  const candidates = draft.statuses.filter(
    (status) => status.id !== statusId && !connected.has(status.id),
  );
  const self = byId.get(statusId);
  const label = outgoing ? "Outgoing" : "Incoming";

  function pair(otherId: string): [string, string] {
    return outgoing ? [statusId, otherId] : [otherId, statusId];
  }

  return (
    <section aria-label={`${label} transitions`}>
      <div className="flex items-center gap-1 px-1.5 py-1.5">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="text-ink hover:bg-wash-strong focus-visible:ring-brand rounded-control text-meta flex min-w-0 flex-1 items-center gap-1.5 px-1 py-1 font-medium outline-none focus-visible:ring-2"
        >
          <ChevronRightIcon
            aria-hidden
            className={cn(
              "text-ink-3 size-4 shrink-0 transition-transform duration-150",
              open && "rotate-90",
            )}
          />

          <span>{label}</span>

          <span className="bg-wash-strong text-ink-2 text-micro rounded px-1.5 leading-4 font-semibold tabular-nums">
            {others.length}
          </span>
        </button>

        <IconButton
          label={
            outgoing
              ? `Add a transition out of ${self?.name ?? "this status"}`
              : `Add a transition into ${self?.name ?? "this status"}`
          }
          size="xs"
          disabled={candidates.length === 0}
          onClick={() => {
            setOpen(true);
            setAdding(true);
          }}
        >
          <PlusIcon />
        </IconButton>
      </div>

      {open && (
        <div className="px-2 pb-2">
          {others.length === 0 && !adding ? (
            <p className="text-ink-3 text-mini px-1 pb-1">
              {outgoing
                ? "Work here cannot move anywhere."
                : "No status leads here."}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {others.map((other) => (
                <li
                  key={other.id}
                  className="hover:bg-wash rounded-control group/edge flex items-center gap-1.5 py-0.5 pl-1"
                >
                  <span className="min-w-0 flex-1">
                    <StatusLozenge
                      name={other.name}
                      category={other.category}
                      hidden={other.is_hidden}
                    />
                  </span>

                  <IconButton
                    label={`Remove transition ${
                      outgoing
                        ? `${self?.name ?? ""} to ${other.name}`
                        : `${other.name} to ${self?.name ?? ""}`
                    }`}
                    size="xs"
                    onClick={() =>
                      edit((next) => {
                        const [from, to] = pair(other.id);

                        return withTransitionRemoved(next, from, to);
                      })
                    }
                    className="opacity-0 group-hover/edge:opacity-100 focus-visible:opacity-100"
                  >
                    <XIcon />
                  </IconButton>
                </li>
              ))}
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
              onChange={(event) => {
                const [from, to] = pair(event.target.value);

                edit((next) => withTransitionAdded(next, from, to));
                setAdding(false);
              }}
              className={cn(SELECT, "mt-1.5")}
            >
              <option value="" disabled>
                {outgoing ? "Move to..." : "Reached from..."}
              </option>

              {candidates.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </section>
  );
}
