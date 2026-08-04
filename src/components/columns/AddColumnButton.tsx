import { Plus } from "lucide-react";

export default function AddColumnButton({
  setCreateColumnOpen,
}: {
  setCreateColumnOpen: (open: boolean) => void;
}) {
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
