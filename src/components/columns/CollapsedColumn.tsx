interface Props {
  headerTitle: string;
  count: number;
  onExpand: () => void;
}

/**
 * The narrow rail a collapsed column shrinks to: title rotated to read top to
 * bottom, the count, and the control to bring it back.
 */
export default function CollapsedColumn({
  headerTitle,
  count,
  onExpand,
}: Props) {
  return (
    <div className="flex h-fit max-h-[calc(100vh-220px)] w-14 shrink-0 flex-col items-center gap-4 rounded-xl bg-[#f8f8f8] py-4">
      <h2
        className="max-h-64 truncate text-lg font-semibold text-gray-700"
        style={{ writingMode: "vertical-rl" }}
      >
        {headerTitle}
      </h2>

      <span className="shrink-0 rounded-md bg-gray-200 px-2 py-0.5 text-sm font-semibold text-gray-600">
        {count}
      </span>

      <button
        type="button"
        onClick={onExpand}
        aria-label="Expand column"
        title="Expand column"
        className="rounded-md p-1 text-gray-600 hover:bg-gray-200"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4" />
        </svg>
      </button>
    </div>
  );
}
