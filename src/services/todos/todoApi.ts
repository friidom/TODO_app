import type { ISupabaseTodo } from "../../types/data";
// import axios from "axios";
import { supabase } from "../api/supabase";

//!SUPABASE//

//!get
/**
 * Every todo on one board.
 *
 * Scoped by `board_id`, not `user_id`. RLS is the boundary and this filter is
 * defense in depth, but the two are not interchangeable: once M3 shares a
 * board, a `user_id` filter would hide every card a teammate created — from
 * someone allowed to see them.
 */
export async function fetchTodos(boardId: string) {
  const { data, error } = await supabase
    .from("todos")
    .select("*")
    .eq("board_id", boardId)
    .order("position", { ascending: true });

  if (error) throw error;

  return data;
}

//!post
export async function addTodo({
  title,
  column_id,
  board_id,
}: {
  title: string;
  column_id: string;
  board_id: string;
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
    .eq("board_id", board_id)
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
      board_id,
      completed: false,
      // Still sent: user_id is NOT NULL with an auth.uid() default, and stays
      // the ownership column until M2-13 drops it.
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
/**
 * `board_id` is in the payload deliberately, and this is not optional.
 *
 * PostgREST turns an upsert into INSERT ... ON CONFLICT DO UPDATE, and the
 * INSERT policy's WITH CHECK is evaluated against the *proposed* row. Omit
 * board_id and that row carries NULL, which fails M2-08's policy and M2-07's
 * NOT NULL — surfacing as a drag that silently reverts on refresh.
 *
 * Stamped from the board being viewed rather than read off each row, so the
 * value cannot be null even if a row in the cache is stale.
 */
export async function reorderTodos(todos: ISupabaseTodo[], boardId: string) {
  //update newest info
  const updates = todos.map((todo) => ({
    id: todo.id,
    position: todo.position,
    column_id: todo.column_id,
    board_id: boardId,
  }));
  
  const { error } = await supabase.from("todos").upsert(updates, {
    onConflict: "id",
  });
  
  if (error) throw error;
}

//!patch
//!clear completed
export async function clearCompleted(boardId: string) {
  const { error } = await supabase
    .from("todos")
    .delete()
    .eq("board_id", boardId)
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

