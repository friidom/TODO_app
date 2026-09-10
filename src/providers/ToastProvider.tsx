import { createPortal } from "react-dom";

import { Toast } from "@/components/ui/Toast";
import { useToasts } from "@/stores/toasts";

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const toasts = useToasts((state) => state.toasts);
  const dismiss = useToasts((state) => state.dismiss);

  return (
    <>
      {children}

      {createPortal(
        // mounted even when empty — a screen reader only announces content added to a region that was already there
        // z-[1100] to sit above modals (z-50) and the card menu (z-[1000])
        <div
          role="status"
          aria-live="polite"
          aria-atomic="false"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[1100] flex flex-col items-center gap-2 p-4 sm:items-end"
        >
          {toasts.map((toast) => (
            <Toast
              key={toast.id}
              toast={toast}
              onDismiss={() => dismiss(toast.id)}
            />
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
