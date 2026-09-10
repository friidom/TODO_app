import { useId, useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";

import { FIELD_INPUT, FIELD_INPUT_INVALID } from "@/components/ui/fieldInput";
import { cn } from "@/utils/cn";

// Only `type` toggles, the value is never touched — swapping in a text clone or mirroring the value loses caret position and breaks password managers.
export default function PasswordInput({
  id,
  label,
  value,
  onChange,
  error,
  disabled,
  autoComplete,
  placeholder = "••••••••",
  hint,
  labelAction,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  autoComplete: string;
  placeholder?: string;
  hint?: string;
  labelAction?: React.ReactNode;
}) {
  const [revealed, setRevealed] = useState(false);

  const errorId = `${id}-error`;
  const hintId = useId();

  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={id}
          className="text-ink-2 text-meta font-medium select-none"
        >
          {label}
        </label>

        {labelAction}
      </div>

      <div className="relative">
        <input
          id={id}
          type={revealed ? "text" : "password"}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          className={cn(FIELD_INPUT, "pr-10", error && FIELD_INPUT_INVALID)}
        />

        <button
          type="button"
          onClick={() => setRevealed((on) => !on)}
          disabled={disabled}
          aria-label={revealed ? "Hide password" : "Show password"}
          aria-pressed={revealed}
          aria-controls={id}
          className="text-ink-3 hover:text-ink-2 focus-visible:ring-brand absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-[inherit] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-60"
        >
          {revealed ? (
            <EyeOffIcon className="size-4" />
          ) : (
            <EyeIcon className="size-4" />
          )}
        </button>
      </div>

      {hint && !error && (
        <p id={hintId} className="text-ink-3 text-xs">
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} className="text-status-red text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
