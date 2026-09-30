import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";

import IconButton from "@/components/ui/IconButton";
import { usePermissions } from "@/hooks/usePermissions";

export default function AddColumnButton({
  setCreateColumnOpen,
}: {
  setCreateColumnOpen: (open: boolean) => void;
}) {
  // A new column is a workflow publish, which only an admin or the owner may make.
  const { t } = useTranslation();
  const { canManageWorkflow } = usePermissions();

  if (!canManageWorkflow) return null;

  return (
    <IconButton
      label={t("column.add")}
      size="toolbar"
      onClick={() => setCreateColumnOpen(true)}
    >
      <Plus />
    </IconButton>
  );
}
