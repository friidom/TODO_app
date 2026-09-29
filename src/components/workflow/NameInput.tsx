import { useRef, useState, type Ref } from "react";

import { cn } from "@/utils/cn";

// Enter and blur commit a valid name, Escape cancels. A name that is empty,
// unchanged or refused by `validate` cancels on blur rather than trapping
// focus, and Enter on a refused one keeps the field open with the reason.
export default function NameInput({
  initial = "",
  label,
  placeholder,
  validate,
  onSubmit,
  onCancel,
  autoFocus = true,
  ref,
  className,
}: {
  initial?: string;
  label: string;
  placeholder?: string;
  validate?: (name: string) => string | null;
  onSubmit: (name: string) => void;
  onCancel: () => void;
  autoFocus?: boolean;
  ref?: Ref<HTMLInputElement>;
  className?: string;
}) {
  const [value, setValue] = useState(initial);
  // Unmounting a focused input can fire blur after Enter already committed.
  const settled = useRef(false);

  const name = value.trim();
  const error = name && name !== initial.trim() ? validate?.(name) : null;

  function settle(commit: boolean) {
    if (settled.current) return;

    settled.current = true;

    if (commit && name && name !== initial.trim() && !error) onSubmit(name);
    else onCancel();
  }

  return (
    <div className={cn("relative min-w-0", className)}>
      <input
        ref={ref}
        autoFocus={autoFocus}
        aria-label={label}
        aria-invalid={!!error}
        placeholder={placeholder}
        maxLength={60}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => settle(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();

            if (!error) settle(true);
          }

          if (e.key === "Escape") {
            // Marks it for Modal, so Escape cancels the edit, not the dialog.
            e.preventDefault();
            settle(false);
          }
        }}
        className={cn(
          "border-brand/60 bg-elevated text-ink rounded-control ring-brand/15 text-meta placeholder:text-ink-3 h-7 w-full border px-2 font-medium ring-2 outline-none",
          error && "border-status-red/60 ring-status-red/15",
        )}
      />

      {error && (
        <p role="alert" className="text-status-red text-mini mt-1 leading-snug">
          {error}
        </p>
      )}
    </div>
  );
}
