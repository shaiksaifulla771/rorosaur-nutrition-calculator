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
  public: {
    Tables: {
      access_config: {
        Row: {
          created_at: string
          id: string
          kind: string
          note: string | null
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          note?: string | null
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          note?: string | null
          value?: string
        }
        Relationships: []
      }
      active_profile: {
        Row: {
          profile_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          profile_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          profile_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_profile_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      active_workspace_profile: {
        Row: {
          profile_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          profile_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          profile_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_workspace_profile_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "workspace_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_profile_name: string | null
          changes_json: Json
          created_at: string
          detail: Json
          entity_id: string | null
          entity_type: string | null
          id: string
          recipe_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_profile_name?: string | null
          changes_json?: Json
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          recipe_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_profile_name?: string | null
          changes_json?: Json
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          recipe_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_otp_challenge: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          device_hash: string
          email: string
          expires_at: string
          id: string
          user_id: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          device_hash: string
          email: string
          expires_at: string
          id?: string
          user_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          device_hash?: string
          email?: string
          expires_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      auth_registration_authorizations: {
        Row: {
          confirmed_at: string | null
          created_at: string
          email: string
          intended_role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          email: string
          intended_role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          email?: string
          intended_role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      auth_trusted_device: {
        Row: {
          device_hash: string
          expires_at: string
          id: string
          last_verified_at: string
          user_id: string
        }
        Insert: {
          device_hash: string
          expires_at: string
          id?: string
          last_verified_at?: string
          user_id: string
        }
        Update: {
          device_hash?: string
          expires_at?: string
          id?: string
          last_verified_at?: string
          user_id?: string
        }
        Relationships: []
      }
      auth_verified_session: {
        Row: {
          device_hash: string
          expires_at: string
          session_id: string
          user_id: string
          verified_at: string
        }
        Insert: {
          device_hash: string
          expires_at: string
          session_id: string
          user_id: string
          verified_at?: string
        }
        Update: {
          device_hash?: string
          expires_at?: string
          session_id?: string
          user_id?: string
          verified_at?: string
        }
        Relationships: []
      }
      ingredients: {
        Row: {
          amino_acids: Json
          created_at: string
          id: string
          name: string
          nutrients: Json
          source: string
          source_id: string
        }
        Insert: {
          amino_acids?: Json
          created_at?: string
          id?: string
          name: string
          nutrients?: Json
          source?: string
          source_id: string
        }
        Update: {
          amino_acids?: Json
          created_at?: string
          id?: string
          name?: string
          nutrients?: Json
          source?: string
          source_id?: string
        }
        Relationships: []
      }
      master_item_pins: {
        Row: {
          created_at: string
          id: string
          item_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "master_item_pins_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "master_items"
            referencedColumns: ["id"]
          },
        ]
      }
      master_items: {
        Row: {
          amino_acids: Json
          category: string
          created_at: string
          id: string
          is_active: boolean
          is_locked: boolean
          is_pinned: boolean
          name: string
          notes: string | null
          nutrients: Json
          quantity_g: number
          source: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amino_acids?: Json
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_locked?: boolean
          is_pinned?: boolean
          name: string
          notes?: string | null
          nutrients?: Json
          quantity_g?: number
          source?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amino_acids?: Json
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_locked?: boolean
          is_pinned?: boolean
          name?: string
          notes?: string | null
          nutrients?: Json
          quantity_g?: number
          source?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      otp_codes: {
        Row: {
          attempts: number
          consumed_at: string | null
          created_at: string
          device_hash: string
          email: string
          expires_at: string
          id: string
          otp_hash: string
        }
        Insert: {
          attempts?: number
          consumed_at?: string | null
          created_at?: string
          device_hash?: string
          email: string
          expires_at: string
          id?: string
          otp_hash: string
        }
        Update: {
          attempts?: number
          consumed_at?: string | null
          created_at?: string
          device_hash?: string
          email?: string
          expires_at?: string
          id?: string
          otp_hash?: string
        }
        Relationships: []
      }
      password_reset_approvals: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attempts: number
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          target_email: string
          target_user_id: string
          token_hash: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attempts?: number
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          target_email: string
          target_user_id: string
          token_hash: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attempts?: number
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          target_email?: string
          target_user_id?: string
          token_hash?: string
        }
        Relationships: []
      }
      pinned_ingredient: {
        Row: {
          created_at: string
          id: string
          item_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pinned_ingredient_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "master_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinned_ingredient_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_active: boolean
          photo_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          is_active?: boolean
          photo_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          photo_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          owner_profile_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          owner_profile_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          owner_profile_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rate_limit: {
        Row: {
          action: string
          hits: number
          id: string
          subject: string
          window_start: string
        }
        Insert: {
          action: string
          hits?: number
          id?: string
          subject: string
          window_start?: string
        }
        Update: {
          action?: string
          hits?: number
          id?: string
          subject?: string
          window_start?: string
        }
        Relationships: []
      }
      rda_settings: {
        Row: {
          age_band: string
          id: string
          nutrients: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          age_band: string
          id?: string
          nutrients?: Json
          updated_at?: string
          user_id?: string
        }
        Update: {
          age_band?: string
          id?: string
          nutrients?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recipe_versions: {
        Row: {
          aas_score: number | null
          actual_output_g: number | null
          changes: Json
          cooking_loss_pct: number | null
          created_at: string
          description: string | null
          id: string
          ingredients: Json
          prep_notes: string | null
          recipe_id: string
          safety_flags: Json
          serving_size_g: number | null
          total_calories: number | null
          totals: Json
          user_id: string
          version_number: number
          water_content_g: number | null
          yield_pct: number | null
        }
        Insert: {
          aas_score?: number | null
          actual_output_g?: number | null
          changes?: Json
          cooking_loss_pct?: number | null
          created_at?: string
          description?: string | null
          id?: string
          ingredients?: Json
          prep_notes?: string | null
          recipe_id: string
          safety_flags?: Json
          serving_size_g?: number | null
          total_calories?: number | null
          totals?: Json
          user_id?: string
          version_number: number
          water_content_g?: number | null
          yield_pct?: number | null
        }
        Update: {
          aas_score?: number | null
          actual_output_g?: number | null
          changes?: Json
          cooking_loss_pct?: number | null
          created_at?: string
          description?: string | null
          id?: string
          ingredients?: Json
          prep_notes?: string | null
          recipe_id?: string
          safety_flags?: Json
          serving_size_g?: number | null
          total_calories?: number | null
          totals?: Json
          user_id?: string
          version_number?: number
          water_content_g?: number | null
          yield_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_versions_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          age_band: string
          created_at: string
          current_version_id: string | null
          id: string
          is_pinned: boolean
          name: string
          owner_profile_id: string | null
          project_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          age_band?: string
          created_at?: string
          current_version_id?: string | null
          id?: string
          is_pinned?: boolean
          name: string
          owner_profile_id?: string | null
          project_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          age_band?: string
          created_at?: string
          current_version_id?: string | null
          id?: string
          is_pinned?: boolean
          name?: string
          owner_profile_id?: string | null
          project_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_current_version_fk"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "recipe_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      share_link: {
        Row: {
          created_at: string
          created_by_profile_id: string | null
          created_by_user_id: string | null
          id: string
          recipe_id: string
          revoked_at: string | null
          token: string
        }
        Insert: {
          created_at?: string
          created_by_profile_id?: string | null
          created_by_user_id?: string | null
          id?: string
          recipe_id: string
          revoked_at?: string | null
          token: string
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string | null
          created_by_user_id?: string | null
          id?: string
          recipe_id?: string
          revoked_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_link_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_link_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_with: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          recipe_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          recipe_id: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_with_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_with_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workspace_profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      account_has_password: { Args: { _email: string }; Returns: boolean }
      default_project_id: { Args: never; Returns: string }
      ensure_access_role: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_member: { Args: never; Returns: boolean }
      otp_required: { Args: never; Returns: boolean }
      owns_profile: { Args: { _profile_id: string }; Returns: boolean }
      session_verified: { Args: never; Returns: boolean }
      total_profile_count: { Args: never; Returns: number }
      workspace_id: { Args: never; Returns: string }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
