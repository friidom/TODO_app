import { create } from "zustand";

export type TaskLayout = "modal" | "panel";

const KEY = "task:layout";

// Per device, guarded like the other stored view preferences — a private window throws on access.
function read(): TaskLayout {
  try {
    return localStorage.getItem(KEY) === "panel" ? "panel" : "modal";
  } catch {
    return "modal";
  }
}

function write(layout: TaskLayout): void {
  try {
    if (layout === "panel") localStorage.setItem(KEY, layout);
    else localStorage.removeItem(KEY);
  } catch {
    // Not remembered, still applied for this visit.
  }
}

interface TaskLayoutStore {
  layout: TaskLayout;
  setLayout: (layout: TaskLayout) => void;
}

// A store because BoardPage (which mounts the surface) and the task header's toggle (inside it) are far apart.
export const useTaskLayout = create<TaskLayoutStore>((set) => ({
  layout: read(),

  setLayout: (layout) => {
    write(layout);
    set({ layout });
  },
}));
