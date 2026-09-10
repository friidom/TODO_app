import { FIELD_INPUT, FIELD_INPUT_INVALID } from "@/components/ui/fieldInput";
import { cn } from "@/utils/cn";

// Shared between both forms mainly for the aria wiring — id/aria-invalid/aria-describedby derive from one prop instead of drifting across copies.
export default function AuthField({
  id,
  label,
  type,
  value,
  onChange,
  error,
  disabled,
  autoComplete,
  placeholder,
}: {
  id: string;
  label: string;
  type: "email" | "password" | "text";
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  autoComplete: string;
  placeholder: string;
}) {
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-ink-2 text-meta font-medium select-none"
      >
        {label}
      </label>

      <input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={cn(FIELD_INPUT, error && FIELD_INPUT_INVALID)}
      />

      {error && (
        <p id={errorId} className="text-status-red text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
