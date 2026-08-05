import { create } from "zustand";

/** How long a toast stays up before dismissing itself. */
const DURATION = 5000;

/** Newest win: beyond this the oldest drop off rather than filling the screen. */
const MAX_VISIBLE = 3;

export type ToastVariant = "error" | "success";

export interface ToastMessage {
  id: number;
  variant: ToastVariant;
  message: string;
}

interface ToastStore {
  toasts: ToastMessage[];
  push: (variant: ToastVariant, message: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 0;

/**
 * The toast queue.
 *
 * A store rather than a context because the caller that matters most is not a
 * component: M1-07 raises these from the QueryClient's MutationCache, which
 * lives outside the React tree and cannot call a hook.
 */
export const useToasts = create<ToastStore>((set, get) => ({
  toasts: [],

  push: (variant, message) => {
    const id = nextId++;

    set((state) => ({
      toasts: [...state.toasts, { id, variant, message }].slice(-MAX_VISIBLE),
    }));

    // A toast dropped by the cap above is already gone; dismissing it later is
    // a no-op, so the timer needs no cancelling.
    setTimeout(() => get().dismiss(id), DURATION);
  },

  dismiss: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
}));

/** Imperative entry point. Safe to call from anywhere, React or not. */
export const toast = {
  error: (message: string) => useToasts.getState().push("error", message),
  success: (message: string) => useToasts.getState().push("success", message),
};
