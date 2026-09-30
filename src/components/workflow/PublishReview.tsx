import { useState, type ReactNode } from "react";
import {
  ArrowRightIcon,
  EyeIcon,
  EyeOffIcon,
  MinusIcon,
  PencilIcon,
  PlusIcon,
  SquareStackIcon,
  TagIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  DIALOG_BODY,
  DIALOG_CANCEL,
  DIALOG_CONFIRM,
  DIALOG_ERROR,
  DIALOG_TITLE,
} from "@/components/ui/dialogChrome";
import { categoryLabelKey } from "@/constants/columns";
import type { DraftChange } from "@/services/workflow/draftChanges";
import { cn } from "@/utils/cn";

import { workItems } from "./workflowChrome";

const FOLDED = 8;

// Rendered inside the editor rather than as a second Modal: two Modals both
// close on the same Escape, which would take the editor with it.
export default function PublishReview({
  boardTitle,
  changes,
  warnings,
  pending,
  error,
  onBack,
  onPublish,
}: {
  boardTitle: string;
  changes: DraftChange[];
  warnings: string[];
  pending: boolean;
  error: string | null;
  onBack: () => void;
  onPublish: () => void;
}) {
  const { t } = useTranslation();
  const statuses = changes.filter((change) => change.kind.startsWith("status"));
  const transitions = changes.filter((change) =>
    change.kind.startsWith("transition"),
  );

  return (
    <div
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onBack();
      }}
      className="bg-canvas/70 absolute inset-0 z-50 grid place-items-center p-4 backdrop-blur-[2px]"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="publish-review-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();

            if (!pending) onBack();
          }
        }}
        className="border-hairline bg-surface rounded-surface shadow-e3 flex max-h-full w-[min(34rem,100%)] flex-col border"
      >
        <div className="border-hairline border-b px-5 pt-5 pb-3">
          <h3 id="publish-review-title" className={DIALOG_TITLE}>
            {t("review.title", { count: changes.length })}
          </h3>

          <p className={cn(DIALOG_BODY, "mt-1")}>
            {t("review.body", { board: boardTitle })}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {statuses.length > 0 && (
            <Group title={t("review.statuses")} changes={statuses} />
          )}

          {transitions.length > 0 && (
            <Group title={t("review.transitions")} changes={transitions} />
          )}

          {warnings.length > 0 && (
            <div className="border-status-orange/40 bg-status-orange/10 rounded-control text-ink-2 text-mini mt-3 flex gap-2 border px-3 py-2">
              <TriangleAlertIcon className="text-status-orange mt-px size-3.5 shrink-0" />

              <div>
                <p className="font-semibold">{t("review.worthALook")}</p>

                <ul className="mt-1 grid list-disc gap-0.5 pl-4">
                  {warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className={DIALOG_ERROR}>
              {error}
            </p>
          )}
        </div>

        <div className="border-hairline flex justify-end gap-2 border-t px-5 py-3">
          <button
            type="button"
            autoFocus
            disabled={pending}
            onClick={onBack}
            className={DIALOG_CANCEL}
          >
            {t("review.backToEditing")}
          </button>

          <button
            type="button"
            disabled={pending}
            onClick={onPublish}
            className={DIALOG_CONFIRM}
          >
            {pending ? t("workflow.publishing") : t("workflow.publish")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Group({ title, changes }: { title: string; changes: DraftChange[] }) {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  const shown = all ? changes : changes.slice(0, FOLDED);

  return (
    <section className="py-2">
      <h4 className="text-ink-3 text-micro mb-1.5 font-semibold tracking-wide uppercase">
        {title}
      </h4>

      <ul className="grid gap-1">
        {shown.map((change, index) => (
          <ChangeRow key={index} change={change} />
        ))}
      </ul>

      {changes.length > FOLDED && (
        <button
          type="button"
          onClick={() => setAll((current) => !current)}
          className="text-brand text-mini mt-1 font-medium hover:underline"
        >
          {all
            ? t("review.showFewer")
            : t("review.showAll", { count: changes.length })}
        </button>
      )}
    </section>
  );
}

function ChangeRow({ change }: { change: DraftChange }) {
  const { t } = useTranslation();

  const row = (icon: ReactNode, tone: string, children: ReactNode) => (
    <li className="text-ink-2 text-meta flex items-start gap-2 leading-snug">
      <span className={cn("mt-0.5 shrink-0 [&_svg]:size-3.5", tone)}>
        {icon}
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  );

  switch (change.kind) {
    case "status-added":
      return row(
        <PlusIcon />,
        "text-status-green",
        <>
          {t("review.add")} <Name>{change.name}</Name>
          {change.transitions > 0 && (
            <span className="text-ink-3">
              {" "}
              {t("review.withTransitions", { count: change.transitions })}
            </span>
          )}
        </>,
      );

    case "status-deleted":
      return row(
        <Trash2Icon />,
        "text-status-red",
        <>
          {t("review.delete")} <Name>{change.name}</Name>
          {change.workItems > 0 && change.movedTo && (
            <strong className="text-ink font-medium">
              {" "}
              —{" "}
              {t("review.moveTo", {
                items: workItems(change.workItems),
                count: change.workItems,
              })}{" "}
              <Name>{change.movedTo}</Name>
            </strong>
          )}
        </>,
      );

    case "status-renamed":
      return row(
        <PencilIcon />,
        "text-ink-3",
        <>
          {t("review.rename")} <Name>{change.from}</Name> {t("review.to")}{" "}
          <Name>{change.to}</Name>
        </>,
      );

    case "status-category":
      return row(
        <TagIcon />,
        "text-ink-3",
        <>
          <Name>{change.name}</Name>: {t(categoryLabelKey(change.from))} →{" "}
          {t(categoryLabelKey(change.to))}
        </>,
      );

    case "status-visibility":
      return row(
        change.hidden ? <EyeOffIcon /> : <EyeIcon />,
        "text-ink-3",
        <>
          <Name>{change.name}</Name>{" "}
          {change.hidden
            ? t("review.stopsTakingWork")
            : t("review.takesWorkAgain")}
        </>,
      );

    case "status-column":
      return row(
        <SquareStackIcon />,
        "text-ink-3",
        <>
          <Name>{change.name}</Name>: {change.from ?? t("review.notOnBoard")} →{" "}
          {change.to ?? t("review.notOnBoard")}
        </>,
      );

    case "transition-added":
    case "transition-removed":
      return row(
        change.kind === "transition-added" ? <PlusIcon /> : <MinusIcon />,
        change.kind === "transition-added"
          ? "text-status-green"
          : "text-status-red",
        <span className="inline-flex flex-wrap items-center gap-1">
          <Name>{change.from}</Name>
          <ArrowRightIcon aria-hidden className="text-ink-3 size-3" />
          <Name>{change.to}</Name>
        </span>,
      );
  }
}

function Name({ children }: { children: ReactNode }) {
  return <span className="text-ink font-medium">{children}</span>;
}
