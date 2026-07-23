export interface ITodo {
  id: number;
  title: string;
  completed: boolean;
}
export interface IServiceTodo extends ITodo {
  userId: number;
}
