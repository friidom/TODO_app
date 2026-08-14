import { useEffect, useState } from "react";
import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
  useTransitionStyles,
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

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-end",
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  /**
   * Enter and — the part that was missing — **exit**.
   *
   * A caller rendering on `open` unmounts its panel the moment the value flips,
   * so a dismissal happens on one frame however it was styled. `mounted` keeps
   * the element alive for the length of the close, which is the whole reason a
   * closing animation can exist at all.
   *
   * **Additive.** Every consumer that renders on `open` behaves exactly as it
   * did; only a caller that switches to `mounted` and spreads
   * `transitionStyles` gets the motion.
   *
   * Closing is quicker than opening on purpose: an opening panel is showing you
   * something and can afford to be seen arriving, while a dismissal should feel
   * like it has already happened.
   */
  const { isMounted: mounted, styles: transitionStyles } = useTransitionStyles(
    context,
    {
      duration: { open: 150, close: 120 },
      initial: {
        opacity: 0,
        // 3% and 4px. Enough to read as motion, far short of a zoom.
        transform: "scale(0.97) translateY(-4px)",
      },
      // The origin follows the RESOLVED placement rather than being hard-coded
      // to the corner nearest the trigger, because `flip()` will put the panel
      // above the trigger on a short viewport — and an origin that did not
      // follow would make it grow away from the button it belongs to.
      common: ({ side }) => ({
        transformOrigin: {
          top: "bottom right",
          bottom: "top right",
          left: "right center",
          right: "left center",
        }[side],
      }),
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
    /**
     * Whether the panel should be in the DOM — `open`, plus the tail of the
     * close animation. Render on this instead of `open` to get an exit.
     */
    mounted,
    /** Merge into the panel's `style` alongside `floatingStyles`. */
    transitionStyles,
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
