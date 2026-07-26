import type { ISupabaseTodo } from "../../types/data";
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

const {
  count,
  error: countError,
} = await supabase
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

    })
    .select()
    .single();

  if (error) throw error;

  return data;
}

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


//drag and drop order 
export async function reorderTodos(todos: ISupabaseTodo[]) {
  const updates = todos.map((todo, index) => ({
    id: todo.id,
    position: index,
  }));

  const { error } = await supabase
    .from("todos")
    .upsert(updates);

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