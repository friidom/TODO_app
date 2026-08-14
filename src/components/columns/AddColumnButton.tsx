import { Plus } from "lucide-react";

import { usePermissions } from "@/hooks/usePermissions";

export default function AddColumnButton({
  setCreateColumnOpen,
}: {
  setCreateColumnOpen: (open: boolean) => void;
}) {
  const { canManageColumns } = usePermissions();

  // Absent rather than disabled: a viewer has no use for a control that always
  // fails, and M3-05's policies refuse the insert with the UI bypassed.
  if (!canManageColumns) return null;

  return (
    <button
      onClick={() => setCreateColumnOpen(true)}
      title="Add a column"
      aria-label="Add a column"
      // A narrow stub at the end of the column row, matching the mockup — wide
      // enough to read as a column-shaped affordance, narrow enough not to look
      // like an empty column.
      className="border-hairline text-ink-3 hover:border-brand/40 hover:bg-brand-soft hover:text-brand rounded-surface flex h-11 w-11 shrink-0 items-center justify-center border border-dashed transition-colors"
    >
      {/* + Add Column */}
      <Plus size={20} />
    </button>
  );
}
