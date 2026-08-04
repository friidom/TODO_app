import { Bug, Calendar, ChevronDown, CornerDownLeft, User } from "lucide-react";
import { useEffect, useState, type RefObject } from "react";

/** Card shell — shared so the skeleton and the form are the same box. */
const CARD =
  "mb-2 rounded-xl border-2 border-blue-500 bg-white px-3 py-2 shadow-sm";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  /** Play the loading skeleton before showing the controls. */
  skeleton?: boolean;
  ref?: RefObject<HTMLDivElement | null>;
}

/**
 * The inline "new work item" card. Rendered either at the bottom of a column
 * (the Create button) or in the gap the user clicked.
 *
 * On open it shows a skeleton for a beat so the card lands in place before the
 * caret does — the blocks are sized to the real controls, so nothing shifts.
 * Submitting moves the card down a slot, which remounts it; the parent drops
 * `skeleton` by then so a fast typist never loses the input mid-run.
 */
export default function TodoCreateForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  skeleton = false,
  ref,
}: Props) {
  const [ready, setReady] = useState(!skeleton);

  useEffect(() => {
    if (ready) return;

    const timer = setTimeout(() => setReady(true), 180);

    return () => clearTimeout(timer);
  }, [ready]);

  if (!ready) {
    return (
      <div ref={ref} className={CARD}>
        <div className="animate-pulse">
          <div className="h-10 w-full rounded-md bg-gray-200" />

          <div className="mt-3 flex items-center gap-1">
            <div className="size-7 rounded-md bg-gray-200" />
            <div className="size-7 rounded-md bg-gray-200" />
            <div className="size-7 rounded-md bg-gray-200" />

            <div className="ml-auto size-7 rounded-md bg-gray-200" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className={CARD}>
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="What needs to be done?"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }

          if (e.key === "Escape") onCancel();
        }}
        className="w-full bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400"
      />

      <div className="mt-8 flex items-center gap-1">
        <button
          type="button"
          className="rounded-md p-1 text-red-400 hover:bg-gray-100"
        >
          <Bug size={19} />
        </button>

        <button
          type="button"
          className="rounded-md p-1 text-gray-500 hover:bg-gray-100"
        >
          <ChevronDown size={16} />
        </button>

        <button
          type="button"
          className="rounded-md p-1 text-gray-500 hover:bg-gray-100"
        >
          <Calendar size={19} />
        </button>

        <button
          type="button"
          className="rounded-full bg-gray-200 p-1 text-gray-500 hover:bg-gray-300"
        >
          <User size={17} />
        </button>

        <button
          type="button"
          disabled={!value.trim()}
          onClick={onSubmit}
          className="ml-auto flex size-7 items-center justify-center rounded-md bg-gray-100 text-gray-400 hover:bg-gray-200 disabled:opacity-40"
        >
          <CornerDownLeft size={17} />
        </button>
      </div>
    </div>
  );
}
