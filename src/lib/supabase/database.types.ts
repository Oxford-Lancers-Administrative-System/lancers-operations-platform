/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Regenerate with `npm run types:generate` against the local Supabase stack.
 * `npm run types:check` fails when this file has drifted from the local schema.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      alternative_groups: {
        Row: {
          created_at: string
          id: string
          label: string
          note: string | null
          season_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          note?: string | null
          season_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          note?: string | null
          season_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alternative_groups_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          capacity: Database["public"]["Enums"]["invitation_capacity"]
          event_id: string
          event_status: Database["public"]["Enums"]["event_status"]
          id: string
          person_id: string | null
          presence: Database["public"]["Enums"]["attendance_presence"]
          recorded_at: string
          recorded_by_person_id: string | null
          season_id: string
          season_membership_id: string | null
        }
        Insert: {
          capacity: Database["public"]["Enums"]["invitation_capacity"]
          event_id: string
          event_status: Database["public"]["Enums"]["event_status"]
          id?: string
          person_id?: string | null
          presence: Database["public"]["Enums"]["attendance_presence"]
          recorded_at?: string
          recorded_by_person_id?: string | null
          season_id: string
          season_membership_id?: string | null
        }
        Update: {
          capacity?: Database["public"]["Enums"]["invitation_capacity"]
          event_id?: string
          event_status?: Database["public"]["Enums"]["event_status"]
          id?: string
          person_id?: string | null
          presence?: Database["public"]["Enums"]["attendance_presence"]
          recorded_at?: string
          recorded_by_person_id?: string | null
          season_id?: string
          season_membership_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_event_same_season"
            columns: ["event_id", "season_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id", "season_id"]
          },
          {
            foreignKeyName: "attendance_records_event_same_season"
            columns: ["event_id", "season_id"]
            isOneToOne: false
            referencedRelation: "rsvp_attendance_mismatches"
            referencedColumns: ["event_id", "season_id"]
          },
          {
            foreignKeyName: "attendance_records_event_state_is_current"
            columns: ["event_id", "event_status"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id", "status"]
          },
          {
            foreignKeyName: "attendance_records_membership_same_season"
            columns: ["season_membership_id", "season_id"]
            isOneToOne: false
            referencedRelation: "constitutional_membership"
            referencedColumns: ["season_membership_id", "season_id"]
          },
          {
            foreignKeyName: "attendance_records_membership_same_season"
            columns: ["season_membership_id", "season_id"]
            isOneToOne: false
            referencedRelation: "season_memberships"
            referencedColumns: ["id", "season_id"]
          },
          {
            foreignKeyName: "attendance_records_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "attendance_records_recorded_by_person_id_fkey"
            columns: ["recorded_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_recorded_by_person_id_fkey"
            columns: ["recorded_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_label: string | null
          actor_person_id: string | null
          context: Json
          entity_id: string
          entity_table: string
          from_state: string | null
          id: string
          occurred_at: string
          reason: string | null
          to_state: string | null
        }
        Insert: {
          action: string
          actor_label?: string | null
          actor_person_id?: string | null
          context?: Json
          entity_id: string
          entity_table: string
          from_state?: string | null
          id?: string
          occurred_at?: string
          reason?: string | null
          to_state?: string | null
        }
        Update: {
          action?: string
          actor_label?: string | null
          actor_person_id?: string | null
          context?: Json
          entity_id?: string
          entity_table?: string
          from_state?: string | null
          id?: string
          occurred_at?: string
          reason?: string | null
          to_state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_person_id_fkey"
            columns: ["actor_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_actor_person_id_fkey"
            columns: ["actor_person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
        ]
      }
      availability_statuses: {
        Row: {
          confirmed_by_person_id: string | null
          effective_from: string
          id: string
          level: Database["public"]["Enums"]["availability_level"]
          recorded_at: string
          reported_by_person_id: string
          review_on: string | null
          season_membership_id: string
        }
        Insert: {
          confirmed_by_person_id?: string | null
          effective_from: string
          id?: string
          level: Database["public"]["Enums"]["availability_level"]
          recorded_at?: string
          reported_by_person_id: string
          review_on?: string | null
          season_membership_id: string
        }
        Update: {
          confirmed_by_person_id?: string | null
          effective_from?: string
          id?: string
          level?: Database["public"]["Enums"]["availability_level"]
          recorded_at?: string
          reported_by_person_id?: string
          review_on?: string | null
          season_membership_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_statuses_confirmed_by_person_id_fkey"
            columns: ["confirmed_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_statuses_confirmed_by_person_id_fkey"
            columns: ["confirmed_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "availability_statuses_reported_by_person_id_fkey"
            columns: ["reported_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_statuses_reported_by_person_id_fkey"
            columns: ["reported_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "availability_statuses_season_membership_id_fkey"
            columns: ["season_membership_id"]
            isOneToOne: false
            referencedRelation: "constitutional_membership"
            referencedColumns: ["season_membership_id"]
          },
          {
            foreignKeyName: "availability_statuses_season_membership_id_fkey"
            columns: ["season_membership_id"]
            isOneToOne: false
            referencedRelation: "season_memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      committee_years: {
        Row: {
          agm_held_on: string | null
          created_at: string
          ends_on: string | null
          id: string
          label: string
          starts_on: string
        }
        Insert: {
          agm_held_on?: string | null
          created_at?: string
          ends_on?: string | null
          id?: string
          label: string
          starts_on: string
        }
        Update: {
          agm_held_on?: string | null
          created_at?: string
          ends_on?: string | null
          id?: string
          label?: string
          starts_on?: string
        }
        Relationships: []
      }
      contact_points: {
        Row: {
          created_at: string
          id: string
          is_preferred: boolean
          kind: Database["public"]["Enums"]["contact_point_kind"]
          normalised_value: string | null
          person_id: string
          raw_value: string
          source: string | null
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_preferred?: boolean
          kind: Database["public"]["Enums"]["contact_point_kind"]
          normalised_value?: string | null
          person_id: string
          raw_value: string
          source?: string | null
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_preferred?: boolean
          kind?: Database["public"]["Enums"]["contact_point_kind"]
          normalised_value?: string | null
          person_id?: string
          raw_value?: string
          source?: string | null
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_points_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_points_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
        ]
      }
      delivery_attempts: {
        Row: {
          accepted_at: string | null
          attempt_number: number
          channel: Database["public"]["Enums"]["notification_channel"]
          concluded_at: string | null
          failure_reason: string | null
          id: string
          notification_job_id: string
          provider: string
          provider_message_id: string | null
          requested_at: string
          rsvp_access_token_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          attempt_number: number
          channel: Database["public"]["Enums"]["notification_channel"]
          concluded_at?: string | null
          failure_reason?: string | null
          id?: string
          notification_job_id: string
          provider: string
          provider_message_id?: string | null
          requested_at?: string
          rsvp_access_token_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          attempt_number?: number
          channel?: Database["public"]["Enums"]["notification_channel"]
          concluded_at?: string | null
          failure_reason?: string | null
          id?: string
          notification_job_id?: string
          provider?: string
          provider_message_id?: string | null
          requested_at?: string
          rsvp_access_token_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_attempts_notification_job_id_fkey"
            columns: ["notification_job_id"]
            isOneToOne: false
            referencedRelation: "notification_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_attempts_rsvp_access_token_id_fkey"
            columns: ["rsvp_access_token_id"]
            isOneToOne: false
            referencedRelation: "rsvp_access_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_callbacks: {
        Row: {
          applied_at: string | null
          delivery_attempt_id: string | null
          id: string
          ignored_reason: string | null
          provider: string
          provider_event_id: string
          provider_message_id: string | null
          provider_status: string | null
          received_at: string
          signature_verified: boolean
        }
        Insert: {
          applied_at?: string | null
          delivery_attempt_id?: string | null
          id?: string
          ignored_reason?: string | null
          provider: string
          provider_event_id: string
          provider_message_id?: string | null
          provider_status?: string | null
          received_at?: string
          signature_verified: boolean
        }
        Update: {
          applied_at?: string | null
          delivery_attempt_id?: string | null
          id?: string
          ignored_reason?: string | null
          provider?: string
          provider_event_id?: string
          provider_message_id?: string | null
          provider_status?: string | null
          received_at?: string
          signature_verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "delivery_callbacks_delivery_attempt_id_fkey"
            columns: ["delivery_attempt_id"]
            isOneToOne: false
            referencedRelation: "delivery_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_results: {
        Row: {
          actor_person_id: string | null
          attempt_number: number
          channel: Database["public"]["Enums"]["notification_channel"]
          detail: string | null
          id: string
          notification_job_id: string
          occurred_at: string
          outcome: Database["public"]["Enums"]["delivery_outcome"]
          provider: string | null
          provider_message_id: string | null
        }
        Insert: {
          actor_person_id?: string | null
          attempt_number: number
          channel: Database["public"]["Enums"]["notification_channel"]
          detail?: string | null
          id?: string
          notification_job_id: string
          occurred_at?: string
          outcome: Database["public"]["Enums"]["delivery_outcome"]
          provider?: string | null
          provider_message_id?: string | null
        }
        Update: {
          actor_person_id?: string | null
          attempt_number?: number
          channel?: Database["public"]["Enums"]["notification_channel"]
          detail?: string | null
          id?: string
          notification_job_id?: string
          occurred_at?: string
          outcome?: Database["public"]["Enums"]["delivery_outcome"]
          provider?: string | null
          provider_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_results_actor_person_id_fkey"
            columns: ["actor_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_results_actor_person_id_fkey"
            columns: ["actor_person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "delivery_results_notification_job_id_fkey"
            columns: ["notification_job_id"]
            isOneToOne: false
            referencedRelation: "notification_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      eligibility_records: {
        Row: {
          checked_at: string | null
          competition: Database["public"]["Enums"]["competition_scope"]
          created_at: string
          determining_authority: string
          effective_from: string
          effective_to: string | null
          evidence_reference: string | null
          id: string
          season_id: string
          season_membership_id: string
          status: Database["public"]["Enums"]["eligibility_status"]
        }
        Insert: {
          checked_at?: string | null
          competition: Database["public"]["Enums"]["competition_scope"]
          created_at?: string
          determining_authority: string
          effective_from: string
          effective_to?: string | null
          evidence_reference?: string | null
          id?: string
          season_id: string
          season_membership_id: string
          status?: Database["public"]["Enums"]["eligibility_status"]
        }
        Update: {
          checked_at?: string | null
          competition?: Database["public"]["Enums"]["competition_scope"]
          created_at?: string
          determining_authority?: string
          effective_from?: string
          effective_to?: string | null
          evidence_reference?: string | null
          id?: string
          season_id?: string
          season_membership_id?: string
          status?: Database["public"]["Enums"]["eligibility_status"]
        }
        Relationships: [
          {
            foreignKeyName: "eligibility_records_membership_season"
            columns: ["season_membership_id", "season_id"]
            isOneToOne: false
            referencedRelation: "constitutional_membership"
            referencedColumns: ["season_membership_id", "season_id"]
          },
          {
            foreignKeyName: "eligibility_records_membership_season"
            columns: ["season_membership_id", "season_id"]
            isOneToOne: false
            referencedRelation: "season_memberships"
            referencedColumns: ["id", "season_id"]
          },
        ]
      }
      event_audience_members: {
        Row: {
          added_at: string
          added_by_person_id: string | null
          capacity: Database["public"]["Enums"]["invitation_capacity"]
          event_id: string
          id: string
          participant_id: string | null
          person_id: string | null
          season_id: string
          season_membership_id: string | null
        }
        Insert: {
          added_at?: string
          added_by_person_id?: string | null
          capacity: Database["public"]["Enums"]["invitation_capacity"]
          event_id: string
          id?: string
          participant_id?: string | null
          person_id?: string | null
          season_id: string
          season_membership_id?: string | null
        }
        Update: {
          added_at?: string
          added_by_person_id?: string | null
          capacity?: Database["public"]["Enums"]["invitation_capacity"]
          event_id?: string
          id?: string
          participant_id?: string | null
          person_id?: string | null
          season_id?: string
          season_membership_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_audience_members_added_by_person_id_fkey"
            columns: ["added_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_audience_members_added_by_person_id_fkey"
            columns: ["added_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "event_audience_members_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_audience_members_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "rsvp_attendance_mismatches"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_audience_members_event_same_season"
            columns: ["event_id", "season_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id", "season_id"]
          },
          {
            foreignKeyName: "event_audience_members_event_same_season"
            columns: ["event_id", "season_id"]
            isOneToOne: false
            referencedRelation: "rsvp_attendance_mismatches"
            referencedColumns: ["event_id", "season_id"]
          },
          {
            foreignKeyName: "event_audience_members_membership_same_season"
            columns: ["season_membership_id", "season_id"]
            isOneToOne: false
            referencedRelation: "constitutional_membership"
            referencedColumns: ["season_membership_id", "season_id"]
          },
          {
            foreignKeyName: "event_audience_members_membership_same_season"
            columns: ["season_membership_id", "season_id"]
            isOneToOne: false
            referencedRelation: "season_memberships"
            referencedColumns: ["id", "season_id"]
          },
          {
            foreignKeyName: "event_audience_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_audience_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
        ]
      }
      event_questions: {
        Row: {
          answer_type: Database["public"]["Enums"]["question_answer_type"]
          applies_to_capacities: Database["public"]["Enums"]["invitation_capacity"][]
          choices: string[] | null
          event_id: string
          id: string
          is_required: boolean
          prompt: string
          sort_order: number
        }
        Insert: {
          answer_type?: Database["public"]["Enums"]["question_answer_type"]
          applies_to_capacities?: Database["public"]["Enums"]["invitation_capacity"][]
          choices?: string[] | null
          event_id: string
          id?: string
          is_required?: boolean
          prompt: string
          sort_order?: number
        }
        Update: {
          answer_type?: Database["public"]["Enums"]["question_answer_type"]
          applies_to_capacities?: Database["public"]["Enums"]["invitation_capacity"][]
          choices?: string[] | null
          event_id?: string
          id?: string
          is_required?: boolean
          prompt?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_questions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_questions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "rsvp_attendance_mismatches"
            referencedColumns: ["event_id"]
          },
        ]
      }
      event_series: {
        Row: {
          created_at: string
          default_ends_at: string | null
          default_starts_at: string | null
          default_venue: string | null
          event_type: Database["public"]["Enums"]["event_type"]
          id: string
          is_active: boolean
          name: string
          recurrence_note: string | null
          season_id: string
          weekday: number | null
        }
        Insert: {
          created_at?: string
          default_ends_at?: string | null
          default_starts_at?: string | null
          default_venue?: string | null
          event_type: Database["public"]["Enums"]["event_type"]
          id?: string
          is_active?: boolean
          name: string
          recurrence_note?: string | null
          season_id: string
          weekday?: number | null
        }
        Update: {
          created_at?: string
          default_ends_at?: string | null
          default_starts_at?: string | null
          default_venue?: string | null
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          is_active?: boolean
          name?: string
          recurrence_note?: string | null
          season_id?: string
          weekday?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_series_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          aggregate_headcount: number | null
          alternative_group_id: string | null
          approved_at: string | null
          approved_by_person_id: string | null
          audience_confirmed_at: string | null
          audience_confirmed_by_person_id: string | null
          competition: string | null
          created_at: string
          decision_reason: string | null
          ends_at: string | null
          event_type: Database["public"]["Enums"]["event_type"]
          id: string
          is_mandatory: boolean
          name: string
          opponent: string | null
          origin: Database["public"]["Enums"]["event_origin"]
          outcome_recorded_at: string | null
          outcome_recorded_by_person_id: string | null
          owner_person_id: string | null
          reminder_offsets_hours: number[]
          response_deadline_at: string | null
          scheduled_on: string | null
          season_id: string
          series_id: string | null
          side: Database["public"]["Enums"]["fixture_side"] | null
          solicits_response: boolean
          starts_at: string | null
          status: Database["public"]["Enums"]["event_status"]
          term_id: string | null
          updated_at: string
          venue: string | null
          week_number: number | null
        }
        Insert: {
          aggregate_headcount?: number | null
          alternative_group_id?: string | null
          approved_at?: string | null
          approved_by_person_id?: string | null
          audience_confirmed_at?: string | null
          audience_confirmed_by_person_id?: string | null
          competition?: string | null
          created_at?: string
          decision_reason?: string | null
          ends_at?: string | null
          event_type: Database["public"]["Enums"]["event_type"]
          id?: string
          is_mandatory?: boolean
          name: string
          opponent?: string | null
          origin?: Database["public"]["Enums"]["event_origin"]
          outcome_recorded_at?: string | null
          outcome_recorded_by_person_id?: string | null
          owner_person_id?: string | null
          reminder_offsets_hours?: number[]
          response_deadline_at?: string | null
          scheduled_on?: string | null
          season_id: string
          series_id?: string | null
          side?: Database["public"]["Enums"]["fixture_side"] | null
          solicits_response?: boolean
          starts_at?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          term_id?: string | null
          updated_at?: string
          venue?: string | null
          week_number?: number | null
        }
        Update: {
          aggregate_headcount?: number | null
          alternative_group_id?: string | null
          approved_at?: string | null
          approved_by_person_id?: string | null
          audience_confirmed_at?: string | null
          audience_confirmed_by_person_id?: string | null
          competition?: string | null
          created_at?: string
          decision_reason?: string | null
          ends_at?: string | null
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          is_mandatory?: boolean
          name?: string
          opponent?: string | null
          origin?: Database["public"]["Enums"]["event_origin"]
          outcome_recorded_at?: string | null
          outcome_recorded_by_person_id?: string | null
          owner_person_id?: string | null
          reminder_offsets_hours?: number[]
          response_deadline_at?: string | null
          scheduled_on?: string | null
          season_id?: string
          series_id?: string | null
          side?: Database["public"]["Enums"]["fixture_side"] | null
          solicits_response?: boolean
          starts_at?: string | null
          status?: Database["public"]["Enums"]["event_status"]
          term_id?: string | null
          updated_at?: string
          venue?: string | null
          week_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "events_alternative_group_same_season"
            columns: ["alternative_group_id", "season_id"]
            isOneToOne: false
            referencedRelation: "alternative_groups"
            referencedColumns: ["id", "season_id"]
          },
          {
            foreignKeyName: "events_approved_by_person_id_fkey"
            columns: ["approved_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_approved_by_person_id_fkey"
            columns: ["approved_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "events_audience_confirmed_by_person_id_fkey"
            columns: ["audience_confirmed_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_audience_confirmed_by_person_id_fkey"
            columns: ["audience_confirmed_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "events_outcome_recorded_by_person_id_fkey"
            columns: ["outcome_recorded_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_outcome_recorded_by_person_id_fkey"
            columns: ["outcome_recorded_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "events_owner_person_id_fkey"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_owner_person_id_fkey"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "events_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_series_same_season"
            columns: ["series_id", "season_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id", "season_id"]
          },
          {
            foreignKeyName: "events_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_actions: {
        Row: {
          category: Database["public"]["Enums"]["follow_up_category"]
          created_at: string
          description: string
          due_on: string | null
          id: string
          owner_person_id: string | null
          resolution_note: string | null
          resolved_at: string | null
          season_id: string
          status: Database["public"]["Enums"]["follow_up_status"]
          subject_event_id: string | null
          subject_person_id: string | null
          subject_season_membership_id: string | null
          updated_at: string
          weekly_report_id: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["follow_up_category"]
          created_at?: string
          description: string
          due_on?: string | null
          id?: string
          owner_person_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          season_id: string
          status?: Database["public"]["Enums"]["follow_up_status"]
          subject_event_id?: string | null
          subject_person_id?: string | null
          subject_season_membership_id?: string | null
          updated_at?: string
          weekly_report_id?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["follow_up_category"]
          created_at?: string
          description?: string
          due_on?: string | null
          id?: string
          owner_person_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          season_id?: string
          status?: Database["public"]["Enums"]["follow_up_status"]
          subject_event_id?: string | null
          subject_person_id?: string | null
          subject_season_membership_id?: string | null
          updated_at?: string
          weekly_report_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_actions_owner_person_id_fkey"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_actions_owner_person_id_fkey"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "follow_up_actions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_actions_subject_event_id_fkey"
            columns: ["subject_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_actions_subject_event_id_fkey"
            columns: ["subject_event_id"]
            isOneToOne: false
            referencedRelation: "rsvp_attendance_mismatches"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "follow_up_actions_subject_person_id_fkey"
            columns: ["subject_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_actions_subject_person_id_fkey"
            columns: ["subject_person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "follow_up_actions_subject_season_membership_id_fkey"
            columns: ["subject_season_membership_id"]
            isOneToOne: false
            referencedRelation: "constitutional_membership"
            referencedColumns: ["season_membership_id"]
          },
          {
            foreignKeyName: "follow_up_actions_subject_season_membership_id_fkey"
            columns: ["subject_season_membership_id"]
            isOneToOne: false
            referencedRelation: "season_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_actions_weekly_report_id_fkey"
            columns: ["weekly_report_id"]
            isOneToOne: false
            referencedRelation: "weekly_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          audience_member_id: string
          cancelled_at: string | null
          capacity: Database["public"]["Enums"]["invitation_capacity"]
          created_at: string
          event_id: string
          event_status: Database["public"]["Enums"]["event_status"]
          expires_at: string | null
          id: string
          issued_at: string | null
          participant_id: string | null
          person_id: string | null
          season_id: string
          season_membership_id: string | null
          solicits_response: boolean
          status: Database["public"]["Enums"]["invitation_status"]
        }
        Insert: {
          audience_member_id: string
          cancelled_at?: string | null
          capacity: Database["public"]["Enums"]["invitation_capacity"]
          created_at?: string
          event_id: string
          event_status: Database["public"]["Enums"]["event_status"]
          expires_at?: string | null
          id?: string
          issued_at?: string | null
          participant_id?: string | null
          person_id?: string | null
          season_id: string
          season_membership_id?: string | null
          solicits_response: boolean
          status?: Database["public"]["Enums"]["invitation_status"]
        }
        Update: {
          audience_member_id?: string
          cancelled_at?: string | null
          capacity?: Database["public"]["Enums"]["invitation_capacity"]
          created_at?: string
          event_id?: string
          event_status?: Database["public"]["Enums"]["event_status"]
          expires_at?: string | null
          id?: string
          issued_at?: string | null
          participant_id?: string | null
          person_id?: string | null
          season_id?: string
          season_membership_id?: string | null
          solicits_response?: boolean
          status?: Database["public"]["Enums"]["invitation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "invitations_belong_to_the_resolved_audience"
            columns: [
              "audience_member_id",
              "event_id",
              "capacity",
              "participant_id",
            ]
            isOneToOne: false
            referencedRelation: "event_audience_members"
            referencedColumns: ["id", "event_id", "capacity", "participant_id"]
          },
          {
            foreignKeyName: "invitations_event_same_season"
            columns: ["event_id", "season_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id", "season_id"]
          },
          {
            foreignKeyName: "invitations_event_same_season"
            columns: ["event_id", "season_id"]
            isOneToOne: false
            referencedRelation: "rsvp_attendance_mismatches"
            referencedColumns: ["event_id", "season_id"]
          },
          {
            foreignKeyName: "invitations_event_state_is_current"
            columns: ["event_id", "event_status", "solicits_response"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id", "status", "solicits_response"]
          },
          {
            foreignKeyName: "invitations_membership_same_season"
            columns: ["season_membership_id", "season_id"]
            isOneToOne: false
            referencedRelation: "constitutional_membership"
            referencedColumns: ["season_membership_id", "season_id"]
          },
          {
            foreignKeyName: "invitations_membership_same_season"
            columns: ["season_membership_id", "season_id"]
            isOneToOne: false
            referencedRelation: "season_memberships"
            referencedColumns: ["id", "season_id"]
          },
          {
            foreignKeyName: "invitations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
        ]
      }
      jersey_assignments: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          is_import_conflict: boolean
          is_predominant: boolean
          kit: Database["public"]["Enums"]["kit"]
          number: number
          season_id: string
          season_membership_id: string
        }
        Insert: {
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          is_import_conflict?: boolean
          is_predominant?: boolean
          kit: Database["public"]["Enums"]["kit"]
          number: number
          season_id: string
          season_membership_id: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_import_conflict?: boolean
          is_predominant?: boolean
          kit?: Database["public"]["Enums"]["kit"]
          number?: number
          season_id?: string
          season_membership_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jersey_assignments_membership_season"
            columns: ["season_membership_id", "season_id"]
            isOneToOne: false
            referencedRelation: "constitutional_membership"
            referencedColumns: ["season_membership_id", "season_id"]
          },
          {
            foreignKeyName: "jersey_assignments_membership_season"
            columns: ["season_membership_id", "season_id"]
            isOneToOne: false
            referencedRelation: "season_memberships"
            referencedColumns: ["id", "season_id"]
          },
        ]
      }
      notification_jobs: {
        Row: {
          attempt_count: number
          cancelled_reason: string | null
          channel: Database["public"]["Enums"]["notification_channel"] | null
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          event_id: string | null
          id: string
          idempotency_key: string
          invitation_id: string | null
          job_type: Database["public"]["Enums"]["notification_job_type"]
          last_error: string | null
          person_id: string | null
          scheduled_for: string | null
          status: Database["public"]["Enums"]["notification_job_status"]
          template_variables: Json
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          cancelled_reason?: string | null
          channel?: Database["public"]["Enums"]["notification_channel"] | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          idempotency_key: string
          invitation_id?: string | null
          job_type: Database["public"]["Enums"]["notification_job_type"]
          last_error?: string | null
          person_id?: string | null
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["notification_job_status"]
          template_variables?: Json
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          cancelled_reason?: string | null
          channel?: Database["public"]["Enums"]["notification_channel"] | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          idempotency_key?: string
          invitation_id?: string | null
          job_type?: Database["public"]["Enums"]["notification_job_type"]
          last_error?: string | null
          person_id?: string | null
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["notification_job_status"]
          template_variables?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_jobs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_jobs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "rsvp_attendance_mismatches"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "notification_jobs_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "invitation_response_state"
            referencedColumns: ["invitation_id"]
          },
          {
            foreignKeyName: "notification_jobs_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_jobs_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "nonresponse_queue"
            referencedColumns: ["invitation_id"]
          },
          {
            foreignKeyName: "notification_jobs_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_jobs_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
        ]
      }
      onboarding_item_types: {
        Row: {
          code: string
          id: string
          is_required: boolean
          is_subscription: boolean
          label: string
          season_id: string
          sort_order: number
        }
        Insert: {
          code: string
          id?: string
          is_required?: boolean
          is_subscription?: boolean
          label: string
          season_id: string
          sort_order?: number
        }
        Update: {
          code?: string
          id?: string
          is_required?: boolean
          is_subscription?: boolean
          label?: string
          season_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_item_types_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_items: {
        Row: {
          completed_on: string | null
          id: string
          item_type_id: string
          season_id: string
          season_membership_id: string
          status: Database["public"]["Enums"]["onboarding_item_status"]
          updated_at: string
          waived_by_person_id: string | null
          waived_reason: string | null
        }
        Insert: {
          completed_on?: string | null
          id?: string
          item_type_id: string
          season_id: string
          season_membership_id: string
          status?: Database["public"]["Enums"]["onboarding_item_status"]
          updated_at?: string
          waived_by_person_id?: string | null
          waived_reason?: string | null
        }
        Update: {
          completed_on?: string | null
          id?: string
          item_type_id?: string
          season_id?: string
          season_membership_id?: string
          status?: Database["public"]["Enums"]["onboarding_item_status"]
          updated_at?: string
          waived_by_person_id?: string | null
          waived_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_items_membership_season"
            columns: ["season_membership_id", "season_id"]
            isOneToOne: false
            referencedRelation: "constitutional_membership"
            referencedColumns: ["season_membership_id", "season_id"]
          },
          {
            foreignKeyName: "onboarding_items_membership_season"
            columns: ["season_membership_id", "season_id"]
            isOneToOne: false
            referencedRelation: "season_memberships"
            referencedColumns: ["id", "season_id"]
          },
          {
            foreignKeyName: "onboarding_items_type_same_season"
            columns: ["item_type_id", "season_id"]
            isOneToOne: false
            referencedRelation: "onboarding_item_types"
            referencedColumns: ["id", "season_id"]
          },
          {
            foreignKeyName: "onboarding_items_waived_by_person_id_fkey"
            columns: ["waived_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_items_waived_by_person_id_fkey"
            columns: ["waived_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
        ]
      }
      operator_accounts: {
        Row: {
          activated_at: string | null
          auth_user_id: string
          created_at: string
          disabled_at: string | null
          disabled_reason: string | null
          id: string
          invitation_delivery_failed_at: string | null
          invitation_delivery_failure_reason: string | null
          invited_at: string | null
          is_active: boolean
          login_email: string | null
          person_id: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          auth_user_id: string
          created_at?: string
          disabled_at?: string | null
          disabled_reason?: string | null
          id?: string
          invitation_delivery_failed_at?: string | null
          invitation_delivery_failure_reason?: string | null
          invited_at?: string | null
          is_active?: boolean
          login_email?: string | null
          person_id: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          auth_user_id?: string
          created_at?: string
          disabled_at?: string | null
          disabled_reason?: string | null
          id?: string
          invitation_delivery_failed_at?: string | null
          invitation_delivery_failure_reason?: string | null
          invited_at?: string | null
          is_active?: boolean
          login_email?: string | null
          person_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_accounts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operator_accounts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
        ]
      }
      people: {
        Row: {
          created_at: string
          family_name: string | null
          given_name: string
          id: string
          known_as: string | null
          merge_reason: string | null
          merged_at: string | null
          merged_by_person_id: string | null
          merged_into_person_id: string | null
          past_member_override: boolean | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          family_name?: string | null
          given_name: string
          id?: string
          known_as?: string | null
          merge_reason?: string | null
          merged_at?: string | null
          merged_by_person_id?: string | null
          merged_into_person_id?: string | null
          past_member_override?: boolean | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          family_name?: string | null
          given_name?: string
          id?: string
          known_as?: string | null
          merge_reason?: string | null
          merged_at?: string | null
          merged_by_person_id?: string | null
          merged_into_person_id?: string | null
          past_member_override?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_merged_by_person_id_fkey"
            columns: ["merged_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_merged_by_person_id_fkey"
            columns: ["merged_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "people_merged_into_person_id_fkey"
            columns: ["merged_into_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_merged_into_person_id_fkey"
            columns: ["merged_into_person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
        ]
      }
      person_aliases: {
        Row: {
          alias: string
          id: string
          noted_at: string
          person_id: string
          source: string | null
        }
        Insert: {
          alias: string
          id?: string
          noted_at?: string
          person_id: string
          source?: string | null
        }
        Update: {
          alias?: string
          id?: string
          noted_at?: string
          person_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "person_aliases_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_aliases_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
        ]
      }
      position_assignments: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          position_id: string
          position_vocabulary_id: string
          recorded_by_person_id: string | null
          season_id: string
          season_membership_id: string
          side: Database["public"]["Enums"]["position_side"]
          slot: Database["public"]["Enums"]["position_slot"]
        }
        Insert: {
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          position_id: string
          position_vocabulary_id: string
          recorded_by_person_id?: string | null
          season_id: string
          season_membership_id: string
          side: Database["public"]["Enums"]["position_side"]
          slot: Database["public"]["Enums"]["position_slot"]
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          position_id?: string
          position_vocabulary_id?: string
          recorded_by_person_id?: string | null
          season_id?: string
          season_membership_id?: string
          side?: Database["public"]["Enums"]["position_side"]
          slot?: Database["public"]["Enums"]["position_slot"]
        }
        Relationships: [
          {
            foreignKeyName: "position_assignments_membership_season"
            columns: ["season_membership_id", "season_id"]
            isOneToOne: false
            referencedRelation: "constitutional_membership"
            referencedColumns: ["season_membership_id", "season_id"]
          },
          {
            foreignKeyName: "position_assignments_membership_season"
            columns: ["season_membership_id", "season_id"]
            isOneToOne: false
            referencedRelation: "season_memberships"
            referencedColumns: ["id", "season_id"]
          },
          {
            foreignKeyName: "position_assignments_position_in_vocabulary"
            columns: ["position_id", "position_vocabulary_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id", "vocabulary_id"]
          },
          {
            foreignKeyName: "position_assignments_recorded_by_person_id_fkey"
            columns: ["recorded_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "position_assignments_recorded_by_person_id_fkey"
            columns: ["recorded_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "position_assignments_side_is_the_positions"
            columns: ["position_id", "side"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id", "side"]
          },
          {
            foreignKeyName: "position_assignments_vocabulary_is_the_seasons"
            columns: ["season_id", "position_vocabulary_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id", "position_vocabulary_id"]
          },
        ]
      }
      position_vocabularies: {
        Row: {
          adopted_on: string
          code: string
          created_at: string
          id: string
          label: string
        }
        Insert: {
          adopted_on: string
          code: string
          created_at?: string
          id?: string
          label: string
        }
        Update: {
          adopted_on?: string
          code?: string
          created_at?: string
          id?: string
          label?: string
        }
        Relationships: []
      }
      positions: {
        Row: {
          code: string
          id: string
          label: string
          side: Database["public"]["Enums"]["position_side"]
          sort_order: number
          vocabulary_id: string
        }
        Insert: {
          code: string
          id?: string
          label: string
          side: Database["public"]["Enums"]["position_side"]
          sort_order?: number
          vocabulary_id: string
        }
        Update: {
          code?: string
          id?: string
          label?: string
          side?: Database["public"]["Enums"]["position_side"]
          sort_order?: number
          vocabulary_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_vocabulary_id_fkey"
            columns: ["vocabulary_id"]
            isOneToOne: false
            referencedRelation: "position_vocabularies"
            referencedColumns: ["id"]
          },
        ]
      }
      question_responses: {
        Row: {
          answer_boolean: boolean | null
          answer_choice: string | null
          answer_text: string | null
          event_id: string
          event_question_id: string
          id: string
          invitation_id: string
          raw_capture: string | null
          responded_at: string
        }
        Insert: {
          answer_boolean?: boolean | null
          answer_choice?: string | null
          answer_text?: string | null
          event_id: string
          event_question_id: string
          id?: string
          invitation_id: string
          raw_capture?: string | null
          responded_at?: string
        }
        Update: {
          answer_boolean?: boolean | null
          answer_choice?: string | null
          answer_text?: string | null
          event_id?: string
          event_question_id?: string
          id?: string
          invitation_id?: string
          raw_capture?: string | null
          responded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_responses_invitation_event"
            columns: ["invitation_id", "event_id"]
            isOneToOne: false
            referencedRelation: "invitations"
            referencedColumns: ["id", "event_id"]
          },
          {
            foreignKeyName: "question_responses_question_event"
            columns: ["event_question_id", "event_id"]
            isOneToOne: false
            referencedRelation: "event_questions"
            referencedColumns: ["id", "event_id"]
          },
        ]
      }
      recruitment_prospects: {
        Row: {
          committed_on: string | null
          converted_membership_id: string | null
          created_at: string
          first_contact_on: string | null
          id: string
          notes: string | null
          person_id: string
          season_id: string
          source: string | null
          status: Database["public"]["Enums"]["prospect_status"]
          updated_at: string
        }
        Insert: {
          committed_on?: string | null
          converted_membership_id?: string | null
          created_at?: string
          first_contact_on?: string | null
          id?: string
          notes?: string | null
          person_id: string
          season_id: string
          source?: string | null
          status?: Database["public"]["Enums"]["prospect_status"]
          updated_at?: string
        }
        Update: {
          committed_on?: string | null
          converted_membership_id?: string | null
          created_at?: string
          first_contact_on?: string | null
          id?: string
          notes?: string | null
          person_id?: string
          season_id?: string
          source?: string | null
          status?: Database["public"]["Enums"]["prospect_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_prospects_conversion_same_person"
            columns: ["converted_membership_id", "person_id"]
            isOneToOne: false
            referencedRelation: "constitutional_membership"
            referencedColumns: ["season_membership_id", "person_id"]
          },
          {
            foreignKeyName: "recruitment_prospects_conversion_same_person"
            columns: ["converted_membership_id", "person_id"]
            isOneToOne: false
            referencedRelation: "season_memberships"
            referencedColumns: ["id", "person_id"]
          },
          {
            foreignKeyName: "recruitment_prospects_conversion_same_season"
            columns: ["converted_membership_id", "season_id"]
            isOneToOne: false
            referencedRelation: "constitutional_membership"
            referencedColumns: ["season_membership_id", "season_id"]
          },
          {
            foreignKeyName: "recruitment_prospects_conversion_same_season"
            columns: ["converted_membership_id", "season_id"]
            isOneToOne: false
            referencedRelation: "season_memberships"
            referencedColumns: ["id", "season_id"]
          },
          {
            foreignKeyName: "recruitment_prospects_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_prospects_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "recruitment_prospects_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      role_aliases: {
        Row: {
          alias: string
          id: string
          role_id: string
          source: string | null
        }
        Insert: {
          alias: string
          id?: string
          role_id: string
          source?: string | null
        }
        Update: {
          alias?: string
          id?: string
          role_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_aliases_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_assignments: {
        Row: {
          appointed_by_person_id: string | null
          committee_year_id: string | null
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          is_constitutional_office: boolean
          is_single_holder_seat: boolean
          note: string | null
          person_id: string
          role_id: string
          scope: Database["public"]["Enums"]["role_scope"]
          season_id: string | null
        }
        Insert: {
          appointed_by_person_id?: string | null
          committee_year_id?: string | null
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          is_constitutional_office: boolean
          is_single_holder_seat?: boolean
          note?: string | null
          person_id: string
          role_id: string
          scope: Database["public"]["Enums"]["role_scope"]
          season_id?: string | null
        }
        Update: {
          appointed_by_person_id?: string | null
          committee_year_id?: string | null
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_constitutional_office?: boolean
          is_single_holder_seat?: boolean
          note?: string | null
          person_id?: string
          role_id?: string
          scope?: Database["public"]["Enums"]["role_scope"]
          season_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_assignments_agree_with_role"
            columns: ["role_id", "scope", "is_constitutional_office"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id", "scope", "is_constitutional_office"]
          },
          {
            foreignKeyName: "role_assignments_agree_with_single_holder_rule"
            columns: ["role_id", "is_single_holder_seat"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id", "is_single_holder_seat"]
          },
          {
            foreignKeyName: "role_assignments_appointed_by_person_id_fkey"
            columns: ["appointed_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_assignments_appointed_by_person_id_fkey"
            columns: ["appointed_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "role_assignments_committee_year_id_fkey"
            columns: ["committee_year_id"]
            isOneToOne: false
            referencedRelation: "committee_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_assignments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_assignments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "role_assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_assignments_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      role_groups: {
        Row: {
          code: string
          created_at: string
          id: string
          label: string
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          label: string
          sort_order: number
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      roles: {
        Row: {
          admits_multiple_holders: boolean | null
          code: string
          constitution_edition: string | null
          constitution_reference: string | null
          created_at: string
          id: string
          is_constitutional_office: boolean
          is_single_holder_seat: boolean
          name: string
          role_group_id: string
          scope: Database["public"]["Enums"]["role_scope"]
          sort_order: number
        }
        Insert: {
          admits_multiple_holders?: boolean | null
          code: string
          constitution_edition?: string | null
          constitution_reference?: string | null
          created_at?: string
          id?: string
          is_constitutional_office?: boolean
          is_single_holder_seat?: boolean
          name: string
          role_group_id: string
          scope: Database["public"]["Enums"]["role_scope"]
          sort_order: number
        }
        Update: {
          admits_multiple_holders?: boolean | null
          code?: string
          constitution_edition?: string | null
          constitution_reference?: string | null
          created_at?: string
          id?: string
          is_constitutional_office?: boolean
          is_single_holder_seat?: boolean
          name?: string
          role_group_id?: string
          scope?: Database["public"]["Enums"]["role_scope"]
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "roles_role_group_id_fkey"
            columns: ["role_group_id"]
            isOneToOne: false
            referencedRelation: "role_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      rsvp_access_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          invitation_id: string
          issued_at: string
          issued_by_person_id: string | null
          last_used_at: string | null
          revoked_at: string | null
          revoked_reason: string | null
          superseded_at: string | null
          superseded_by_token_id: string | null
          token_hash: string
          use_count: number
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          invitation_id: string
          issued_at?: string
          issued_by_person_id?: string | null
          last_used_at?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          superseded_at?: string | null
          superseded_by_token_id?: string | null
          token_hash: string
          use_count?: number
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          invitation_id?: string
          issued_at?: string
          issued_by_person_id?: string | null
          last_used_at?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          superseded_at?: string | null
          superseded_by_token_id?: string | null
          token_hash?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "rsvp_access_tokens_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "invitation_response_state"
            referencedColumns: ["invitation_id"]
          },
          {
            foreignKeyName: "rsvp_access_tokens_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsvp_access_tokens_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "nonresponse_queue"
            referencedColumns: ["invitation_id"]
          },
          {
            foreignKeyName: "rsvp_access_tokens_issued_by_person_id_fkey"
            columns: ["issued_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsvp_access_tokens_issued_by_person_id_fkey"
            columns: ["issued_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "rsvp_access_tokens_superseded_by_token_id_fkey"
            columns: ["superseded_by_token_id"]
            isOneToOne: false
            referencedRelation: "rsvp_access_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      rsvp_responses: {
        Row: {
          id: string
          invitation_id: string
          raw_capture: string | null
          reason: string | null
          recorded_at: string
          recorded_by_person_id: string | null
          responded_at: string
          response: Database["public"]["Enums"]["rsvp_value"]
          source: Database["public"]["Enums"]["rsvp_source"]
        }
        Insert: {
          id?: string
          invitation_id: string
          raw_capture?: string | null
          reason?: string | null
          recorded_at?: string
          recorded_by_person_id?: string | null
          responded_at: string
          response: Database["public"]["Enums"]["rsvp_value"]
          source: Database["public"]["Enums"]["rsvp_source"]
        }
        Update: {
          id?: string
          invitation_id?: string
          raw_capture?: string | null
          reason?: string | null
          recorded_at?: string
          recorded_by_person_id?: string | null
          responded_at?: string
          response?: Database["public"]["Enums"]["rsvp_value"]
          source?: Database["public"]["Enums"]["rsvp_source"]
        }
        Relationships: [
          {
            foreignKeyName: "rsvp_responses_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "invitation_response_state"
            referencedColumns: ["invitation_id"]
          },
          {
            foreignKeyName: "rsvp_responses_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsvp_responses_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "nonresponse_queue"
            referencedColumns: ["invitation_id"]
          },
          {
            foreignKeyName: "rsvp_responses_recorded_by_person_id_fkey"
            columns: ["recorded_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsvp_responses_recorded_by_person_id_fkey"
            columns: ["recorded_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
        ]
      }
      schedule_changes: {
        Row: {
          approved_by_person_id: string | null
          changed_at: string
          event_id: string
          id: string
          new_opponent: string | null
          new_scheduled_on: string | null
          new_starts_at: string | null
          new_venue: string | null
          previous_opponent: string | null
          previous_scheduled_on: string | null
          previous_starts_at: string | null
          previous_venue: string | null
          reason: string | null
          recorded_by_person_id: string | null
          source: Database["public"]["Enums"]["schedule_change_source"]
        }
        Insert: {
          approved_by_person_id?: string | null
          changed_at?: string
          event_id: string
          id?: string
          new_opponent?: string | null
          new_scheduled_on?: string | null
          new_starts_at?: string | null
          new_venue?: string | null
          previous_opponent?: string | null
          previous_scheduled_on?: string | null
          previous_starts_at?: string | null
          previous_venue?: string | null
          reason?: string | null
          recorded_by_person_id?: string | null
          source: Database["public"]["Enums"]["schedule_change_source"]
        }
        Update: {
          approved_by_person_id?: string | null
          changed_at?: string
          event_id?: string
          id?: string
          new_opponent?: string | null
          new_scheduled_on?: string | null
          new_starts_at?: string | null
          new_venue?: string | null
          previous_opponent?: string | null
          previous_scheduled_on?: string | null
          previous_starts_at?: string | null
          previous_venue?: string | null
          reason?: string | null
          recorded_by_person_id?: string | null
          source?: Database["public"]["Enums"]["schedule_change_source"]
        }
        Relationships: [
          {
            foreignKeyName: "schedule_changes_approved_by_person_id_fkey"
            columns: ["approved_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_changes_approved_by_person_id_fkey"
            columns: ["approved_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "schedule_changes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_changes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "rsvp_attendance_mismatches"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "schedule_changes_recorded_by_person_id_fkey"
            columns: ["recorded_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_changes_recorded_by_person_id_fkey"
            columns: ["recorded_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
        ]
      }
      season_membership_status_events: {
        Row: {
          actor_label: string | null
          actor_person_id: string | null
          from_status: Database["public"]["Enums"]["membership_status"] | null
          id: string
          occurred_at: string
          reason: string | null
          season_membership_id: string
          to_status: Database["public"]["Enums"]["membership_status"]
        }
        Insert: {
          actor_label?: string | null
          actor_person_id?: string | null
          from_status?: Database["public"]["Enums"]["membership_status"] | null
          id?: string
          occurred_at?: string
          reason?: string | null
          season_membership_id: string
          to_status: Database["public"]["Enums"]["membership_status"]
        }
        Update: {
          actor_label?: string | null
          actor_person_id?: string | null
          from_status?: Database["public"]["Enums"]["membership_status"] | null
          id?: string
          occurred_at?: string
          reason?: string | null
          season_membership_id?: string
          to_status?: Database["public"]["Enums"]["membership_status"]
        }
        Relationships: [
          {
            foreignKeyName: "season_membership_status_events_actor_person_id_fkey"
            columns: ["actor_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_membership_status_events_actor_person_id_fkey"
            columns: ["actor_person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "season_membership_status_events_season_membership_id_fkey"
            columns: ["season_membership_id"]
            isOneToOne: false
            referencedRelation: "constitutional_membership"
            referencedColumns: ["season_membership_id"]
          },
          {
            foreignKeyName: "season_membership_status_events_season_membership_id_fkey"
            columns: ["season_membership_id"]
            isOneToOne: false
            referencedRelation: "season_memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      season_memberships: {
        Row: {
          activated_on: string | null
          carried_forward_from_id: string | null
          confirmed_on: string | null
          created_at: string
          departed_on: string | null
          departure_reason: string | null
          entry: Database["public"]["Enums"]["membership_entry"]
          expected_return_on: string | null
          id: string
          inactivity_label: string | null
          person_id: string
          season_id: string
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
        }
        Insert: {
          activated_on?: string | null
          carried_forward_from_id?: string | null
          confirmed_on?: string | null
          created_at?: string
          departed_on?: string | null
          departure_reason?: string | null
          entry: Database["public"]["Enums"]["membership_entry"]
          expected_return_on?: string | null
          id?: string
          inactivity_label?: string | null
          person_id: string
          season_id: string
          status: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
        }
        Update: {
          activated_on?: string | null
          carried_forward_from_id?: string | null
          confirmed_on?: string | null
          created_at?: string
          departed_on?: string | null
          departure_reason?: string | null
          entry?: Database["public"]["Enums"]["membership_entry"]
          expected_return_on?: string | null
          id?: string
          inactivity_label?: string | null
          person_id?: string
          season_id?: string
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "season_memberships_carried_forward_same_person"
            columns: ["carried_forward_from_id", "person_id"]
            isOneToOne: false
            referencedRelation: "constitutional_membership"
            referencedColumns: ["season_membership_id", "person_id"]
          },
          {
            foreignKeyName: "season_memberships_carried_forward_same_person"
            columns: ["carried_forward_from_id", "person_id"]
            isOneToOne: false
            referencedRelation: "season_memberships"
            referencedColumns: ["id", "person_id"]
          },
          {
            foreignKeyName: "season_memberships_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_memberships_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "season_memberships_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          closed_at: string | null
          closed_by_person_id: string | null
          created_at: string
          ends_on: string | null
          id: string
          label: string
          opened_at: string | null
          opened_by_person_id: string | null
          position_vocabulary_id: string
          starts_on: string | null
          status: Database["public"]["Enums"]["season_status"]
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by_person_id?: string | null
          created_at?: string
          ends_on?: string | null
          id?: string
          label: string
          opened_at?: string | null
          opened_by_person_id?: string | null
          position_vocabulary_id: string
          starts_on?: string | null
          status?: Database["public"]["Enums"]["season_status"]
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by_person_id?: string | null
          created_at?: string
          ends_on?: string | null
          id?: string
          label?: string
          opened_at?: string | null
          opened_by_person_id?: string | null
          position_vocabulary_id?: string
          starts_on?: string | null
          status?: Database["public"]["Enums"]["season_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seasons_closed_by_person_id_fkey"
            columns: ["closed_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seasons_closed_by_person_id_fkey"
            columns: ["closed_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "seasons_opened_by_person_id_fkey"
            columns: ["opened_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seasons_opened_by_person_id_fkey"
            columns: ["opened_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "seasons_position_vocabulary_id_fkey"
            columns: ["position_vocabulary_id"]
            isOneToOne: false
            referencedRelation: "position_vocabularies"
            referencedColumns: ["id"]
          },
        ]
      }
      terms: {
        Row: {
          academic_year: string
          created_at: string
          ends_on: string
          first_week: number
          id: string
          last_week: number
          name: Database["public"]["Enums"]["term_name"]
          starts_on: string
        }
        Insert: {
          academic_year: string
          created_at?: string
          ends_on: string
          first_week: number
          id?: string
          last_week?: number
          name: Database["public"]["Enums"]["term_name"]
          starts_on: string
        }
        Update: {
          academic_year?: string
          created_at?: string
          ends_on?: string
          first_week?: number
          id?: string
          last_week?: number
          name?: Database["public"]["Enums"]["term_name"]
          starts_on?: string
        }
        Relationships: []
      }
      weekly_reports: {
        Row: {
          content: Json
          data_as_of: string
          generated_at: string
          generated_by_person_id: string | null
          id: string
          metric_definition_version: string
          report_on: string
          season_id: string
          supersedes_id: string | null
          version: number
        }
        Insert: {
          content: Json
          data_as_of: string
          generated_at?: string
          generated_by_person_id?: string | null
          id?: string
          metric_definition_version: string
          report_on: string
          season_id: string
          supersedes_id?: string | null
          version?: number
        }
        Update: {
          content?: Json
          data_as_of?: string
          generated_at?: string
          generated_by_person_id?: string | null
          id?: string
          metric_definition_version?: string
          report_on?: string
          season_id?: string
          supersedes_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reports_generated_by_person_id_fkey"
            columns: ["generated_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_reports_generated_by_person_id_fkey"
            columns: ["generated_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "weekly_reports_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_reports_supersedes_the_same_report"
            columns: ["supersedes_id", "season_id", "report_on"]
            isOneToOne: false
            referencedRelation: "weekly_reports"
            referencedColumns: ["id", "season_id", "report_on"]
          },
        ]
      }
    }
    Views: {
      constitutional_membership: {
        Row: {
          is_admitted: boolean | null
          is_constitutional_member: boolean | null
          is_operationally_ready: boolean | null
          operational_status:
            | Database["public"]["Enums"]["membership_status"]
            | null
          person_id: string | null
          season_id: string | null
          season_membership_id: string | null
          subscription_paid: boolean | null
          subscription_status:
            | Database["public"]["Enums"]["onboarding_item_status"]
            | null
          subscription_waived: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "season_memberships_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_memberships_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "season_memberships_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      current_availability: {
        Row: {
          availability_status_id: string | null
          confirmed_by_person_id: string | null
          effective_from: string | null
          level: Database["public"]["Enums"]["availability_level"] | null
          person_id: string | null
          recorded_at: string | null
          reported_by_person_id: string | null
          review_on: string | null
          season_id: string | null
          season_membership_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "availability_statuses_confirmed_by_person_id_fkey"
            columns: ["confirmed_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_statuses_confirmed_by_person_id_fkey"
            columns: ["confirmed_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "availability_statuses_reported_by_person_id_fkey"
            columns: ["reported_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_statuses_reported_by_person_id_fkey"
            columns: ["reported_by_person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "availability_statuses_season_membership_id_fkey"
            columns: ["season_membership_id"]
            isOneToOne: false
            referencedRelation: "constitutional_membership"
            referencedColumns: ["season_membership_id"]
          },
          {
            foreignKeyName: "availability_statuses_season_membership_id_fkey"
            columns: ["season_membership_id"]
            isOneToOne: false
            referencedRelation: "season_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_memberships_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_memberships_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "season_memberships_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      current_rsvp: {
        Row: {
          invitation_id: string | null
          raw_capture: string | null
          reason: string | null
          recorded_at: string | null
          responded_at: string | null
          response: Database["public"]["Enums"]["rsvp_value"] | null
          rsvp_response_id: string | null
          source: Database["public"]["Enums"]["rsvp_source"] | null
        }
        Relationships: [
          {
            foreignKeyName: "rsvp_responses_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "invitation_response_state"
            referencedColumns: ["invitation_id"]
          },
          {
            foreignKeyName: "rsvp_responses_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsvp_responses_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "nonresponse_queue"
            referencedColumns: ["invitation_id"]
          },
        ]
      }
      invitation_response_state: {
        Row: {
          audience_member_id: string | null
          capacity: Database["public"]["Enums"]["invitation_capacity"] | null
          event_id: string | null
          expires_at: string | null
          invitation_id: string | null
          invitation_status:
            | Database["public"]["Enums"]["invitation_status"]
            | null
          person_id: string | null
          raw_capture: string | null
          reason: string | null
          responded_at: string | null
          response_state: string | null
          season_id: string | null
          season_membership_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_audience_members_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_audience_members_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "rsvp_attendance_mismatches"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_audience_members_event_same_season"
            columns: ["event_id", "season_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id", "season_id"]
          },
          {
            foreignKeyName: "event_audience_members_event_same_season"
            columns: ["event_id", "season_id"]
            isOneToOne: false
            referencedRelation: "rsvp_attendance_mismatches"
            referencedColumns: ["event_id", "season_id"]
          },
          {
            foreignKeyName: "event_audience_members_membership_same_season"
            columns: ["season_membership_id", "season_id"]
            isOneToOne: false
            referencedRelation: "constitutional_membership"
            referencedColumns: ["season_membership_id", "season_id"]
          },
          {
            foreignKeyName: "event_audience_members_membership_same_season"
            columns: ["season_membership_id", "season_id"]
            isOneToOne: false
            referencedRelation: "season_memberships"
            referencedColumns: ["id", "season_id"]
          },
          {
            foreignKeyName: "event_audience_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_audience_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
        ]
      }
      nonresponse_queue: {
        Row: {
          capacity: Database["public"]["Enums"]["invitation_capacity"] | null
          event_id: string | null
          event_name: string | null
          event_type: Database["public"]["Enums"]["event_type"] | null
          expires_at: string | null
          invitation_id: string | null
          invitation_status:
            | Database["public"]["Enums"]["invitation_status"]
            | null
          is_mandatory: boolean | null
          person_id: string | null
          scheduled_on: string | null
          season_id: string | null
          season_membership_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_audience_members_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_audience_members_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "rsvp_attendance_mismatches"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_audience_members_event_same_season"
            columns: ["event_id", "season_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id", "season_id"]
          },
          {
            foreignKeyName: "event_audience_members_event_same_season"
            columns: ["event_id", "season_id"]
            isOneToOne: false
            referencedRelation: "rsvp_attendance_mismatches"
            referencedColumns: ["event_id", "season_id"]
          },
          {
            foreignKeyName: "event_audience_members_membership_same_season"
            columns: ["season_membership_id", "season_id"]
            isOneToOne: false
            referencedRelation: "constitutional_membership"
            referencedColumns: ["season_membership_id", "season_id"]
          },
          {
            foreignKeyName: "event_audience_members_membership_same_season"
            columns: ["season_membership_id", "season_id"]
            isOneToOne: false
            referencedRelation: "season_memberships"
            referencedColumns: ["id", "season_id"]
          },
          {
            foreignKeyName: "event_audience_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_audience_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
        ]
      }
      person_standing: {
        Row: {
          family_name: string | null
          given_name: string | null
          is_past_member: boolean | null
          known_as: string | null
          live_membership_count: number | null
          merged_into_person_id: string | null
          most_recent_season_label: string | null
          person_id: string | null
          standing_is_overridden: boolean | null
          total_membership_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "people_merged_into_person_id_fkey"
            columns: ["merged_into_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_merged_into_person_id_fkey"
            columns: ["merged_into_person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
        ]
      }
      rsvp_attendance_mismatches: {
        Row: {
          capacity: Database["public"]["Enums"]["invitation_capacity"] | null
          event_id: string | null
          event_name: string | null
          mismatch: string | null
          person_id: string | null
          presence: Database["public"]["Enums"]["attendance_presence"] | null
          rsvp_response: Database["public"]["Enums"]["rsvp_value"] | null
          scheduled_on: string | null
          season_id: string | null
          season_membership_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      transition_ledger: {
        Row: {
          action: string | null
          actor_label: string | null
          actor_person_id: string | null
          entity_id: string | null
          entity_table: string | null
          from_state: string | null
          occurred_at: string | null
          reason: string | null
          recorded_in: string | null
          to_state: string | null
        }
        Relationships: []
      }
      uninvited_audience_members: {
        Row: {
          audience_member_id: string | null
          capacity: Database["public"]["Enums"]["invitation_capacity"] | null
          event_id: string | null
          event_name: string | null
          event_status: Database["public"]["Enums"]["event_status"] | null
          event_type: Database["public"]["Enums"]["event_type"] | null
          person_id: string | null
          scheduled_on: string | null
          season_id: string | null
          season_membership_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_audience_members_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_audience_members_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "rsvp_attendance_mismatches"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_audience_members_event_same_season"
            columns: ["event_id", "season_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id", "season_id"]
          },
          {
            foreignKeyName: "event_audience_members_event_same_season"
            columns: ["event_id", "season_id"]
            isOneToOne: false
            referencedRelation: "rsvp_attendance_mismatches"
            referencedColumns: ["event_id", "season_id"]
          },
          {
            foreignKeyName: "event_audience_members_membership_same_season"
            columns: ["season_membership_id", "season_id"]
            isOneToOne: false
            referencedRelation: "constitutional_membership"
            referencedColumns: ["season_membership_id", "season_id"]
          },
          {
            foreignKeyName: "event_audience_members_membership_same_season"
            columns: ["season_membership_id", "season_id"]
            isOneToOne: false
            referencedRelation: "season_memberships"
            referencedColumns: ["id", "season_id"]
          },
          {
            foreignKeyName: "event_audience_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_audience_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person_standing"
            referencedColumns: ["person_id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      attendance_presence: "present" | "absent" | "late" | "excused"
      availability_level: "green" | "orange" | "red"
      competition_scope: "club_play" | "bucs" | "varsity" | "bafa"
      contact_point_kind: "email" | "phone"
      delivery_outcome: "delivered" | "failed" | "rejected" | "manual"
      eligibility_status: "pending" | "eligible" | "ineligible" | "expired"
      event_origin:
        | "club_controlled"
        | "externally_assigned"
        | "externally_scheduled"
        | "negotiated"
      event_status:
        | "draft"
        | "pending_approval"
        | "approved"
        | "occurred"
        | "not_held"
        | "cancelled"
        | "rejected"
        | "withdrawn"
      event_type:
        | "practice"
        | "strength_and_conditioning"
        | "chalk"
        | "fixture"
        | "social"
        | "recruitment"
        | "camp"
        | "varsity"
        | "meeting"
        | "other"
      fixture_side: "home" | "away" | "neutral"
      follow_up_category:
        | "nonresponse"
        | "rsvp_attendance_mismatch"
        | "availability"
        | "subscription"
        | "onboarding"
        | "kit_return"
        | "handover"
        | "other"
      follow_up_status: "open" | "in_progress" | "resolved" | "cancelled"
      invitation_capacity:
        | "player"
        | "coach"
        | "committee"
        | "guest"
        | "recruit"
      invitation_status:
        | "pending"
        | "issued"
        | "responded"
        | "expired"
        | "cancelled"
      kit: "blue" | "white"
      membership_entry: "new" | "returning"
      membership_status:
        | "carried_forward"
        | "confirmed"
        | "onboarding"
        | "active"
        | "inactive"
        | "withdrawn"
        | "departed"
        | "archived"
      notification_channel: "whatsapp" | "email" | "sms" | "manual"
      notification_job_status:
        | "pending"
        | "ready"
        | "processing"
        | "completed"
        | "failed"
        | "cancelled"
      notification_job_type:
        | "invitation"
        | "reminder"
        | "cancellation_notice"
        | "schedule_change_notice"
        | "escalation"
        | "other"
      onboarding_item_status:
        | "pending"
        | "invited"
        | "complete"
        | "waived"
        | "not_applicable"
      position_side: "offence" | "defence" | "special_teams"
      position_slot:
        | "offence"
        | "defence"
        | "kickoff"
        | "kick_return"
        | "punt"
        | "field_goal"
      prospect_status:
        | "identified"
        | "engaged"
        | "committed"
        | "converted"
        | "lapsed"
        | "declined"
      question_answer_type: "text" | "boolean" | "choice"
      role_scope: "committee_year" | "season"
      rsvp_source: "signed_link" | "operator" | "channel_reply" | "import"
      rsvp_value: "yes" | "no"
      schedule_change_source:
        | "club"
        | "league"
        | "opposition"
        | "venue"
        | "weather"
        | "other"
      season_status: "planning" | "open" | "active" | "closing" | "archived"
      term_name: "michaelmas" | "hilary" | "trinity"
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
    Enums: {
      attendance_presence: ["present", "absent", "late", "excused"],
      availability_level: ["green", "orange", "red"],
      competition_scope: ["club_play", "bucs", "varsity", "bafa"],
      contact_point_kind: ["email", "phone"],
      delivery_outcome: ["delivered", "failed", "rejected", "manual"],
      eligibility_status: ["pending", "eligible", "ineligible", "expired"],
      event_origin: [
        "club_controlled",
        "externally_assigned",
        "externally_scheduled",
        "negotiated",
      ],
      event_status: [
        "draft",
        "pending_approval",
        "approved",
        "occurred",
        "not_held",
        "cancelled",
        "rejected",
        "withdrawn",
      ],
      event_type: [
        "practice",
        "strength_and_conditioning",
        "chalk",
        "fixture",
        "social",
        "recruitment",
        "camp",
        "varsity",
        "meeting",
        "other",
      ],
      fixture_side: ["home", "away", "neutral"],
      follow_up_category: [
        "nonresponse",
        "rsvp_attendance_mismatch",
        "availability",
        "subscription",
        "onboarding",
        "kit_return",
        "handover",
        "other",
      ],
      follow_up_status: ["open", "in_progress", "resolved", "cancelled"],
      invitation_capacity: ["player", "coach", "committee", "guest", "recruit"],
      invitation_status: [
        "pending",
        "issued",
        "responded",
        "expired",
        "cancelled",
      ],
      kit: ["blue", "white"],
      membership_entry: ["new", "returning"],
      membership_status: [
        "carried_forward",
        "confirmed",
        "onboarding",
        "active",
        "inactive",
        "withdrawn",
        "departed",
        "archived",
      ],
      notification_channel: ["whatsapp", "email", "sms", "manual"],
      notification_job_status: [
        "pending",
        "ready",
        "processing",
        "completed",
        "failed",
        "cancelled",
      ],
      notification_job_type: [
        "invitation",
        "reminder",
        "cancellation_notice",
        "schedule_change_notice",
        "escalation",
        "other",
      ],
      onboarding_item_status: [
        "pending",
        "invited",
        "complete",
        "waived",
        "not_applicable",
      ],
      position_side: ["offence", "defence", "special_teams"],
      position_slot: [
        "offence",
        "defence",
        "kickoff",
        "kick_return",
        "punt",
        "field_goal",
      ],
      prospect_status: [
        "identified",
        "engaged",
        "committed",
        "converted",
        "lapsed",
        "declined",
      ],
      question_answer_type: ["text", "boolean", "choice"],
      role_scope: ["committee_year", "season"],
      rsvp_source: ["signed_link", "operator", "channel_reply", "import"],
      rsvp_value: ["yes", "no"],
      schedule_change_source: [
        "club",
        "league",
        "opposition",
        "venue",
        "weather",
        "other",
      ],
      season_status: ["planning", "open", "active", "closing", "archived"],
      term_name: ["michaelmas", "hilary", "trinity"],
    },
  },
} as const

