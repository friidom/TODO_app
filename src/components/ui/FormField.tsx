import { useId, type ReactNode } from "react";
import { ChevronDownIcon } from "lucide-react";

import { FIELD_INPUT } from "@/components/ui/fieldInput";
import { cn } from "@/utils/cn";

export function Field({
  label,
  required = false,
  error,
  hint,
  action,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string | null;
  hint?: string;
  action?: ReactNode;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-h-5 items-center justify-between gap-2">
        <label htmlFor={id} className="text-ink-2 text-sm font-medium">
          {label}
          {required && (
            <span aria-hidden className="text-status-red ml-0.5">
              *
            </span>
          )}
        </label>

        {action}
      </div>

      {children(id, note ? noteId : undefined)}

      {note && (
        <p
          id={noteId}
          role={error ? "alert" : undefined}
          className={cn("text-xs", error ? "text-status-red" : "text-ink-3")}
        >
          {note}
        </p>
      )}
    </div>
  );
}

export function SelectBox({
  id,
  value,
  onChange,
  autoFocus,
  className,
  children,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          FIELD_INPUT,
          "h-10 cursor-pointer appearance-none pr-9",
          className,
        )}
      >
        {children}
      </select>

      <ChevronDownIcon
        aria-hidden
        className="text-ink-3 pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
      />
    </div>
  );
}
