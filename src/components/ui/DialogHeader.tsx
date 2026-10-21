import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { XIcon } from "lucide-react";

import IconButton from "@/components/ui/IconButton";
import { DIALOG_BODY, DIALOG_TITLE } from "@/components/ui/dialogChrome";
import { cn } from "@/utils/cn";

export default function DialogHeader({
  title,
  description,
  danger = false,
  onClose,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  danger?: boolean;
  onClose: () => void;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <header className={cn("mb-5 flex items-start gap-2.5", className)}>
      {danger && <DangerDiamond />}

      <div className="min-w-0 flex-1">
        <h2 className={DIALOG_TITLE}>{title}</h2>
        {description && (
          <div className={cn(DIALOG_BODY, "mt-1")}>{description}</div>
        )}
      </div>

      <IconButton
        label={t("common.close")}
        size="sm"
        tooltip={false}
        onClick={onClose}
        className="-mt-1 -mr-2"
      >
        <XIcon />
      </IconButton>
    </header>
  );
}

// Jira's danger glyph, a rounded red diamond — lucide has no diamond-alert.
function DangerDiamond() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      className="text-status-red -my-px shrink-0"
      aria-hidden="true"
    >
      <rect
        x="4.5"
        y="4.5"
        width="15"
        height="15"
        rx="3"
        transform="rotate(45 12 12)"
        fill="currentColor"
      />
      <path
        d="M12 7.5v5.5"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16.6" r="1.3" fill="white" />
    </svg>
  );
}
