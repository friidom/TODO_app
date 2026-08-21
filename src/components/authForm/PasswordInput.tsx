import { useId, useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";

import { FIELD_INPUT, FIELD_INPUT_INVALID } from "@/components/ui/fieldInput";
import { cn } from "@/utils/cn";

/**
 * A password field you can look at (M22).
 *
 * **Its own component rather than a flag on `AuthField`.** The reveal button
 * has to sit *inside* the field's box, which means a positioned wrapper, extra
 * right padding on the input and a piece of state — none of which the four
 * non-password fields should carry. `AuthField` stays the plain case; this is
 * the one with a control in it.
 *
 * **The value is never touched — only `type` changes.** That sounds obvious and
 * is the bug worth naming: implementations that swap the input for a text
 * clone, or that mirror the value into a second piece of state, lose the
 * caret position, break the browser's password manager, and can drop
 * characters typed during the swap. One element, one value, one attribute.
 *
 * `autoComplete` is still whatever the caller passes (`current-password`,
 * `new-password`) so managers keep working while revealed.
 */
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
  /** Quiet helper text under the field — the password rule, typically. */
  hint?: string;
  /** Rendered opposite the label: the "Forgot password?" link on sign-in. */
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
          className="text-ink-2 text-[13px] font-medium select-none"
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
          // `pr-10` reserves the button's column so a long password scrolls
          // under the label rather than behind the icon.
          className={cn(FIELD_INPUT, "pr-10", error && FIELD_INPUT_INVALID)}
        />

        <button
          type="button"
          onClick={() => setRevealed((on) => !on)}
          disabled={disabled}
          // A real button, so it is reachable by Tab and operable by Enter and
          // Space with no key handling of our own. `aria-pressed` says it is a
          // toggle; the label says what pressing it will do next.
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
