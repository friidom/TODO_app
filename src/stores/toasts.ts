import { create } from "zustand";

const DURATION = 5000;

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

// a store, not context — the MutationCache raises these from outside the React tree and can't call a hook
export const useToasts = create<ToastStore>((set, get) => ({
  toasts: [],

  push: (variant, message) => {
    const id = nextId++;

    set((state) => ({
      toasts: [...state.toasts, { id, variant, message }].slice(-MAX_VISIBLE),
    }));

    setTimeout(() => get().dismiss(id), DURATION);
  },

  dismiss: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
}));

export const toast = {
  error: (message: string) => useToasts.getState().push("error", message),
  success: (message: string) => useToasts.getState().push("success", message),
};
