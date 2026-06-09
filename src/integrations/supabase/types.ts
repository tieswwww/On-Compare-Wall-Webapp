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
      shoe_events: {
        Row: {
          created_at: string
          ean: string | null
          event_type: string
          id: string
          previous_ean: string | null
          raw: Json | null
          side: string | null
        }
        Insert: {
          created_at?: string
          ean?: string | null
          event_type: string
          id?: string
          previous_ean?: string | null
          raw?: Json | null
          side?: string | null
        }
        Update: {
          created_at?: string
          ean?: string | null
          event_type?: string
          id?: string
          previous_ean?: string | null
          raw?: Json | null
          side?: string | null
        }
        Relationships: []
      }
      shoe_image_urls: {
        Row: {
          created_at: string
          ean: string
          expires_at: string
          url: string
        }
        Insert: {
          created_at?: string
          ean: string
          expires_at: string
          url: string
        }
        Update: {
          created_at?: string
          ean?: string
          expires_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "shoe_image_urls_ean_fkey"
            columns: ["ean"]
            isOneToOne: true
            referencedRelation: "shoes"
            referencedColumns: ["ean"]
          },
        ]
      }
      shoe_slots: {
        Row: {
          ean: string | null
          side: string
          updated_at: string
        }
        Insert: {
          ean?: string | null
          side: string
          updated_at?: string
        }
        Update: {
          ean?: string | null
          side?: string
          updated_at?: string
        }
        Relationships: []
      }
      shoe_split_videos: {
        Row: {
          commercial_name: string
          created_at: string
          updated_at: string
          video_filename: string
        }
        Insert: {
          commercial_name: string
          created_at?: string
          updated_at?: string
          video_filename: string
        }
        Update: {
          commercial_name?: string
          created_at?: string
          updated_at?: string
          video_filename?: string
        }
        Relationships: []
      }
      shoes: {
        Row: {
          activity_best_for: string | null
          activity_type: string | null
          bottom_foam: string | null
          cloudtec_config: string | null
          colorway: string | null
          commercial_name: string | null
          conditions: string | null
          created_at: string
          cushioning_scale: number | null
          description: string | null
          description_short: string | null
          drop_out_date: string | null
          ean: string
          experience: string | null
          fit: string | null
          forefoot_stack_mm: number | null
          gallery_image_url: string | null
          heel_drop_mm: number | null
          heel_stack_mm: number | null
          highlight_image_urls: string[] | null
          image_path: string | null
          lacing: string | null
          launch_date: string | null
          lookbook_url: string | null
          model: string | null
          name: string | null
          product_code: string | null
          recommended_distance: string | null
          responsiveness_scale: number | null
          ride_type: string | null
          sales_color_name: string | null
          size_recommendation: string | null
          stability_scale: number | null
          style_code: string | null
          technology: string | null
          thumbnail_url: string | null
          top_foam: string | null
          updated_at: string
          usps: string[] | null
          vertical_name: string | null
          weight_g: number | null
        }
        Insert: {
          activity_best_for?: string | null
          activity_type?: string | null
          bottom_foam?: string | null
          cloudtec_config?: string | null
          colorway?: string | null
          commercial_name?: string | null
          conditions?: string | null
          created_at?: string
          cushioning_scale?: number | null
          description?: string | null
          description_short?: string | null
          drop_out_date?: string | null
          ean: string
          experience?: string | null
          fit?: string | null
          forefoot_stack_mm?: number | null
          gallery_image_url?: string | null
          heel_drop_mm?: number | null
          heel_stack_mm?: number | null
          highlight_image_urls?: string[] | null
          image_path?: string | null
          lacing?: string | null
          launch_date?: string | null
          lookbook_url?: string | null
          model?: string | null
          name?: string | null
          product_code?: string | null
          recommended_distance?: string | null
          responsiveness_scale?: number | null
          ride_type?: string | null
          sales_color_name?: string | null
          size_recommendation?: string | null
          stability_scale?: number | null
          style_code?: string | null
          technology?: string | null
          thumbnail_url?: string | null
          top_foam?: string | null
          updated_at?: string
          usps?: string[] | null
          vertical_name?: string | null
          weight_g?: number | null
        }
        Update: {
          activity_best_for?: string | null
          activity_type?: string | null
          bottom_foam?: string | null
          cloudtec_config?: string | null
          colorway?: string | null
          commercial_name?: string | null
          conditions?: string | null
          created_at?: string
          cushioning_scale?: number | null
          description?: string | null
          description_short?: string | null
          drop_out_date?: string | null
          ean?: string
          experience?: string | null
          fit?: string | null
          forefoot_stack_mm?: number | null
          gallery_image_url?: string | null
          heel_drop_mm?: number | null
          heel_stack_mm?: number | null
          highlight_image_urls?: string[] | null
          image_path?: string | null
          lacing?: string | null
          launch_date?: string | null
          lookbook_url?: string | null
          model?: string | null
          name?: string | null
          product_code?: string | null
          recommended_distance?: string | null
          responsiveness_scale?: number | null
          ride_type?: string | null
          sales_color_name?: string | null
          size_recommendation?: string | null
          stability_scale?: number | null
          style_code?: string | null
          technology?: string | null
          thumbnail_url?: string | null
          top_foam?: string | null
          updated_at?: string
          usps?: string[] | null
          vertical_name?: string | null
          weight_g?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
