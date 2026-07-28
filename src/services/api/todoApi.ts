import type { ISupabaseTodo, ITodo } from "../../types/data";
import { useAuth } from "../lib/auth/useAuth";
// import axios from "axios";
// import { BASE_URL } from "../../constants/consants";
import { supabase } from "./supabase";

//!SUPABASE//

//get
export async function fetchTodos(userId: string) {
  const { data, error } = await supabase
    .from("todos")
    .select("*")
    .eq("user_id", userId)
    .order("position", { ascending: true });
  console.log(data);

  if (error) throw error;

  return data;
}

//post
export async function addTodo(title: string) {
  //! drag and drop

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const { count, error: countError } = await supabase
    .from("todos")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (countError) throw countError;

  const { data, error } = await supabase
    .from("todos")
    .insert({
      title,
      completed: false,
      user_id: user.id,
      position: count ?? 0,
      status: "todo",
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}

//patch
export async function toggleTodo(todo: ISupabaseTodo) {
  const completed = !todo.completed;

  const nextStatus = completed ? "completed" : (todo.previous_status ?? "todo");

  const { count } = await supabase
    .from("todos")
    .select("*", {
      head: true,
      count: "exact",
    })
    .eq("user_id", todo.user_id)
    .eq("status", nextStatus);

  const nextPosition = completed ? 0 : (count ?? 0);
  
  if (completed) {
  const { error } = await supabase.rpc(
    "shift_completed_positions",
    {
      p_user_id: todo.user_id,
    },
  );

  if (error) throw error;
}
  const { data, error } = await supabase
  .from("todos")
  .update({
    completed,
    status: nextStatus,
    previous_status: completed ? todo.status : null,
    position: nextPosition,
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

//reorder
export async function reorderTodos(todos: ISupabaseTodo[]) {
  const updates = todos.map((todo) => ({
    id: todo.id,
    position: todo.position,
    status: todo.status,
  }));

  const { error } = await supabase.from("todos").upsert(updates, {
    onConflict: "id",
  });

  if (error) throw error;
}

//clear completed
export async function clearCompleted(userId: string) {
  const { error } = await supabase
    .from("todos")
    .delete()
    .eq("user_id", userId)
    .eq("completed", true);

  if (error) throw error;
}

//edit todos
export async function updateTodo(todo: ISupabaseTodo) {
  const { data, error } = await supabase
    .from("todos")
    .update({
      title: todo.title,
      completed: todo.completed,
      status: todo.status,
    })
    .eq("id", todo.id)
    .select()
    .single();

  if (error) throw error;

  return data;
}

//update todo status
export async function updateTodoStatus(
  id: number,
  status: "todo" | "in_progress" | "completed" | "rejected",
) {
  const { data, error } = await supabase
    .from("todos")
    .update({ status })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  return data;
}
