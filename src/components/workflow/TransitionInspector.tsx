import { useState, type ReactNode } from "react";
import {
  ArrowDownIcon,
  ArrowLeftRightIcon,
  ArrowRightIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";

import {
  hasEdge,
  withTransitionAdded,
  withTransitionRemoved,
  withTransitionRetargeted,
  workItemCount,
  type WorkflowDraft,
} from "@/services/workflow/draft";
import type { WorkflowEdit } from "@/services/workflow/usePublishWorkflow";

import { Field, InspectorHeader, InspectorSection } from "./InspectorParts";
import StatusLozenge from "./StatusLozenge";
import type { Selection } from "./WorkflowDiagram";
import { MOD_KEY, SELECT, workItems } from "./workflowChrome";

const LINK =
  "text-brand hover:bg-brand-soft focus-visible:ring-brand rounded-control text-mini flex h-7 items-center gap-1 px-1.5 font-medium outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-3.5";

export default function TransitionInspector({
  draft,
  from: fromId,
  to: toId,
  counts,
  enforced,
  edit,
  onSelect,
  onClose,
}: {
  draft: WorkflowDraft;
  from: string;
  to: string;
  counts: ReadonlyMap<string, number>;
  enforced: boolean;
  edit: (change: WorkflowEdit) => boolean;
  onSelect: (selection: Selection) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const from = draft.statuses.find((it) => it.id === fromId);
  const to = draft.statuses.find((it) => it.id === toId);

  if (!from || !to) return null;

  const reverse = hasEdge(draft, to.id, from.id);
  const waiting = workItemCount(draft, from.id, counts);

  function retarget(next: { from: string; to: string }) {
    if (
      edit((current) =>
        withTransitionRetargeted(current, { from: fromId, to: toId }, next),
      )
    ) {
      setError(null);
      onSelect({ kind: "edge", ...next });

      return;
    }

    setError(
      next.from === next.to
        ? "A status can't move to itself."
        : hasEdge(draft, next.from, next.to)
          ? "That transition already exists."
          : "That change can't be made.",
    );
  }

  const refusals: ReactNode[] = [];

  if (to.is_hidden) {
    refusals.push(
      `${to.name} is hidden and takes no new work, so the board refuses this move.`,
    );
  }

  if (to.column_id === null) {
    refusals.push(
      `${to.name} is not on the board, so the board refuses this move.`,
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <InspectorHeader eyebrow="Transition" onClose={onClose}>
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <StatusLozenge
            name={from.name}
            category={from.category}
            hidden={from.is_hidden}
          />
          <ArrowRightIcon
            aria-hidden
            className="text-ink-3 size-3.5 shrink-0"
          />
          <StatusLozenge
            name={to.name}
            category={to.category}
            hidden={to.is_hidden}
          />
        </span>
      </InspectorHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <InspectorSection title="Path" collapsible={false}>
          <div className="grid gap-1.5">
            <Field label="From">
              <StatusSelect
                label="From status"
                draft={draft}
                value={from.id}
                onChange={(id) => retarget({ from: id, to: to.id })}
              />
            </Field>

            <ArrowDownIcon aria-hidden className="text-ink-3 mx-auto size-4" />

            <Field label="To">
              <StatusSelect
                label="To status"
                draft={draft}
                value={to.id}
                onChange={(id) => retarget({ from: from.id, to: id })}
              />
            </Field>

            {error && (
              <p role="alert" className="text-status-red text-mini">
                {error}
              </p>
            )}

            <button
              type="button"
              disabled={reverse}
              title={
                reverse ? "The reverse transition already exists" : undefined
              }
              onClick={() => retarget({ from: to.id, to: from.id })}
              className={LINK}
            >
              <ArrowLeftRightIcon />
              Reverse direction
            </button>
          </div>
        </InspectorSection>

        <InspectorSection title="Other direction" collapsible={false}>
          {reverse ? (
            <button
              type="button"
              onClick={() =>
                onSelect({ kind: "edge", from: to.id, to: from.id })
              }
              className="hover:bg-wash focus-visible:ring-brand rounded-control -mx-1 flex w-[calc(100%+0.5rem)] items-center gap-1.5 px-1 py-1 text-left outline-none focus-visible:ring-2"
            >
              <StatusLozenge name={to.name} category={to.category} />
              <ArrowRightIcon aria-hidden className="text-ink-3 size-3.5" />
              <StatusLozenge name={from.name} category={from.category} />
              <span className="text-brand text-mini ml-auto font-medium">
                Open
              </span>
            </button>
          ) : (
            <>
              <p className="text-ink-3 text-mini">
                Work in {to.name} can't come back to {from.name} this way.
              </p>

              <button
                type="button"
                onClick={() =>
                  edit((current) =>
                    withTransitionAdded(current, to.id, from.id),
                  )
                }
                className={`${LINK} mt-1`}
              >
                <PlusIcon />
                Also allow {to.name} → {from.name}
              </button>
            </>
          )}
        </InspectorSection>

        <InspectorSection title="Who can use it" collapsible={false}>
          <ul className="text-ink-2 text-mini grid list-disc gap-1.5 pl-4">
            <li>Anyone who can edit work items on this board.</li>

            <li>
              {waiting === 0
                ? `No work items are in ${from.name} right now.`
                : `${workItems(waiting)} in ${from.name} can take it now.`}
            </li>

            {!enforced && (
              <li className="text-status-orange">
                Workflow rules are off for this board, so every move is allowed
                regardless.
              </li>
            )}

            {refusals.map((text, index) => (
              <li key={index} className="text-status-orange">
                {text}
              </li>
            ))}
          </ul>
        </InspectorSection>
      </div>

      <div className="border-hairline border-t p-3">
        <button
          type="button"
          onClick={() => {
            if (
              edit((current) => withTransitionRemoved(current, from.id, to.id))
            ) {
              onClose();
            }
          }}
          className="text-status-red hover:bg-status-red/10 rounded-control text-meta flex h-8 w-full items-center gap-1.5 px-2 font-medium [&_svg]:size-4"
        >
          <Trash2Icon />
          Delete transition
          <span className="text-ink-3 text-mini ml-auto font-normal">
            Undo with {MOD_KEY}Z
          </span>
        </button>
      </div>
    </div>
  );
}

function StatusSelect({
  label,
  draft,
  value,
  onChange,
}: {
  label: string;
  draft: WorkflowDraft;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={SELECT}
    >
      {draft.statuses.map((status) => (
        <option key={status.id} value={status.id}>
          {status.name}
          {status.is_hidden ? " (hidden)" : ""}
          {status.column_id === null ? " (not on the board)" : ""}
        </option>
      ))}
    </select>
  );
}
