import { useEffect, useRef } from "react";
import { CheckIcon, MinusIcon } from "lucide-react";

// A native input under the paint, so Space, focus and the accessible name come
// from the browser. The label fills the cell to give a 14px box a 40px target.
export default function ListCheckbox({
  checked,
  indeterminate = false,
  label,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  // a DOM property with no attribute, so there is nothing for React to render
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label className="grid h-10 w-full cursor-pointer place-items-center">
      <span className="relative grid size-3.5 place-items-center">
        <input
          ref={ref}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-label={label}
          className="peer border-ink-3 hover:border-ink-2 checked:border-brand checked:bg-brand indeterminate:border-brand indeterminate:bg-brand focus-visible:ring-brand size-3.5 cursor-pointer appearance-none rounded-[3px] border-[1.5px] bg-(--list-row) transition-colors outline-none focus-visible:ring-2"
        />
        <CheckIcon
          strokeWidth={3.5}
          className="text-brand-fg pointer-events-none absolute hidden size-2.5 peer-checked:block"
        />
        <MinusIcon
          strokeWidth={3.5}
          className="text-brand-fg pointer-events-none absolute hidden size-2.5 peer-indeterminate:block"
        />
      </span>
    </label>
  );
}
