import type { ColumnCategory } from "@/constants/columns";

export interface ISupabaseTodo {
  id: number;
  title: string;
  completed: boolean;
  position: number;
  user_id: string;
  created_at: string;
  column_id: string;

  //
  isOptimistic?: boolean;
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
export interface IColumn {
  id: string;
  title: string;
  position: number;
  user_id: string;
  category: ColumnCategory;
  /** Advisory work-item limits; `null` means no limit set. */
  min_limit: number | null;
  max_limit: number | null;
}

export interface TodoItemProps extends ISupabaseTodo {
  overlay?: boolean;
  menuOpen: boolean;
  // currentColumnId: string;
  closeMenu: () => void;
  openMenu: () => void;
}
export interface TodoMenuProps {
  menuOpen: boolean;

  openMenu?: () => void;

  closeMenu?: () => void;

  onEdit?: () => void;

  todoId: number;

  // currentColumnId: string;
}
