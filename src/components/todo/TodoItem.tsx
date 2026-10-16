import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDraggable } from "@dnd-kit/core";

import TodoCard from "./TodoCard";
import AssigneeControl from "./TodoItem/AssigneeControl";
import TodoMenu from "./TodoItem/TodoMenu";
import { itemLabel } from "@/hooks/dragAnnouncements";
import { useKeyPrefix } from "@/hooks/useKeyPrefix";
import { useOpenTask } from "@/hooks/useOpenTask";
import { usePermissions } from "@/hooks/usePermissions";
import { useTodoPatch } from "@/hooks/useTodoPatch";
import { toCardContent } from "@/services/todos/toCardContent";
import { useBoardViewPrefs } from "@/stores/boardViewPrefs";
import { useCardLanding, type Landing } from "@/stores/cardLanding";
import { useDoneFlash } from "@/stores/doneFlash";
import type { Todo, TodoViewState } from "@/types/data";
import { taskKey } from "@/utils/taskKey";

// card owns pixels, this owns the row/cache/drag registration — memoised, but the real fix is the memo boundary on DraggableTodo below
const TodoItem = memo(function TodoItem({
  todo,
  overlay = false,
  dragDisabled = false,
  subtaskDone = 0,
  subtaskTotal = 0,
  parentLabel,
  sprintLabel,
  selected = false,
}: { todo: Todo; selected?: boolean } & TodoViewState &
  SubtaskCounts &
  CardLabels) {
  // split so hooks are never called conditionally
  if (overlay) {
    return (
      <TodoContainer
        todo={todo}
        overlay
        subtaskDone={subtaskDone}
        subtaskTotal={subtaskTotal}
        parentLabel={parentLabel}
        sprintLabel={sprintLabel}
      />
    );
  }

  return (
    <DraggableTodo
      todo={todo}
      dragDisabled={dragDisabled}
      subtaskDone={subtaskDone}
      subtaskTotal={subtaskTotal}
      parentLabel={parentLabel}
      sprintLabel={sprintLabel}
      selected={selected}
    />
  );
});

// handed down, not looked up — a hook per card would be a fresh object every render and break the memo below
export interface SubtaskCounts {
  subtaskDone?: number;
  subtaskTotal?: number;
}

// the Parent and Sprint card fields' text, looked up once per column (useCardLabels) for the same reason
export interface CardLabels {
  parentLabel?: string;
  sprintLabel?: string;
}

export default TodoItem;

function DraggableTodo({
  todo,
  dragDisabled,
  subtaskDone,
  subtaskTotal,
  parentLabel,
  sprintLabel,
  selected,
}: {
  todo: Todo;
  dragDisabled?: boolean;
  selected: boolean;
} & SubtaskCounts &
  CardLabels) {
  const keyPrefix = useKeyPrefix();

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: todo.id,
    data: { type: "todo", statusId: todo.status_id },
    disabled: dragDisabled,
  });

  // dnd-kit rebuilds `listeners` on most renders (measured: 1,224/1,643 during one drag), which broke the memo below.
  // pinning a stable wrapper here and forwarding through the ref is what stops every card re-rendering on a drag.
  const listenersRef = useRef(listeners);

  useEffect(() => {
    listenersRef.current = listeners;
  });

  const listenerKeys = listeners ? Object.keys(listeners).sort().join(",") : "";

  const stableListeners = useMemo(() => {
    const out: Record<string, (event: unknown) => void> = {};

    for (const key of listenerKeys ? listenerKeys.split(",") : []) {
      const forward = (event: unknown) =>
        (
          listenersRef.current as
            Record<string, ((e: unknown) => void) | undefined> | undefined
        )?.[key]?.(event);

      if (key !== "onPointerDown") {
        out[key] = forward;
        continue;
      }

      // capture, so a press on one of the card's controls still picks the card up — they stop pointerdown for their
      // popovers; a plain click on them still lands, since nothing activates before the pointer moves 8px
      out.onPointerDownCapture = (event) => {
        const { currentTarget, target } = event as React.PointerEvent;

        // a portalled popover bubbles through the card in React's tree, and a text field needs its drag to select
        if (!currentTarget.contains(target as Node)) return;
        if ((target as Element).closest("input, textarea, [contenteditable]"))
          return;

        forward(event);
      };
    }

    return out;
  }, [listenerKeys]);

  const handleProps = useMemo(
    () => ({
      ...attributes,
      ...stableListeners,
      // without this a screen reader reads the whole card body as the button's name
      "aria-label": itemLabel(taskKey(keyPrefix, todo.board_key), todo.title),
      "aria-roledescription": "card",
    }),
    [attributes, stableListeners, keyPrefix, todo.board_key, todo.title],
  );

  // no transform here — the card stays put, only the DragOverlay follows the cursor
  return (
    <TodoContainer
      todo={todo}
      dragging={isDragging}
      dragDisabled={dragDisabled}
      subtaskDone={subtaskDone}
      subtaskTotal={subtaskTotal}
      parentLabel={parentLabel}
      sprintLabel={sprintLabel}
      selected={selected}
      setNodeRef={setNodeRef}
      handleProps={handleProps}
    />
  );
}

// the memo boundary sits here, below useDraggable — context updates bypass memo, so memoising higher up wouldn't stop a drag re-rendering every card
const TodoContainer = memo(function TodoContainer({
  todo,
  overlay = false,
  dragging = false,
  dragDisabled = false,
  subtaskDone = 0,
  subtaskTotal = 0,
  parentLabel,
  sprintLabel,
  selected = false,
  setNodeRef,
  handleProps,
}: { todo: Todo } & TodoViewState &
  SubtaskCounts &
  CardLabels & {
    selected?: boolean;
    setNodeRef?: (element: HTMLElement | null) => void;
    handleProps?: Record<string, unknown>;
  }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title ?? "");

  const patch = useTodoPatch(todo);

  const { canEditTodos } = usePermissions();
  const { openTask } = useOpenTask();
  const keyPrefix = useKeyPrefix();

  // a store slice, not a prop or a URL read: the array keeps its identity until the setting changes, so the memo holds
  const shownFields = useBoardViewPrefs((state) => state.prefs.cardFields);

  // only the real card celebrates, never the drag overlay's copy
  const celebrate = useDoneFlash(
    (state) => state.todoId === todo.id && !overlay && !dragging,
  );

  const landing = useCardLanding((state) =>
    !overlay && state.landing?.todoId === todo.id ? state.landing : null,
  );
  const clearLanding = useCardLanding((state) => state.clear);

  // the drop's optimistic write lands a tick after the drag ends; until it does, this is still the dragged-from slot
  const landed =
    landing !== null &&
    (landing.statusId !== todo.status_id || landing.rank !== todo.rank);

  const nodeRef = useRef<HTMLElement | null>(null);
  const setRef = useCallback(
    (element: HTMLElement | null) => {
      nodeRef.current = element;
      setNodeRef?.(element);
    },
    [setNodeRef],
  );

  useLayoutEffect(() => {
    if (!landing || !landed || !nodeRef.current) return;

    clearLanding();
    flyIn(nodeRef.current, landing);
  }, [landing, landed, clearLanding]);

  function save() {
    // empty reverts, unchanged is a no-op — both just close the editor
    if (draft.trim() === "" || draft === todo.title) {
      setDraft(todo.title ?? "");
      setEditing(false);
      return;
    }

    patch({ title: draft }, { onSuccess: () => setEditing(false) });
  }

  function cancel() {
    setDraft(todo.title ?? "");
    setEditing(false);
  }

  return (
    <TodoCard
      {...toCardContent(todo, keyPrefix)}
      draft={draft}
      editing={editing}
      canEdit={canEditTodos}
      celebrate={celebrate}
      selected={selected}
      overlay={overlay}
      dragging={dragging || (landing !== null && !landed)}
      dragDisabled={dragDisabled}
      onDraftChange={setDraft}
      onSave={save}
      onCancel={cancel}
      onStartEdit={() => setEditing(true)}
      onWorkTypeChange={(type) => patch({ type })}
      onPriorityChange={(priority) => patch({ priority })}
      onDueDateChange={(due_date) => patch({ due_date })}
      onEstimateChange={(estimate) => patch({ estimate })}
      subtaskDone={subtaskDone}
      subtaskTotal={subtaskTotal}
      shownFields={shownFields}
      parentLabel={parentLabel}
      sprintLabel={sprintLabel}
      // opening the panel is a read, not gated on canEditTodos — just withheld on the overlay copy
      onOpen={overlay ? undefined : () => openTask(todo.id)}
      assignee={
        <AssigneeControl
          boardId={todo.board_id}
          value={todo.assignee_id}
          onChange={(assignee_id) => patch({ assignee_id })}
        />
      }
      menu={<TodoMenu todo={todo} onEdit={() => setEditing(true)} />}
      setNodeRef={setRef}
      handleProps={handleProps}
    />
  );
});

// From where the overlay was let go into the card's own slot. A copy flies,
// fixed over the page, because the card itself is clipped by its column's
// scroller; the card waits invisible underneath for exactly as long.
function flyIn(node: HTMLElement, from: Landing) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const to = node.getBoundingClientRect();
  const dx = from.left - to.left;
  const dy = from.top - to.top;

  if (Math.abs(dx) + Math.abs(dy) < 2) return;

  const ghost = node.cloneNode(true) as HTMLElement;

  ghost.inert = true;
  ghost.classList.add("motion-ghost");
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${to.left}px`,
    top: `${to.top}px`,
    width: `${to.width}px`,
    height: `${to.height}px`,
    margin: "0",
    zIndex: "60",
  });
  document.body.append(ghost);

  const timing = { duration: 220, easing: "cubic-bezier(0.2, 0, 0, 1)" };

  node.animate({ opacity: [0, 0] }, timing);

  const flight = ghost.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) rotate(1.5deg)` },
      { transform: "none" },
    ],
    timing,
  );

  flight.onfinish = flight.oncancel = () => ghost.remove();
}
