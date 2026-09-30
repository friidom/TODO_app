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
            Publish {changes.length}{" "}
            {changes.length === 1 ? "change" : "changes"}
          </h3>

          <p className={cn(DIALOG_BODY, "mt-1")}>
            The workflow on {boardTitle} changes for everyone as soon as you
            publish. Work items follow the moves listed below.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {statuses.length > 0 && <Group title="Statuses" changes={statuses} />}

          {transitions.length > 0 && (
            <Group title="Transitions" changes={transitions} />
          )}

          {warnings.length > 0 && (
            <div className="border-status-orange/40 bg-status-orange/10 rounded-control text-ink-2 text-mini mt-3 flex gap-2 border px-3 py-2">
              <TriangleAlertIcon className="text-status-orange mt-px size-3.5 shrink-0" />

              <div>
                <p className="font-semibold">
                  Worth a look — publishing is still allowed:
                </p>

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
            Back to editing
          </button>

          <button
            type="button"
            disabled={pending}
            onClick={onPublish}
            className={DIALOG_CONFIRM}
          >
            {pending ? "Publishing..." : "Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Group({ title, changes }: { title: string; changes: DraftChange[] }) {
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
          {all ? "Show fewer" : `Show all ${changes.length}`}
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
          Add <Name>{change.name}</Name>
          {change.transitions > 0 && (
            <span className="text-ink-3">
              {" "}
              with {change.transitions} transition
              {change.transitions === 1 ? "" : "s"}
            </span>
          )}
        </>,
      );

    case "status-deleted":
      return row(
        <Trash2Icon />,
        "text-status-red",
        <>
          Delete <Name>{change.name}</Name>
          {change.workItems > 0 && change.movedTo && (
            <strong className="text-ink font-medium">
              {" "}
              — {workItems(change.workItems)} move to{" "}
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
          Rename <Name>{change.from}</Name> to <Name>{change.to}</Name>
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
          {change.hidden ? "stops taking new work" : "takes new work again"}
        </>,
      );

    case "status-column":
      return row(
        <SquareStackIcon />,
        "text-ink-3",
        <>
          <Name>{change.name}</Name>: {change.from ?? "not on the board"} →{" "}
          {change.to ?? "not on the board"}
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
