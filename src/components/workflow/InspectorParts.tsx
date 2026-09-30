import { useState, type ReactNode } from "react";
import { ChevronRightIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import IconButton from "@/components/ui/IconButton";
import {
  CATEGORY_OPTIONS,
  categoryLabelKey,
  categoryOf,
  type ColumnCategory,
} from "@/constants/columns";
import { cn } from "@/utils/cn";

import { SELECT } from "./workflowChrome";

export function InspectorHeader({
  eyebrow,
  children,
  onClose,
}: {
  eyebrow: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="border-hairline flex items-start gap-2 border-b px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-ink-3 text-micro font-semibold tracking-wide uppercase">
          {eyebrow}
        </p>

        <div className="mt-1 flex min-w-0 items-center gap-1.5">{children}</div>
      </div>

      <IconButton label="Close details" size="xs" onClick={onClose}>
        <XIcon />
      </IconButton>
    </div>
  );
}

export function InspectorSection({
  title,
  count,
  action,
  collapsible = true,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const shown = !collapsible || open;

  const heading = (
    <>
      {collapsible && (
        <ChevronRightIcon
          aria-hidden
          className={cn(
            "text-ink-3 size-3.5 shrink-0 transition-transform duration-150",
            open && "rotate-90",
          )}
        />
      )}

      <span className="text-ink-2 text-mini font-semibold tracking-wide uppercase">
        {title}
      </span>

      {count !== undefined && (
        <span className="bg-wash-strong text-ink-2 text-micro rounded px-1.5 leading-4 font-semibold tabular-nums">
          {count}
        </span>
      )}
    </>
  );

  return (
    <section
      aria-label={title}
      className="border-hairline border-b last:border-b-0"
    >
      <div className="flex min-h-9 items-center gap-1 px-2">
        {collapsible ? (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
            className="hover:bg-wash-strong focus-visible:ring-brand rounded-control flex min-w-0 flex-1 items-center gap-1.5 px-1 py-1 outline-none focus-visible:ring-2"
          >
            {heading}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-1.5 px-1 py-1">
            {heading}
          </div>
        )}

        {action}
      </div>

      {shown && <div className="px-3 pb-3">{children}</div>}
    </section>
  );
}

export function Field({
  label,
  action,
  children,
}: {
  label: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <span className="text-ink-3 text-mini font-medium">{label}</span>
        {action}
      </div>

      <div className="flex min-w-0 flex-col">{children}</div>
    </div>
  );
}

export function CategoryPicker({
  value,
  onChange,
}: {
  value: ColumnCategory;
  onChange: (category: ColumnCategory) => void;
}) {
  const { t } = useTranslation();

  return (
    <span className="relative flex items-center">
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-2.5 size-2 rounded-full",
          categoryOf(value).dot,
        )}
      />

      <select
        aria-label="Status category"
        value={value}
        onChange={(event) => onChange(event.target.value as ColumnCategory)}
        className={cn(SELECT, "pl-7")}
      >
        {CATEGORY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {t(categoryLabelKey(option.value))}
          </option>
        ))}
      </select>
    </span>
  );
}
