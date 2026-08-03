import type { IColumn, ISupabaseTodo } from "../../types/data";
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
  column_id,
}: {
  title: string;
  column_id: string;
}) {
  //get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  //get count of todos
  const { data: lastTodo, error: lastTodoError } = await supabase
    .from("todos")
    .select("position")
    .eq("column_id", column_id)
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
      column_id,
      completed: false,
      user_id: user.id,
      position,
    })
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
    column_id: todo.column_id,
  }));
  
  const { error } = await supabase.from("todos").upsert(updates, {
    onConflict: "id",
  });
  
  if (error) throw error;
}

//!patch
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
      column_id: todo.column_id,
    })
    .eq("id", todo.id)
    .select()
    .single();

  if (error) throw error;

  return data;
}

//!update todo status
export async function updateTodoColumn(id: number, column_id: string) {
  const { data, error } = await supabase
    .from("todos")
    .update({ column_id })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  return data;
}

