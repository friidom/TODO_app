export interface ITodo {
  id: number;
  title: string;
  completed: boolean;
}
export interface IServiceTodo extends ITodo {
  userId: number;
}
export type TodoStatus = "todo" | "in_progress" | "completed" | "rejected";

export interface ISupabaseTodo {
  id: number;
  title: string;
  completed: boolean;
  position: number;
  user_id: string;

  status: TodoStatus;
  previous_status: TodoStatus | null;
}

export interface ISupabaseProfile {
  id: string;
  email: string;
  username: string | null;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
}
