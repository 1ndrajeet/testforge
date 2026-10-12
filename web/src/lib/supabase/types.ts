// web/src/lib/supabase/types.ts
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      subjects: {
        Row: {
          id: string;
          code: string;
          name: string;
          scheme: string;
          abbr: string | null;
          is_deleted: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          scheme: string;
          abbr?: string | null;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          scheme?: string;
          abbr?: string | null;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      exam_centers: {
        Row: {
          id: string;
          owner_id: string;
          code: string;
          name: string;
          address: string | null;
          officer_incharge: string | null;
          sealing_supervisor: string | null;
          exam_controller: string | null;
          dist_center_code: string | null;
          dist_center_name: string | null;
          season: string | null;
          exam_year: number | null;
          start_date: string | null;
          end_date: string | null;
          departments: string[] | null;
          is_active: boolean;
          is_deleted: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          code: string;
          name: string;
          address?: string | null;
          officer_incharge?: string | null;
          sealing_supervisor?: string | null;
          exam_controller?: string | null;
          dist_center_code?: string | null;
          dist_center_name?: string | null;
          season?: string | null;
          exam_year?: number | null;
          start_date?: string | null;
          end_date?: string | null;
          departments?: string[] | null;
          is_active?: boolean;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          code?: string;
          name?: string;
          address?: string | null;
          officer_incharge?: string | null;
          sealing_supervisor?: string | null;
          exam_controller?: string | null;
          dist_center_code?: string | null;
          dist_center_name?: string | null;
          season?: string | null;
          exam_year?: number | null;
          start_date?: string | null;
          end_date?: string | null;
          departments?: string[] | null;
          is_active?: boolean;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      payments: {
        Row: {
          id: string;
          exam_center_id: string;
          plan_id: string;
          plan_name: string;
          amount: number;
          currency: string;
          status: string;
          razorpay_order_id: string | null;
          razorpay_payment_id: string | null;
          razorpay_signature: string | null;
          start_date: string | null;
          end_date: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          exam_center_id: string;
          plan_id: string;
          plan_name: string;
          amount: number;
          currency?: string;
          status?: string;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          razorpay_signature?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          exam_center_id?: string;
          plan_id?: string;
          plan_name?: string;
          amount?: number;
          currency?: string;
          status?: string;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          razorpay_signature?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      connected_institutes: {
        Row: {
          id: string;
          exam_center_id: string;
          institute_code: string;
          institute_name: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          exam_center_id: string;
          institute_code: string;
          institute_name: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          exam_center_id?: string;
          institute_code?: string;
          institute_name?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      students: {
        Row: {
          id: string;
          exam_center_id: string;
          connected_institute_id: string;
          seat_number: number;
          institute_code: string | null;
          enrollment_number: string | null;
          name: string | null;
          scheme: string | null;
          subjects: string[] | null;
          sub_codes: string[] | null;
          is_deleted: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          exam_center_id: string;
          connected_institute_id: string;
          seat_number: number;
          institute_code?: string | null;
          enrollment_number?: string | null;
          name?: string | null;
          scheme?: string | null;
          subjects?: string[] | null;
          sub_codes?: string[] | null;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          exam_center_id?: string;
          connected_institute_id?: string;
          seat_number?: number;
          institute_code?: string | null;
          enrollment_number?: string | null;
          name?: string | null;
          scheme?: string | null;
          subjects?: string[] | null;
          sub_codes?: string[] | null;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      staff: {
        Row: {
          id: string;
          exam_center_id: string;
          uid: string;
          name: string;
          department: string;
          email: string | null;
          staff_type: string;
          role: string | null;
          designation: string | null;
          post_held_in_examination: string | null;
          is_deleted: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          exam_center_id: string;
          uid: string;
          name: string;
          department: string;
          email?: string | null;
          staff_type: string;
          role?: string | null;
          designation?: string | null;
          post_held_in_examination?: string | null;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          exam_center_id?: string;
          uid?: string;
          name?: string;
          department?: string;
          email?: string | null;
          staff_type?: string;
          role?: string | null;
          designation?: string | null;
          post_held_in_examination?: string | null;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      blocks: {
        Row: {
          id: string;
          exam_center_id: string;
          block_no: string;
          location: string;
          name: string;
          strength: number;
          distribution: number[];
          template: number;
          is_deleted: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          exam_center_id: string;
          block_no: string;
          location: string;
          name: string;
          strength: number;
          distribution?: number[];
          template?: number;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          exam_center_id?: string;
          block_no?: string;
          location?: string;
          name?: string;
          strength?: number;
          distribution?: number[];
          template?: number;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      timetable: {
        Row: {
          id: string;
          exam_center_id: string;
          subject_id: string | null;
          exam_day: number | null;
          date: string;
          session: string;
          time_slot: string;
          subject_code: string;
          subject_name: string;
          scheme: string;
          subject_abbr: string | null;
          total_students: number;
          absent_numbers: number[];
          cps_students: number[];
          cps_resolved: number[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          exam_center_id: string;
          subject_id?: string | null;
          exam_day?: number | null;
          date: string;
          session: string;
          time_slot: string;
          subject_code: string;
          subject_name: string;
          scheme: string;
          subject_abbr?: string | null;
          total_students?: number;
          absent_numbers?: number[];
          cps_students?: number[];
          cps_resolved?: number[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          exam_center_id?: string;
          subject_id?: string | null;
          exam_day?: number | null;
          date?: string;
          session?: string;
          time_slot?: string;
          subject_code?: string;
          subject_name?: string;
          scheme?: string;
          subject_abbr?: string | null;
          total_students?: number;
          absent_numbers?: number[];
          cps_students?: number[];
          cps_resolved?: number[];
          created_at?: string;
          updated_at?: string;
        };
      };
      block_allocations: {
        Row: {
          id: string;
          exam_center_id: string;
          connected_institute_id: string | null;
          date: string;
          session: string;
          timeslot: string | null;
          block_id: string | null;
          block_no: string | null;
          location: string | null;
          scheme: string;
          subject_code: string;
          subject_name: string;
          seat_numbers: number[];
          first_seat: number | null;
          last_seat: number | null;
          assigned_count: number | null;
          strength: number | null;
          supervisor_uid: string | null;
          supervisor_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          exam_center_id: string;
          connected_institute_id?: string | null;
          date: string;
          session: string;
          timeslot?: string | null;
          block_id?: string | null;
          block_no?: string | null;
          location?: string | null;
          scheme: string;
          subject_code: string;
          subject_name: string;
          seat_numbers: number[];
          first_seat?: number | null;
          last_seat?: number | null;
          assigned_count?: number | null;
          strength?: number | null;
          supervisor_uid?: string | null;
          supervisor_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          exam_center_id?: string;
          connected_institute_id?: string | null;
          date?: string;
          session?: string;
          timeslot?: string | null;
          block_id?: string | null;
          block_no?: string | null;
          location?: string | null;
          scheme?: string;
          subject_code?: string;
          subject_name?: string;
          seat_numbers?: number[];
          first_seat?: number | null;
          last_seat?: number | null;
          assigned_count?: number | null;
          strength?: number | null;
          supervisor_uid?: string | null;
          supervisor_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      orders: {
        Row: {
          id: string;
          exam_center_id: string;
          staff_id: string;
          order_type: string;
          date: string | null;
          session: string | null;
          order_key: string | null;
          sent_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          exam_center_id: string;
          staff_id: string;
          order_type: string;
          date?: string | null;
          session?: string | null;
          order_key?: string | null;
          sent_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          exam_center_id?: string;
          staff_id?: string;
          order_type?: string;
          date?: string | null;
          session?: string | null;
          order_key?: string | null;
          sent_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      e_marksheets: {
        Row: {
          id: string;
          exam_center_id: string;
          sheet_no: string | null;
          subject_name: string | null;
          scheme: string | null;
          subject_head: string | null;
          paper_code: string | null;
          file_name: string | null;
          processed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          exam_center_id: string;
          sheet_no?: string | null;
          subject_name?: string | null;
          scheme?: string | null;
          subject_head?: string | null;
          paper_code?: string | null;
          file_name?: string | null;
          processed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          exam_center_id?: string;
          sheet_no?: string | null;
          subject_name?: string | null;
          scheme?: string | null;
          subject_head?: string | null;
          paper_code?: string | null;
          file_name?: string | null;
          processed_at?: string | null;
          created_at?: string;
        };
      };
      qp_inventory: {
        Row: {
          id: string;
          exam_center_id: string;
          day: number | null;
          date: string | null;
          session: string | null;
          subject_code: string | null;
          expected_students: number | null;
          expected_packets: number | null;
          received_packets: number | null;
          received_qps: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          exam_center_id: string;
          day?: number | null;
          date?: string | null;
          session?: string | null;
          subject_code?: string | null;
          expected_students?: number | null;
          expected_packets?: number | null;
          received_packets?: number | null;
          received_qps?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          exam_center_id?: string;
          day?: number | null;
          date?: string | null;
          session?: string | null;
          subject_code?: string | null;
          expected_students?: number | null;
          expected_packets?: number | null;
          received_packets?: number | null;
          received_qps?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      uploads: {
        Row: {
          id: string;
          exam_center_id: string;
          file_type: string;
          original_filename: string | null;
          stored_filename: string | null;
          file_hash: string | null;
          file_size: number | null;
          status: string;
          record_count: number | null;
          error_message: string | null;
          metadata: Json;
          connected_institute_id: string | null;
          processed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          exam_center_id: string;
          file_type: string;
          original_filename?: string | null;
          stored_filename?: string | null;
          file_hash?: string | null;
          file_size?: number | null;
          status?: string;
          record_count?: number | null;
          error_message?: string | null;
          metadata?: Json;
          connected_institute_id?: string | null;
          processed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          exam_center_id?: string;
          file_type?: string;
          original_filename?: string | null;
          stored_filename?: string | null;
          file_hash?: string | null;
          file_size?: number | null;
          status?: string;
          record_count?: number | null;
          error_message?: string | null;
          metadata?: Json;
          connected_institute_id?: string | null;
          processed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      email_logs: {
        Row: {
          id: string;
          exam_center_id: string;
          user_id: string | null;
          recipient_email: string | null;
          recipient_name: string | null;
          subject: string | null;
          order_type: string | null;
          order_key: string | null;
          status: string | null;
          error_message: string | null;
          sent_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          exam_center_id: string;
          user_id?: string | null;
          recipient_email?: string | null;
          recipient_name?: string | null;
          subject?: string | null;
          order_type?: string | null;
          order_key?: string | null;
          status?: string | null;
          error_message?: string | null;
          sent_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          exam_center_id?: string;
          user_id?: string | null;
          recipient_email?: string | null;
          recipient_name?: string | null;
          subject?: string | null;
          order_type?: string | null;
          order_key?: string | null;
          status?: string | null;
          error_message?: string | null;
          sent_at?: string | null;
          created_at?: string;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string | null;
          action: string;
          entity_type: string | null;
          entity_id: string | null;
          old_values: Json | null;
          new_values: Json | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          action: string;
          entity_type?: string | null;
          entity_id?: string | null;
          old_values?: Json | null;
          new_values?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          action?: string;
          entity_type?: string | null;
          entity_id?: string | null;
          old_values?: Json | null;
          new_values?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
      };
    };
    Functions: {
      user_owns_exam_center: {
        Args: { ec: string };
        Returns: boolean;
      };
    };
  };
}
