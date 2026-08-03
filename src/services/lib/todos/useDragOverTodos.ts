import type { DragOverEvent } from "@dnd-kit/core";

interface Props {
  setIndicator: (value: {
    columnId: string | null;
    index: number;
  }) => void;
}

export function useDragOverTodos({ setIndicator }: Props) {
  return ({ over }: DragOverEvent) => {
    if (!over) {
      setIndicator({
        columnId: null,
        index: -1,
      });

      return;
    }

    const data = over.data.current;

    if (data?.type !== "drop-zone") return;

    setIndicator({
      columnId: data.columnId,
      index: data.index,
    });
  };
}