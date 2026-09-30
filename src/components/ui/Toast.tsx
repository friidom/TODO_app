import { useTranslation } from "react-i18next";
import { CircleAlert, CircleCheck, X } from "lucide-react";

import { cn } from "@/utils/cn";
import type { ToastMessage } from "@/stores/toasts";

interface ToastProps {
  toast: ToastMessage;
  onDismiss: () => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const { t } = useTranslation();
  const isError = toast.variant === "error";
  const Icon = isError ? CircleAlert : CircleCheck;

  return (
    <div
      className={cn(
        "bg-popover text-popover-foreground shadow-e3 pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border px-4 py-3",
        isError ? "border-destructive" : "border-border",
      )}
    >
      {/* Colour alone would not distinguish the two variants. */}
      <Icon
        size={18}
        aria-hidden
        className={cn(
          "mt-0.5 shrink-0",
          isError ? "text-destructive" : "text-muted-foreground",
        )}
      />

      <p className="min-w-0 flex-1 text-sm wrap-break-word">
        <span className="sr-only">
          {isError ? t("toast.error") : t("toast.success")}
        </span>
        {toast.message}
      </p>

      <button
        type="button"
        onClick={onDismiss}
        aria-label={t("toast.dismiss")}
        className="text-muted-foreground hover:bg-muted hover:text-foreground -mr-1 shrink-0 cursor-pointer rounded p-1 transition"
      >
        <X size={16} />
      </button>
    </div>
  );
}
