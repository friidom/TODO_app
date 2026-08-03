export default function AddColumnButton({setCreateColumnOpen}: {setCreateColumnOpen: (open: boolean) => void}) {
  return (
    <button
      onClick={() => setCreateColumnOpen(true)}
      className="border-app hover:bg-card flex h-12 min-w-[260px] items-center justify-center rounded-2xl border-2 border-dashed"
    >
      + Add Column
    </button>
  );
}
