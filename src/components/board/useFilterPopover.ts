import { useEffect, useRef } from "react";
import { useMergeRefs } from "@floating-ui/react";

import { useCardPopover } from "@/components/todo/TodoItem/useCardPopover";

export function useFilterPopover() {
  const { open, mounted, close, triggerProps, panelProps } = useCardPopover({
    placement: "bottom-start",
    hostsPopovers: true,
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const triggerMergedRef = useMergeRefs<HTMLButtonElement>([
    triggerProps.ref,
    triggerRef,
  ]);
  const panelMergedRef = useMergeRefs<HTMLDivElement>([
    panelProps.ref,
    panelRef,
  ]);

  // the panel is portalled to the end of <body>, so a keyboard user closing it would otherwise lose their place
  useEffect(() => {
    if (open) return;

    if (panelRef.current?.contains(document.activeElement)) {
      triggerRef.current?.focus();
    }
  }, [open]);

  return {
    open,
    mounted,
    close,
    // without triggerProps' pointerdown stopPropagation — the toolbar slot around the chip needs that event to start a drag
    triggerProps: {
      ref: triggerMergedRef,
      "aria-expanded": open,
      onClick: triggerProps.onClick,
    },
    panelProps: { ...panelProps, ref: panelMergedRef },
  };
}
