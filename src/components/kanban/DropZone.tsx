import { useDroppable } from "@dnd-kit/core";

interface Props {
  columnId: string;
  index: number;
}

export default function DropZone({ columnId, index }: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop-${columnId}-${index}`,
    data: {
      type: "drop-zone",
      columnId,
      index,
    },
  });

  return (
    <div ref={setNodeRef} className="relative -my-2 h-4">
      {isOver && (
        <div className="pointer-events-none absolute top-1/2 right-0 left-0 z-50 h-[3px] -translate-y-1/2 rounded-full bg-[#0C66E4] shadow-[0_0_8px_rgba(12,102,228,.5)]" />
      )}
    </div>
  );
}
