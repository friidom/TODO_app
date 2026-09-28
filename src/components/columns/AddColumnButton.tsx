import { Plus } from "lucide-react";

import IconButton from "@/components/ui/IconButton";
import { usePermissions } from "@/hooks/usePermissions";

export default function AddColumnButton({
  setCreateColumnOpen,
}: {
  setCreateColumnOpen: (open: boolean) => void;
}) {
  const { canManageColumns } = usePermissions();

  if (!canManageColumns) return null;

  return (
    <IconButton
      label="Add column"
      size="toolbar"
      onClick={() => setCreateColumnOpen(true)}
    >
      <Plus />
    </IconButton>
  );
}
