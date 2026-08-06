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
        // The live region is mounted whether or not anything is in it: a
        // screen reader announces content inserted into a region that was
        // already there, not a region that appears with content in it.
        //
        // Above z-50 (the modals) and z-[1000] (the card menu), or a failure
        // raised while one of those is open would be announced and invisible.
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
