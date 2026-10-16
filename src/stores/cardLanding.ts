import { create } from "zustand";

export interface Landing {
  todoId: string;
  // where the drag overlay was let go, in viewport pixels
  left: number;
  top: number;
  // the card's place before the drop; it has landed once either changes
  statusId: string | null;
  rank: number | null;
}

interface CardLandingStore {
  landing: Landing | null;
  land: (landing: Landing) => void;
  clear: () => void;
}

// A drop whose optimistic write never comes (no room for a rank until a
// rebalance) must not leave the card hidden as a placeholder.
const PATIENCE = 800;

let timer: ReturnType<typeof setTimeout> | undefined;

export const useCardLanding = create<CardLandingStore>((set) => ({
  landing: null,

  land: (landing) => {
    clearTimeout(timer);

    set({ landing });

    timer = setTimeout(() => set({ landing: null }), PATIENCE);
  },

  clear: () => {
    clearTimeout(timer);

    set({ landing: null });
  },
}));
