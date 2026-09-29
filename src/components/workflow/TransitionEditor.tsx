import { ArrowRightIcon, XIcon } from "lucide-react";

import IconButton from "@/components/ui/IconButton";
import {
  withTransitionAdded,
  withTransitionRemoved,
  type WorkflowDraft,
} from "@/services/workflow/draft";
import type { WorkflowEdit } from "@/services/workflow/usePublishWorkflow";

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
    <div className="grid gap-4 sm:grid-cols-2">
      <Group direction="out" draft={draft} statusId={statusId} edit={edit} />
      <Group direction="in" draft={draft} statusId={statusId} edit={edit} />
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

  function pair(otherId: string): [string, string] {
    return outgoing ? [statusId, otherId] : [otherId, statusId];
  }

  return (
    <section aria-label={outgoing ? "Outgoing transitions" : "Incoming transitions"}>
      <h4 className="text-ink-2 text-mini mb-1.5 font-semibold tracking-wide uppercase">
        {outgoing ? "Can move to" : "Can be reached from"}
      </h4>

      {others.length === 0 ? (
        <p className="text-ink-3 text-mini mb-2">
          {outgoing
            ? "Work in this status can't move anywhere."
            : "No status leads here."}
        </p>
      ) : (
        <ul className="mb-2 flex flex-col gap-1">
          {others.map((other) => (
            <li key={other.id} className="flex items-center gap-1.5">
              <ArrowRightIcon
                aria-hidden
                className={
                  outgoing ? "text-ink-3 size-3.5" : "text-ink-3 size-3.5 rotate-180"
                }
              />

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
                onClick={() =>
                  edit((next) => {
                    const [from, to] = pair(other.id);

                    return withTransitionRemoved(next, from, to);
                  })
                }
              >
                <XIcon />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      {candidates.length > 0 && (
        <select
          aria-label={outgoing ? "Add outgoing transition" : "Add incoming transition"}
          value=""
          onChange={(e) => {
            const [from, to] = pair(e.target.value);

            edit((next) => withTransitionAdded(next, from, to));
          }}
          className={SELECT}
        >
          <option value="" disabled>
            {outgoing ? "Add transition to..." : "Add transition from..."}
          </option>

          {candidates.map((status) => (
            <option key={status.id} value={status.id}>
              {status.name}
            </option>
          ))}
        </select>
      )}
    </section>
  );
}
