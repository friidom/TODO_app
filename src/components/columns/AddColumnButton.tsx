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
      className="border-app hover:bg-card flex h-10 w-10 items-center justify-center rounded-md border"
    >
      {/* + Add Column */}
      <Plus size={20} />
    </button>
  );
}
