import { useEffect, useState } from "react";
import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
} from "@floating-ui/react";

/**
 * The popover plumbing a card control needs: positioning, and closing when the
 * click lands somewhere else.
 *
 * Extracted from `TodoMenu`, which already had exactly this and is the pattern
 * the card follows — `@floating-ui/react` is a dependency and `FloatingPortal`
 * is what keeps the panel out of the card's `overflow-hidden` column.
 *
 * **`triggerProps.onPointerDown` is the part that is not decoration.** The
 * card's root spreads `@dnd-kit`'s listeners, so a pointerdown anywhere inside
 * it starts a drag — including on a button. Stopping propagation at the trigger
 * is what lets a control be clicked without the card following the cursor. The
 * same guard is why the panel itself stops pointerdown: it is portalled out of
 * the card, but a nested control would otherwise still hand the event back.
 */
export function useCardPopover({
  /**
   * This popover contains other popovers, so a click inside one of *them* must
   * not dismiss it.
   *
   * Every panel here is rendered through `FloatingPortal` into `document.body`,
   * so a child panel is not a DOM descendant of the parent's panel and the
   * containment check below reads it as an outside click. The parent then closes
   * on **mousedown** — which unmounts the child before its `click` can fire, so
   * the option the user pressed never runs and nothing is saved.
   *
   * That is exactly what the card menu is: a panel of controls that each open a
   * panel of their own. `data-card-popover` on every panel is the marker that
   * makes the relationship visible across the portal boundary, and it is the
   * same contract `KanbanColumn` uses to keep the create form open while a date
   * is picked.
   */
  hostsPopovers = false,
}: { hostsPopovers?: boolean } = {}) {
  const [open, setOpen] = useState(false);

  const { refs, floatingStyles } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-end",
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;

      const insidePanel = refs.floating.current?.contains(target) ?? false;
      const insideTrigger =
        (refs.reference.current as Node | null)?.contains(target) ?? false;

      if (insidePanel || insideTrigger) return;

      // Inside a panel this one owns, reached through a portal.
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
      if (event.key === "Escape") setOpen(false);
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
    setOpen,
    close: () => setOpen(false),
    refs,
    floatingStyles,

    triggerProps: {
      ref: refs.setReference,
      onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
      onClick: (event: React.MouseEvent) => {
        event.stopPropagation();
        setOpen((value) => !value);
      },
    },

    panelProps: {
      ref: refs.setFloating,
      style: floatingStyles,
      onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
      /**
       * Marks the panel for outside-click handlers that are not this one.
       *
       * `FloatingPortal` renders into `document.body`, so a panel opened from
       * inside another dismissable surface is not a DOM descendant of it. The
       * create form is exactly that case: picking a date would land outside its
       * ref, close the form, and take the half-typed draft with it. Anything
       * with its own outside-click check tests for this attribute.
       */
      "data-card-popover": "",
    },
  };
}
