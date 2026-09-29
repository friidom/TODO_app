type Preventable = { preventBaseUIHandler: () => void };

// Spread onto a DropdownMenuTrigger that can be dragged. Base UI opens a menu on mousedown, so pressing a toolbar
// control to drag it would open its menu under the drag; its click handler ignores a pointer click unless its
// pointerdown handler was skipped too. Keyboard opening is untouched.
export const OPEN_ON_CLICK = {
  onPointerDown: (event: Preventable) => event.preventBaseUIHandler(),
  onMouseDown: (event: Preventable) => event.preventBaseUIHandler(),
};
