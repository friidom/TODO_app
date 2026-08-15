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
    /**
     * Position with `top`/`left` instead of a `transform`.
     *
     * The panel's *motion* is a transform, and a single element cannot carry
     * two of them — so this used to mean every animated panel needed an outer
     * element to be placed and an inner one to move, and only one caller ever
     * paid that price. Giving up the transform-based positioning gives the
     * transform back to the animation, which is what lets `panelProps` carry
     * both and lets a control opt into the motion by rendering on `mounted`.
     */
    transform: false,
  });

  /**
   * Enter and — the part that was missing — **exit**.
   *
   * A caller rendering on `open` unmounts its panel the moment the value flips,
   * so a dismissal happens on one frame however it was styled. `mounted` keeps
   * the element alive for the length of the close, which is the whole reason a
   * closing animation can exist at all.
   *
   * **Additive.** A consumer that still renders on `open` behaves exactly as it
   * did; rendering on `mounted` is the whole opt-in, because `panelProps`
   * already carries these styles.
   *
   * **Opacity and four pixels, and nothing else.** It used to scale as well,
   * which on a 30rem filter panel reads as a zoom rather than as an arrival —
   * and a scaling panel resamples its own text for the length of the
   * transition, which is most of why the motion looked cheap. A fade over a
   * translate short enough that you register the direction and not the travel
   * is the effect that survives being watched twice.
   *
   * The direction follows the RESOLVED side, because `flip()` puts the panel
   * above its trigger on a short viewport — a panel that always entered from
   * above would then be moving away from the button it belongs to.
   *
   * Closing is quicker than opening on purpose: an opening panel is showing you
   * something and can afford to be seen arriving, while a dismissal should feel
   * like it has already happened.
   */
  const { isMounted: mounted, styles: transitionStyles } = useTransitionStyles(
    context,
    {
      duration: { open: 160, close: 120 },
      // Serves the exit too — `close` falls back to `initial`, so the panel
      // leaves the way it came in rather than needing a second description.
      initial: ({ side }) => ({
        opacity: 0,
        transform: `translateY(${side === "top" ? "4px" : "-4px"})`,
      }),
      // One curve for both directions. At 120–160ms over four pixels the
      // difference between decelerating in and accelerating out is not
      // perceptible, and one curve is one thing to keep consistent.
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
      if (event.key !== "Escape") return;

      setOpen(false);

      /**
       * Marks the press as handled, so only the innermost thing closes.
       *
       * `Modal`, `Drawer`, `TaskDetailModal` and the column dialogs all test
       * `!event.defaultPrevented` before treating Escape as a dismissal — the
       * convention was written for exactly this case and this hook was the one
       * place not holding up its end. It costs nothing while a popover is the
       * only thing open, and it is what stops Escape inside the task modal's
       * status picker from closing the picker *and* the task with it.
       */
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
    /**
     * Whether the panel should be in the DOM — `open`, plus the tail of the
     * close animation. Render on this instead of `open` to get an exit.
     */
    mounted,
    setOpen,
    close: () => setOpen(false),

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
      // Placement and motion on one element, which `transform: false` above is
      // what makes possible. Order matters only in that neither object writes a
      // key the other does: placement is `top`/`left`, motion is
      // `opacity`/`transform`.
      style: { ...floatingStyles, ...transitionStyles },
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
