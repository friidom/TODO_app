import type { ISupabaseTodo } from "../../types/data";
import { useAuth } from "../lib/auth/useAuth";
// import axios from "axios";
// import { BASE_URL } from "../../constants/consants";
import { supabase } from "./supabase";

// //GET
// export async function fetchTodos(): Promise<IServiceTodo[]> {
//   const res = await axios.get<IServiceTodo[]>(`${BASE_URL}/todos`);
//   return res.data;

// }

// //POST
// export async function addTodo(title: string): Promise<IServiceTodo> {
//   const res = await axios.post<IServiceTodo>(`${BASE_URL}/todos`, {
//     userId: Date.now(), //random?
//     title,
//     completed: false,
//   });
//   return {
//     ...res.data,
//     id: Date.now(),
//   };
// }

// //PATCH
// export async function toggleTodo(todo: IServiceTodo): Promise<IServiceTodo> {
//   await axios.patch<IServiceTodo>(`${BASE_URL}/todos/${todo.id}`, {
//     completed: !todo.completed,
//   });

//   return {
//     ...todo,
//     completed: !todo.completed,
//   };
// }

// //DELETE
// export async function deleteTodo(id: number): Promise<number> {
//   await axios.delete(`${BASE_URL}/todos/${id}`);
//   return id;
// }

//!SUPABASE//

//get
export async function fetchTodos(userId: string) {
  const { data, error } = await supabase
    .from("todos")
    .select("*")
    .eq("user_id", userId);

  console.log(data);

  if (error) throw error;

  return data;
}

//post
export async function addTodo(title: string, userId: string) {
  const { data, error } = await supabase
    .from("todos")
    .insert({
      title,
      completed: false,
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}
//   const { data, error } = await supabase
//   .from("todos")
//   .insert({
//     title,
//     completed: false,
//   })
//   .select()
//   .single();

// console.log(error);
// }

//patch
export async function toggleTodo(todo: ISupabaseTodo) {
  const { data, error } = await supabase
    .from("todos")
    .update({
      completed: !todo.completed,
    })
    .eq("id", todo.id)
    .select()
    .single();

  if (error) throw error;

  return data;
}

//delete
export async function deleteTodo(id: number) {
  const { error } = await supabase.from("todos").delete().eq("id", id);

  if (error) throw error;

  return id;
}
