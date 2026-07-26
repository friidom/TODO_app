import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ITodo } from "../types/data";

//! zustand \\

interface TodoStore {
  todos: ITodo[];

  addTodo: (text: string) => void;
  removeTodo: (id: number) => void;
  toogleTodo: (id: number) => void;
}

export const useTodoStore = create<TodoStore>()((set) => ({
  todos: [],

  addTodo: (title) => {
    set((state) => ({
      todos: [
        ...state.todos,
        {
          id: Date.now(),
          title,
          complete: false,
        },
      ],
    }));
  },

  removeTodo: (id) => {
    set((state) => ({
      todos: state.todos.filter((todo) => todo.id !== id),
    }));
  },

  toogleTodo: (id) => {
    set((state) => ({
      todos: state.todos.map((todo) =>
        todo.id === id ? { ...todo, complete: !todo.complete } : todo,
      ),
    }));
  },
}));
