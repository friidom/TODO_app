import { Plus } from "lucide-react";

import { usePermissions } from "@/hooks/usePermissions";

export default function AddColumnButton({
  setCreateColumnOpen,
}: {
  setCreateColumnOpen: (open: boolean) => void;
}) {
  const { canManageColumns } = usePermissions();

  if (!canManageColumns) return null;

  return (
    <button
      onClick={() => setCreateColumnOpen(true)}
      title="Add a column"
      aria-label="Add a column"
      className="border-hairline text-ink-3 hover:border-brand/40 hover:bg-brand-soft hover:text-brand rounded-surface flex h-11 w-11 shrink-0 items-center justify-center border border-dashed transition-colors"
    >
      <Plus size={20} />
    </button>
  );
}
