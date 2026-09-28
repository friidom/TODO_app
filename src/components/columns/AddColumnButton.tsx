import { Plus } from "lucide-react";

import IconButton from "@/components/ui/IconButton";
import { usePermissions } from "@/hooks/usePermissions";

export default function AddColumnButton({
  setCreateColumnOpen,
}: {
  setCreateColumnOpen: (open: boolean) => void;
}) {
  // A new column is a workflow publish, which only an admin or the owner may make.
  const { canManageWorkflow } = usePermissions();

  if (!canManageWorkflow) return null;

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
