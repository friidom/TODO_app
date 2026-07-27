export interface ITodo {
  id: number;
  title: string;
  completed: boolean;
}
export interface IServiceTodo extends ITodo {
  userId: number;
}
export interface ISupabaseTodo {
  id: number;
  title: string;
  completed: boolean;
  user_id: string;
  created_at: string;
  position: number;
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