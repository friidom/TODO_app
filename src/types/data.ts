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