export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activities: {
        Row: {
          action: string
          actor_id: string | null
          board_id: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          payload: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          board_id: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          payload?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          board_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "activities_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
        ]
      }
      board_invites: {
        Row: {
          accepted_at: string | null
          board_id: string
          created_at: string
          created_by: string | null
          email: string | null
          expires_at: string
          id: string
          role: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          board_id: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          expires_at: string
          id?: string
          role: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          board_id?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          expires_at?: string
          id?: string
          role?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_invites_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      board_members: {
        Row: {
          board_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          board_id: string
          joined_at?: string
          role: string
          user_id: string
        }
        Update: {
          board_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_members_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      boards: {
        Row: {
          cover_color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          key_prefix: string
          next_key: number
          owner_id: string
          space_id: string | null
          title: string | null
          updated_at: string
          visibility: string
        }
        Insert: {
          cover_color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          key_prefix?: string
          next_key?: number
          owner_id: string
          space_id?: string | null
          title?: string | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          cover_color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          key_prefix?: string
          next_key?: number
          owner_id?: string
          space_id?: string | null
          title?: string | null
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "boards_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boards_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      columns: {
        Row: {
          board_id: string
          category: string | null
          created_at: string
          id: string
          max_limit: number | null
          min_limit: number | null
          position: number | null
          rank: number | null
          title: string | null
          updated_at: string
        }
        Insert: {
          board_id: string
          category?: string | null
          created_at?: string
          id?: string
          max_limit?: number | null
          min_limit?: number | null
          position?: number | null
          rank?: number | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          board_id?: string
          category?: string | null
          created_at?: string
          id?: string
          max_limit?: number | null
          min_limit?: number | null
          position?: number | null
          rank?: number | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "columns_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string
          board_id: string
          content: string
          created_at: string
          id: string
          todo_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          board_id: string
          content: string
          created_at?: string
          id?: string
          todo_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          board_id?: string
          content?: string
          created_at?: string
          id?: string
          todo_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_todo_id_fkey"
            columns: ["todo_id", "board_id"]
            isOneToOne: false
            referencedRelation: "todos"
            referencedColumns: ["id", "board_id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          board_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          payload: Json
          read_at: string | null
          type: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          board_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          payload?: Json
          read_at?: string | null
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          board_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          payload?: Json
          read_at?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          username?: string
        }
        Relationships: []
      }
      spaces: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "spaces_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      todos: {
        Row: {
          archived: boolean
          assignee_id: string | null
          board_id: string
          board_key: number | null
          column_id: string | null
          created_at: string
          creator_id: string | null
          description: string | null
          due_date: string | null
          estimate: number | null
          id: string
          position: number | null
          previous_status: string | null
          priority: string | null
          rank: number | null
          start_date: string | null
          status: string | null
          title: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          archived?: boolean
          assignee_id?: string | null
          board_id: string
          board_key?: number | null
          column_id?: string | null
          created_at?: string
          creator_id?: string | null
          description?: string | null
          due_date?: string | null
          estimate?: number | null
          id?: string
          position?: number | null
          previous_status?: string | null
          priority?: string | null
          rank?: number | null
          start_date?: string | null
          status?: string | null
          title?: string | null
          type?: string
          updated_at?: string | null
        }
        Update: {
          archived?: boolean
          assignee_id?: string | null
          board_id?: string
          board_key?: number | null
          column_id?: string | null
          created_at?: string
          creator_id?: string | null
          description?: string | null
          due_date?: string | null
          estimate?: number | null
          id?: string
          position?: number | null
          previous_status?: string | null
          priority?: string | null
          rank?: number | null
          start_date?: string | null
          status?: string | null
          title?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "todos_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todos_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todos_column_id_fkey"
            columns: ["column_id", "board_id"]
            isOneToOne: false
            referencedRelation: "columns"
            referencedColumns: ["id", "board_id"]
          },
          {
            foreignKeyName: "todos_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: {
        Args: { p_token: string }
        Returns: {
          board_id: string
          status: string
        }[]
      }
      accessible_board_ids: { Args: never; Returns: string[] }
      add_board_member: {
        Args: { p_board_id: string; p_role: string; p_user_id: string }
        Returns: undefined
      }
      available_username: {
        Args: { p_seed?: string; p_wanted: string }
        Returns: string
      }
      board_role: { Args: { p_board_id: string }; Returns: string }
      board_role_rank: { Args: { p_role: string }; Returns: number }
      board_roster: {
        Args: { p_board_id: string }
        Returns: {
          avatar_url: string
          full_name: string
          id: string
          joined_at: string
          role: string
          username: string
        }[]
      }
      create_invite: {
        Args: {
          p_board_id: string
          p_email?: string
          p_expires_in_days?: number
          p_role: string
        }
        Returns: {
          email: string
          expires_at: string
          id: string
          role: string
          token: string
        }[]
      }
      decline_invite: { Args: { p_token: string }; Returns: boolean }
      delete_column: {
        Args: { p_column_id: string; p_move_to_column_id: string }
        Returns: undefined
      }
      is_board_member: { Args: { p_board_id: string }; Returns: boolean }
      is_board_owner: {
        Args: { p_board_id: string; p_user_id: string }
        Returns: boolean
      }
      is_valid_username: { Args: { p_username: string }; Returns: boolean }
      leave_board: { Args: { p_board_id: string }; Returns: undefined }
      login_email_for: { Args: { p_username: string }; Returns: string }
      my_pending_invites: {
        Args: never
        Returns: {
          board_id: string
          board_title: string
          expires_at: string
          id: string
          role: string
          token: string
        }[]
      }
      normalize_username: { Args: { p_username: string }; Returns: string }
      owns_space: { Args: { p_space_id: string }; Returns: boolean }
      provision_new_user: { Args: never; Returns: string }
      provision_user: { Args: { p_user_id: string }; Returns: string }
      prune_activities: { Args: { p_keep_days?: number }; Returns: number }
      rebalance_board_column_ranks: {
        Args: { p_board_id: string }
        Returns: number
      }
      rebalance_column_ranks: { Args: { p_column_id: string }; Returns: number }
      remove_board_member: {
        Args: { p_board_id: string; p_user_id: string }
        Returns: undefined
      }
      revoke_invite: { Args: { p_invite_id: string }; Returns: undefined }
      search_board_invitees: {
        Args: { p_board_id: string; p_query: string }
        Returns: {
          avatar_url: string
          email: string
          full_name: string
          id: string
          username: string
        }[]
      }
      set_member_role: {
        Args: { p_board_id: string; p_role: string; p_user_id: string }
        Returns: undefined
      }
      username_available: { Args: { p_username: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
