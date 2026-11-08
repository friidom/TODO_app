import {
  useEffect,
  useId,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
  useTransitionStyles,
  type Placement,
} from "@floating-ui/react";

export function useCardPopover({
  // popovers nested inside this one live in a separate portal, so an outside-click check would
  // otherwise treat a click on them as outside and close the parent before the child's click fires
  hostsPopovers = false,
  placement = "bottom-end",
}: { hostsPopovers?: boolean; placement?: Placement } = {}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
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

  // Into the panel on open, so a keyboard user lands on the choices rather than
  // staying on the trigger with the list portalled to the end of the page. A
  // field that autofocused itself keeps the focus, and so does a text field
  // that is its own trigger: that is a combobox, and the next keystroke belongs
  // to it. FloatingPortal creates its node a render after the panel mounts, so
  // this waits a few frames for it.
  useEffect(() => {
    if (!open || isTextField(refs.domReference.current)) return;

    let frame = 0;
    let tries = 0;

    function enter() {
      const panel = refs.floating.current;

      if (!panel) {
        if (++tries < 10) frame = requestAnimationFrame(enter);
        return;
      }

      if (panel.contains(document.activeElement)) return;

      const items = focusables(panel);
      const chosen = items.find((item) =>
        item.matches(
          "[aria-checked='true'],[aria-selected='true'],[aria-current='true']",
        ),
      );

      (chosen ?? items[0])?.focus({ preventScroll: true });
    }

    frame = requestAnimationFrame(enter);

    return () => cancelAnimationFrame(frame);
  }, [open, refs]);

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

      // this listener runs before the nested popover's, so it has to step aside for it to close alone
      const owner = document.activeElement?.closest("[data-card-popover]");

      if (hostsPopovers && owner && owner !== refs.floating.current) return;

      const trigger = refs.reference.current;

      if (
        trigger instanceof HTMLElement &&
        refs.floating.current?.contains(document.activeElement)
      ) {
        trigger.focus();
      }

      setOpen(false);

      // capture phase (below) so this runs before the task modal's bubble-phase listener, which skips defaultPrevented
      event.preventDefault();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open, refs, hostsPopovers]);

  return {
    open,
    mounted,
    setOpen,
    close: () => setOpen(false),

    triggerProps: {
      ref: refs.setReference,
      "aria-expanded": open,
      "aria-controls": open ? panelId : undefined,
      // the card root has dnd-kit listeners on it, so stop pointerdown or clicking a control drags the card
      onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
      onClick: (event: React.MouseEvent) => {
        event.stopPropagation();
        setOpen((value) => !value);
      },
    },

    panelProps: {
      ref: refs.setFloating,
      id: panelId,
      onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
        const trigger = refs.reference.current;

        // Only Tab that would leave the panel: the panel is portalled to the end
        // of the page, so the browser's next stop is nowhere near the trigger.
        if (event.key === "Tab" && leavesPanel(event)) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          if (trigger instanceof HTMLElement) trigger.focus();
          return;
        }

        if (moveWithin(event)) event.stopPropagation();
      },
      style: { ...floatingStyles, ...transitionStyles },
      onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
      // marks this panel so a parent popover's outside-click check can recognize it as "inside"
      "data-card-popover": "",
    },
  };
}

const FOCUSABLE =
  "button:not([disabled]),[role='menuitem'],[role='option'],a[href],input:not([disabled])";

function focusables(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => !element.closest("[inert]") && element.tabIndex !== -1,
  );
}

function leavesPanel(event: ReactKeyboardEvent<HTMLElement>): boolean {
  const items = focusables(event.currentTarget);
  const at = items.indexOf(document.activeElement as HTMLElement);

  return event.shiftKey ? at <= 0 : at === items.length - 1 || at < 0;
}

const isTextField = (element: EventTarget | null) =>
  element instanceof HTMLTextAreaElement ||
  (element instanceof HTMLInputElement &&
    !["checkbox", "radio", "button"].includes(element.type));

// ↑/↓/Home/End between the panel's controls. In a text field only ↓ acts, to
// step from a search box into the list; the field keeps its own caret keys.
function moveWithin(event: ReactKeyboardEvent<HTMLElement>): boolean {
  const { key } = event;

  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(key)) return false;

  if (isTextField(event.target) && key !== "ArrowDown") return false;

  const items = focusables(event.currentTarget);

  if (items.length === 0) return false;

  const at = items.indexOf(document.activeElement as HTMLElement);
  const last = items.length - 1;

  const next =
    key === "Home"
      ? 0
      : key === "End"
        ? last
        : key === "ArrowDown"
          ? Math.min(at + 1, last)
          : Math.max(at - 1, 0);

  event.preventDefault();
  items[next]?.focus();

  return true;
}
