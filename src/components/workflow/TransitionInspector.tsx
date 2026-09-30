import { useTranslation } from "react-i18next";
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
  // A key rather than text, so the message follows a language switch.
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

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
        ? "workflow.selfTransition"
        : hasEdge(draft, next.from, next.to)
          ? "workflow.transitionExists"
          : "workflow.changeRefused",
    );
  }

  const refusals: ReactNode[] = [];

  if (to.is_hidden) {
    refusals.push(t("workflow.refuseHidden", { name: to.name }));
  }

  if (to.column_id === null) {
    refusals.push(t("workflow.refuseUnmapped", { name: to.name }));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <InspectorHeader eyebrow={t("workflow.transition")} onClose={onClose}>
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
        <InspectorSection title={t("workflow.path")} collapsible={false}>
          <div className="grid gap-1.5">
            <Field label={t("workflow.from")}>
              <StatusSelect
                label={t("workflow.fromStatus")}
                draft={draft}
                value={from.id}
                onChange={(id) => retarget({ from: id, to: to.id })}
              />
            </Field>

            <ArrowDownIcon aria-hidden className="text-ink-3 mx-auto size-4" />

            <Field label={t("workflow.to")}>
              <StatusSelect
                label={t("workflow.toStatus")}
                draft={draft}
                value={to.id}
                onChange={(id) => retarget({ from: from.id, to: id })}
              />
            </Field>

            {error && (
              <p role="alert" className="text-status-red text-mini">
                {t(error)}
              </p>
            )}

            <button
              type="button"
              disabled={reverse}
              title={reverse ? t("workflow.reverseExists") : undefined}
              onClick={() => retarget({ from: to.id, to: from.id })}
              className={LINK}
            >
              <ArrowLeftRightIcon />
              {t("workflow.reverse")}
            </button>
          </div>
        </InspectorSection>

        <InspectorSection
          title={t("workflow.otherDirection")}
          collapsible={false}
        >
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
                {t("common.open")}
              </span>
            </button>
          ) : (
            <>
              <p className="text-ink-3 text-mini">
                {t("workflow.cantComeBack", { to: to.name, from: from.name })}
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
                {t("workflow.alsoAllow", { to: to.name, from: from.name })}
              </button>
            </>
          )}
        </InspectorSection>

        <InspectorSection title={t("workflow.whoCanUse")} collapsible={false}>
          <ul className="text-ink-2 text-mini grid list-disc gap-1.5 pl-4">
            <li>{t("workflow.anyoneWhoCanEdit")}</li>

            <li>
              {waiting === 0
                ? t("workflow.noneWaiting", { name: from.name })
                : t("workflow.waiting", {
                    items: workItems(waiting),
                    name: from.name,
                    count: waiting,
                  })}
            </li>

            {!enforced && (
              <li className="text-status-orange">{t("workflow.rulesOff")}</li>
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
          {t("workflow.deleteTransition")}
          <span className="text-ink-3 text-mini ml-auto font-normal">
            {t("workflow.undoWith", { keys: `${MOD_KEY}Z` })}
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
  const { t } = useTranslation();

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
          {status.is_hidden ? ` (${t("workflow.hiddenLower")})` : ""}
          {status.column_id === null
            ? ` (${t("workflow.notOnBoardLower")})`
            : ""}
        </option>
      ))}
    </select>
  );
}
