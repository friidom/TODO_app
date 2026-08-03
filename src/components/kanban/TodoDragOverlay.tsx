import { DragOverlay } from "@dnd-kit/core";

import TodoItem from "../todo/TodoItem";

import type { ISupabaseTodo } from "@/types/data";

interface Props {
    activeTodo: ISupabaseTodo | null;
}

export default function TodoDragOverlay({
    activeTodo,
}: Props) {
    return (
        <DragOverlay dropAnimation={null} adjustScale={false}>
            {activeTodo && (
                <TodoItem
                    {...activeTodo}
                    overlay
                    menuOpen={false}
                    openMenu={() => {}}
                    closeMenu={() => {}}
                />
            )}
        </DragOverlay>
    );
}