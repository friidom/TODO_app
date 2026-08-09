import { create } from "zustand";

/** How long the ring stays mounted; must outlast the CSS animation. */
const DURATION = 1600;

interface DoneFlashStore {
  /** The todo that just landed in a "done" column, or `null`. */
  todoId: string | null;
  flash: (todoId: string) => void;
}

let timer: ReturnType<typeof setTimeout> | undefined;

/**
 * Cross-component signal for the green ring a card plays on arriving in a done
 * column. A store rather than a prop because both move paths need it — the
 * board's `onDragEnd` and the card's own column menu, which sits three levels
 * inside `TodoItem`.
 */
export const useDoneFlash = create<DoneFlashStore>((set) => ({
  todoId: null,

  flash: (todoId) => {
    clearTimeout(timer);

    set({ todoId });

    timer = setTimeout(() => set({ todoId: null }), DURATION);
  },
}));
