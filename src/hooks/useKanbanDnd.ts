import { useDragOverTodos } from "@/services/lib";

import type { ISupabaseTodo } from "@/types/data";
import { PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useState } from "react";
import useDropIndicator from "./useDropIndicator";

export default function useKanbanDnd() {
  const [activeTodo, setActiveTodo] = useState<ISupabaseTodo | null>(null);
  const { indicator, setIndicator } = useDropIndicator();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  const handleDragOver = useDragOverTodos({
    setIndicator,
  });

  return {
    sensors,
    handleDragOver,
    activeTodo,
    setActiveTodo,
    indicator,
    setIndicator,
  };
}
