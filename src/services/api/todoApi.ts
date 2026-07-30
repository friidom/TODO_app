import type { ISupabaseTodo, ITodo, TodoStatus } from "../../types/data";
import { useAuth } from "../lib/auth/useAuth";
// import axios from "axios";
// import { BASE_URL } from "../../constants/consants";
import { supabase } from "./supabase";

//!SUPABASE//

//!get
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

//!post
export async function addTodo({
  title,
  status,
}: {
  title: string;
  status: TodoStatus;
}) {
  //get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  //get count of todos
  const { data: lastTodo, error: lastTodoError } = await supabase
    .from("todos")
    .select("position", { count: "exact", head: true })
    .eq("status", status)
    .eq("user_id", user.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastTodoError) throw lastTodoError;

  const position = (lastTodo?.position ?? -1) + 1;

  //insert it in database
  const { data, error } = await supabase
    .from("todos")
    .insert({
      title,
      status,
      completed: false,
      user_id: user.id,
      position,
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}

//!patch
export async function toggleTodo(todo: ISupabaseTodo) {
  const completed = !todo.completed;

  //next status after toggle
  const nextStatus = completed ? "completed" : (todo.previous_status ?? "todo");

  //count todos for current position (where it will be returned)
  const { count } = await supabase
    .from("todos")
    .select("*", {
      head: true,
      count: "exact",
    })
    .eq("user_id", todo.user_id)
    .eq("status", nextStatus);

  //next position
  const nextPosition = completed ? 0 : (count ?? 0);

  if (completed) {
    const { error } = await supabase.rpc("shift_completed_positions", {
      p_user_id: todo.user_id,
    });

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

//!delete
export async function deleteTodo(id: number) {
  const { error } = await supabase.from("todos").delete().eq("id", id);

  if (error) throw error;

  return id;
}

//!reorder
export async function reorderTodos(todos: ISupabaseTodo[]) {
  //update newest info
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

//!clear completed
export async function clearCompleted(userId: string) {
  const { error } = await supabase
    .from("todos")
    .delete()
    .eq("user_id", userId)
    .eq("completed", true);

  if (error) throw error;
}

//!edit todos
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

//!update todo status
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
