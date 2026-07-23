import type { IServiceTodo } from "../../types/data";
import axios from "axios";
import { BASE_URL } from "../../constants/consants";

//GET
export async function fetchTodos(): Promise<IServiceTodo[]> {
  const res = await axios.get<IServiceTodo[]>(`${BASE_URL}/todos`);
  return res.data;
}

//POST
export async function addTodo(title: string): Promise<IServiceTodo> {
  const res = await axios.post<IServiceTodo>(`${BASE_URL}/todos`, {
    userId: Date.now(), //random?
    title,
    completed: false,
  });
  return {
    ...res.data,
    id: Date.now(),
  };
}

//PATCH
export async function toggleTodo(todo: IServiceTodo): Promise<IServiceTodo> {
  await axios.patch<IServiceTodo>(`${BASE_URL}/todos/${todo.id}`, {
    completed: !todo.completed,
  });

  return {
    ...todo,
    completed: !todo.completed,
  };
}

//DELETE
export async function deleteTodo(id: number): Promise<number> {
  await axios.delete(`${BASE_URL}/todos/${id}`);
  return id;
}
