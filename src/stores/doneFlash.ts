import { create } from "zustand";

const DURATION = 1600;

interface DoneFlashStore {
  todoId: string | null;
  flash: (todoId: string) => void;
}

let timer: ReturnType<typeof setTimeout> | undefined;

// store, not a prop — both the board's onDragEnd and the card's column menu need to trigger it
export const useDoneFlash = create<DoneFlashStore>((set) => ({
  todoId: null,

  flash: (todoId) => {
    clearTimeout(timer);

    set({ todoId });

    timer = setTimeout(() => set({ todoId: null }), DURATION);
  },
}));
