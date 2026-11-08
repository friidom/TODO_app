import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutationState } from "@tanstack/react-query";
import { CheckIcon, CircleAlertIcon, Loader2 } from "lucide-react";

import {
  latestWrite,
  writtenTodoId,
  type SaveState,
  type WriteRecord,
} from "@/services/todos/saveState";
import { cn } from "@/utils/cn";

// The delays are presentation only: no write waits on them. A save that
// finishes inside SHOW_AFTER never flashes "Saving…".
const SHOW_AFTER = 300;
const SAVED_FOR = 1500;
const FAILED_FOR = 5000;

export default function SaveIndicator({ todoId }: { todoId: string }) {
  const { t } = useTranslation();
  const writes = useMutationState({
    filters: {
      mutationKey: ["todo-write"],
      predicate: (mutation) =>
        writtenTodoId(mutation.state.variables, mutation.options.scope?.id) ===
        todoId,
    },
    select: (mutation): WriteRecord => ({
      status: mutation.state.status,
      submittedAt: mutation.state.submittedAt,
    }),
  });

  const latest = latestWrite(writes);
  const state: SaveState =
    latest === null || latest.status === "idle"
      ? "idle"
      : latest.status === "pending"
        ? "saving"
        : latest.status === "error"
          ? "failed"
          : "saved";

  const [shown, setShown] = useState<SaveState>("idle");

  useEffect(() => {
    const delay = state === "saving" ? SHOW_AFTER : 0;
    const show = setTimeout(() => setShown(state), delay);
    const hide =
      state === "saved" || state === "failed"
        ? setTimeout(
            () => setShown("idle"),
            state === "saved" ? SAVED_FOR : FAILED_FOR,
          )
        : undefined;

    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [state, latest?.submittedAt]);

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "text-mini mr-1 hidden h-6 items-center gap-1 font-medium transition-opacity duration-150 sm:inline-flex",
        shown === "idle" && "opacity-0",
        shown === "failed" ? "text-status-red" : "text-ink-3",
      )}
    >
      {shown === "saving" && (
        <>
          <Loader2 aria-hidden className="size-3.5 motion-safe:animate-spin" />
          {t("task.saving")}
        </>
      )}
      {shown === "saved" && (
        <>
          <CheckIcon aria-hidden className="text-status-green size-3.5" />
          {t("task.saved")}
        </>
      )}
      {shown === "failed" && (
        <>
          <CircleAlertIcon aria-hidden className="size-3.5" />
          {t("task.saveFailed")}
        </>
      )}
    </span>
  );
}
