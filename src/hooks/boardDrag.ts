import type { IColumn, Todo } from "@/types/data";

export interface TodoIndicator {
  columnId: string | null;
  index: number;
  statusId?: string;
}

export type DropType = "column" | "column-gap" | "todo-gap" | "status-zone";

export interface DropData {
  type?: DropType;
  columnId?: string;
  index?: number;
  statusId?: string;
}

export interface BoardDragState {
  activeTodo: Todo | null;
  activeColumn: IColumn | null;
  indicator: TodoIndicator;
  columnIndicator: number | null;
  // A drop leaves the pointer resting on the gap it dropped into, so the
  // gaps' hover-revealed create control waits until the pointer moves.
  settling: boolean;
  settleOrigin: { x: number; y: number } | null;
}

export type BoardDragAction =
  | { type: "pick-todo"; todo: Todo }
  | { type: "pick-column"; column: IColumn }
  | { type: "over"; data: DropData | undefined }
  | { type: "end" }
  | { type: "pointer"; x: number; y: number };

export const EMPTY_INDICATOR: TodoIndicator = { columnId: null, index: 0 };

export const SETTLE_DISTANCE = 4;

export const IDLE: BoardDragState = {
  activeTodo: null,
  activeColumn: null,
  indicator: EMPTY_INDICATOR,
  columnIndicator: null,
  settling: false,
  settleOrigin: null,
};

function over(state: BoardDragState, data: DropData | undefined) {
  if (!data) {
    return { ...state, indicator: EMPTY_INDICATOR, columnIndicator: null };
  }

  const columnId = data.columnId ?? null;

  switch (data.type) {
    case "column-gap":
      return { ...state, columnIndicator: data.index ?? null };
    case "todo-gap":
      return { ...state, indicator: { columnId, index: data.index ?? 0 } };
    case "status-zone":
      return {
        ...state,
        indicator: { columnId, index: 0, statusId: data.statusId },
      };
    case "column":
      return { ...state, indicator: { columnId, index: 0 } };
    default:
      return state;
  }
}

export function boardDragReducer(
  state: BoardDragState,
  action: BoardDragAction,
): BoardDragState {
  switch (action.type) {
    case "pick-todo":
      return { ...IDLE, activeTodo: action.todo };
    case "pick-column":
      return { ...IDLE, activeColumn: action.column };
    case "over":
      return over(state, action.data);
    case "end":
      return { ...IDLE, settling: true };
    case "pointer": {
      if (!state.settling) return state;

      const origin = state.settleOrigin;

      if (!origin) {
        return { ...state, settleOrigin: { x: action.x, y: action.y } };
      }

      return Math.hypot(action.x - origin.x, action.y - origin.y) >=
        SETTLE_DISTANCE
        ? { ...state, settling: false, settleOrigin: null }
        : state;
    }
  }
}
