import { useEffect, useState } from "react";
import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
  useTransitionStyles,
} from "@floating-ui/react";

export function useCardPopover({
  // popovers nested inside this one live in a separate portal, so an outside-click check would
  // otherwise treat a click on them as outside and close the parent before the child's click fires
  hostsPopovers = false,
}: { hostsPopovers?: boolean } = {}) {
  const [open, setOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-end",
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
    // top/left instead of transform, so the transition below can own the transform
    transform: false,
  });

  const { isMounted: mounted, styles: transitionStyles } = useTransitionStyles(
    context,
    {
      duration: { open: 160, close: 120 },
      initial: ({ side }) => ({
        opacity: 0,
        transform: `translateY(${side === "top" ? "4px" : "-4px"})`,
      }),
      common: {
        transitionTimingFunction: "cubic-bezier(0.2, 0, 0, 1)",
      },
    },
  );

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;

      const insidePanel = refs.floating.current?.contains(target) ?? false;
      const insideTrigger =
        (refs.reference.current as Node | null)?.contains(target) ?? false;

      if (insidePanel || insideTrigger) return;

      if (
        hostsPopovers &&
        target instanceof Element &&
        target.closest("[data-card-popover]")
      ) {
        return;
      }

      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      setOpen(false);

      // stop it bubbling so a nested Escape doesn't also close the modal underneath
      event.preventDefault();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, refs, hostsPopovers]);

  return {
    open,
    mounted,
    setOpen,
    close: () => setOpen(false),

    triggerProps: {
      ref: refs.setReference,
      // the card root has dnd-kit listeners on it, so stop pointerdown or clicking a control drags the card
      onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
      onClick: (event: React.MouseEvent) => {
        event.stopPropagation();
        setOpen((value) => !value);
      },
    },

    panelProps: {
      ref: refs.setFloating,
      style: { ...floatingStyles, ...transitionStyles },
      onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
      // marks this panel so a parent popover's outside-click check can recognize it as "inside"
      "data-card-popover": "",
    },
  };
}
