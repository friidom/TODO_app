import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import CreateWorkItemDialog from "@/components/todo/CreateWorkItemDialog";
import { defaultStatus } from "@/services/workflow/statuses";
import { useStatuses } from "@/services/workflow/useWorkflow";
import { usePermissions } from "@/hooks/usePermissions";

export default function HeaderTodoForm() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const { canEditTodos } = usePermissions();
  const { data: statuses = [] } = useStatuses();

  // a board with no column that can receive work has nowhere to put a new item
  const canCreate = defaultStatus(statuses) !== null;

  if (!canEditTodos) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!canCreate}
        title={t("createItem.title")}
        aria-haspopup="dialog"
        className="bg-brand text-brand-fg hover:bg-brand/90 active:bg-brand/80 focus-visible:ring-brand shadow-e1 flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-50"
      >
        <PlusIcon className="size-4" />
        <span className="hidden sm:inline">{t("header.newTask")}</span>
      </button>

      {open && <CreateWorkItemDialog onClose={() => setOpen(false)} />}
    </>
  );
}
