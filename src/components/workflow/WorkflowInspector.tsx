import { useTranslation } from "react-i18next";
import {
  MousePointerClickIcon,
  SplineIcon,
  TriangleAlertIcon,
  WaypointsIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import type { WorkflowDraft } from "@/services/workflow/draft";
import type { WorkflowWarning } from "@/services/workflow/draftChanges";
import type { WorkflowEdit } from "@/services/workflow/usePublishWorkflow";

import StatusInspector from "./StatusInspector";
import StatusLozenge from "./StatusLozenge";
import TransitionInspector from "./TransitionInspector";
import type { Selection } from "./WorkflowDiagram";

export default function WorkflowInspector({
  draft,
  selection,
  counts,
  storedIds,
  anyTargets,
  warnings,
  enforced,
  edit,
  onSelect,
}: {
  draft: WorkflowDraft;
  selection: Selection;
  counts: ReadonlyMap<string, number>;
  storedIds: ReadonlySet<string>;
  anyTargets: ReadonlySet<string>;
  warnings: WorkflowWarning[];
  enforced: boolean;
  edit: (change: WorkflowEdit) => boolean;
  onSelect: (selection: Selection) => void;
}) {
  const { t } = useTranslation();

  if (selection?.kind === "status") {
    return (
      <StatusInspector
        key={selection.id}
        draft={draft}
        statusId={selection.id}
        counts={counts}
        storedIds={storedIds}
        anyTarget={anyTargets.has(selection.id)}
        warnings={warnings.filter(
          (warning) => warning.statusId === selection.id,
        )}
        edit={edit}
        onSelectEdge={(from, to) => onSelect({ kind: "edge", from, to })}
        onClose={() => onSelect(null)}
      />
    );
  }

  if (selection?.kind === "edge") {
    return (
      <TransitionInspector
        key={`${selection.from}>${selection.to}`}
        draft={draft}
        from={selection.from}
        to={selection.to}
        counts={counts}
        enforced={enforced}
        edit={edit}
        onSelect={onSelect}
        onClose={() => onSelect(null)}
      />
    );
  }

  const byId = new Map(draft.statuses.map((status) => [status.id, status]));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
      <p className="text-ink text-meta font-semibold">
        {t("workflow.inspectorEmpty")}
      </p>

      <ul className="text-ink-2 text-mini mt-3 grid gap-2.5">
        <Tip icon={<MousePointerClickIcon />}>{t("workflow.tipStatus")}</Tip>
        <Tip icon={<WaypointsIcon />}>{t("workflow.tipArrow")}</Tip>
        <Tip icon={<SplineIcon />}>{t("workflow.tipConnect")}</Tip>
      </ul>

      <dl className="border-hairline text-mini mt-4 grid grid-cols-3 gap-2 border-t pt-3">
        <Stat label={t("review.statuses")} value={draft.statuses.length} />
        <Stat
          label={t("review.transitions")}
          value={draft.transitions.length}
        />
        <Stat label={t("workflow.fromAny")} value={anyTargets.size} />
      </dl>

      {warnings.length > 0 && (
        <div className="mt-4">
          <p className="text-ink-2 text-mini flex items-center gap-1.5 font-semibold">
            <TriangleAlertIcon className="text-status-orange size-3.5" />
            {t("workflow.needsAttention")}
          </p>

          <ul className="mt-1.5 grid gap-1">
            {warnings.map((warning) => {
              const status = byId.get(warning.statusId);

              if (!status) return null;

              return (
                <li key={`${warning.kind}:${warning.statusId}`}>
                  <button
                    type="button"
                    onClick={() =>
                      onSelect({ kind: "status", id: warning.statusId })
                    }
                    className="hover:bg-wash focus-visible:ring-brand rounded-control text-ink-2 text-mini flex w-full items-center gap-2 px-1.5 py-1 text-left outline-none focus-visible:ring-2"
                  >
                    <StatusLozenge
                      name={status.name}
                      category={status.category}
                      hidden={status.is_hidden}
                    />
                    <span className="truncate">
                      {warning.kind === "no-way-out"
                        ? t("workflow.cantMoveAnywhereShort")
                        : t("workflow.nothingLeadsHereShort")}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function Tip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex gap-2 leading-relaxed">
      <span className="text-ink-3 mt-0.5 shrink-0 [&_svg]:size-3.5">
        {icon}
      </span>
      <span>{children}</span>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-ink-3">{label}</dt>
      <dd className="text-ink text-base font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
