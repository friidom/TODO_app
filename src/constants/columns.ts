import type { TodoStatus } from "../types/data";

export const columns: {
  id: TodoStatus;
  title: string;
}[] = [
  {
    id: "todo",
    title: "Todo",
  },
  {
    id: "in_progress",
    title: "In Progress",
  },
  {
    id: "completed",
    title: "Completed",
  },
  {
    id: "rejected",
    title: "Rejected",
  },
];
