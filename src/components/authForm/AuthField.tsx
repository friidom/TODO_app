import { FIELD_INPUT, FIELD_INPUT_INVALID } from "@/components/ui/fieldInput";
import { cn } from "@/utils/cn";

/**
 * One labelled credential field.
 *
 * Shared by both forms for the aria wiring rather than the markup: `id`,
 * `aria-invalid` and `aria-describedby` have to agree with the error paragraph's
 * `id`, and four hand-written copies of that agreement is four chances for a
 * screen reader to be told nothing is wrong. Here the ids are derived from one
 * prop and cannot drift.
 *
 * The visible `<label>` is new — the fields used to be placeholder-only, which
 * leaves the form unlabelled the moment anyone types.
 */
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
  /** `text` since M10-01, for the username field. */
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
