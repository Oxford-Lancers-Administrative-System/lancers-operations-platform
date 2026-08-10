-- Domain baseline, part 1 of 12: extensions and state vocabularies.
--
-- Implements the frozen conceptual domain model v1.2 (Notion, 2026-08-10).
-- See docs/architecture/data-model.md for the conceptual-to-relational map and
-- docs/adr/0009-state-vocabulary-representation.md for why these are native
-- enum types rather than lookup tables.
--
-- Rule of thumb applied throughout: a vocabulary the frozen model *closes*
-- ("exactly the six locked states — no seventh", invariant M4) is an enum, so
-- the database rejects a seventh value. A vocabulary the model says the club
-- configures or versions (positions, onboarding item types, roles) is a table.

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- Cycles
-- ---------------------------------------------------------------------------

-- The three Oxford terms. Model §1.1: terms are coordinates, not containers.
create type public.term_name as enum ('michaelmas', 'hilary', 'trinity');

-- Model §2.8. Opened and closed by an operator; never derived from dates.
create type public.season_status as enum ('planning', 'open', 'active', 'closing', 'archived');

-- ---------------------------------------------------------------------------
-- People, membership and recruitment
-- ---------------------------------------------------------------------------

create type public.contact_point_kind as enum ('email', 'phone');

-- Model §2.1. This is *operational participation and readiness*. Constitutional
-- membership (Fourth Edition §3: admitted and paid) is derived separately —
-- invariant I5, view public.constitutional_membership.
create type public.membership_status as enum (
  'carried_forward',
  'confirmed',
  'onboarding',
  'active',
  'inactive',
  'withdrawn',
  'departed',
  'archived'
);

create type public.membership_entry as enum ('new', 'returning');

-- Model §2.2. `lapsed` is recoverable to `engaged`; people resurface in Hilary.
create type public.prospect_status as enum (
  'identified',
  'engaged',
  'committed',
  'converted',
  'lapsed',
  'declined'
);

-- Model §1.2 / register D8, review F07: a role assignment is scoped to exactly
-- one cycle — a committee year (committee seats) or a season (coaching staff).
create type public.role_scope as enum ('committee_year', 'season');

-- ---------------------------------------------------------------------------
-- Squad structure
-- ---------------------------------------------------------------------------

create type public.position_side as enum ('offence', 'defence', 'special_teams');

-- Invariant S1: one offence and one defence position simultaneously, plus the
-- special-teams slots. Source Data Analysis §11.1 names four of the latter and
-- records them as observed-but-empty; the model tolerates anticipated structure.
create type public.position_slot as enum (
  'offence',
  'defence',
  'kickoff',
  'kick_return',
  'punt',
  'field_goal'
);

create type public.kit as enum ('blue', 'white');

-- Model §2.9. `invited` mirrors the club's own tracked vocabulary — these are
-- process states, not booleans.
create type public.onboarding_item_status as enum (
  'pending',
  'invited',
  'complete',
  'waived',
  'not_applicable'
);

-- Review F04: general readiness never implies competition eligibility (I4).
create type public.competition_scope as enum ('club_play', 'bucs', 'varsity', 'bafa');
create type public.eligibility_status as enum ('pending', 'eligible', 'ineligible', 'expired');

-- Model §2.6 / Requirement 8. Operational status, never a medical record: this
-- vocabulary is the entire permitted expressiveness of the concept.
create type public.availability_level as enum ('green', 'orange', 'red');

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------

create type public.event_type as enum (
  'practice',
  'strength_and_conditioning',
  'chalk',
  'fixture',
  'social',
  'recruitment',
  'camp',
  'varsity',
  'meeting',
  'other'
);

-- Source Data Analysis §5.6: not every event's schedule is the club's to set.
create type public.event_origin as enum (
  'club_controlled',
  'externally_assigned',
  'externally_scheduled',
  'negotiated'
);

-- Model §2.3, as revised by review F03. `occurred` and `not_held` are
-- assertions somebody makes; the passage of a date never implies either.
create type public.event_status as enum (
  'draft',
  'pending_approval',
  'approved',
  'occurred',
  'not_held',
  'cancelled',
  'rejected',
  'withdrawn'
);

create type public.fixture_side as enum ('home', 'away', 'neutral');

create type public.schedule_change_source as enum (
  'club',
  'league',
  'opposition',
  'venue',
  'weather',
  'other'
);

create type public.question_answer_type as enum ('text', 'boolean', 'choice');

-- ---------------------------------------------------------------------------
-- Participation
-- ---------------------------------------------------------------------------

-- Review F05 / invariant P8: the capacity decides what a participation record
-- anchors to. `player` anchors to the season membership, everything else to the
-- durable person via their role.
create type public.invitation_capacity as enum ('player', 'coach', 'committee', 'guest', 'recruit');

-- Model §2.4. Delivery success and failure are deliberately absent: they are
-- derived from notification jobs and delivery results (review F08).
create type public.invitation_status as enum (
  'pending',
  'issued',
  'responded',
  'expired',
  'cancelled'
);

-- Locked Requirement 5, satisfied verbatim. Register D2 as revised by review
-- F01: the domain value is binary. An inbound "unsure" is kept as raw captured
-- text on the response and treated operationally as a non-acceptance.
create type public.rsvp_value as enum ('yes', 'no');

create type public.rsvp_source as enum ('signed_link', 'operator', 'channel_reply', 'import');

create type public.attendance_presence as enum ('present', 'absent', 'late', 'excused');

-- ---------------------------------------------------------------------------
-- Machinery
-- ---------------------------------------------------------------------------

create type public.notification_job_type as enum (
  'invitation',
  'reminder',
  'cancellation_notice',
  'schedule_change_notice',
  'escalation',
  'other'
);

-- Invariant M4: exactly the six states the architecture record locked. Terminal
-- failure is `failed` with the retry policy exhausted, which is what the
-- operator queue reads (Requirement 15).
create type public.notification_job_status as enum (
  'pending',
  'ready',
  'processing',
  'completed',
  'failed',
  'cancelled'
);

create type public.notification_channel as enum ('whatsapp', 'email', 'sms', 'manual');

create type public.delivery_outcome as enum ('delivered', 'failed', 'rejected', 'manual');

create type public.follow_up_status as enum ('open', 'in_progress', 'resolved', 'cancelled');

create type public.follow_up_category as enum (
  'nonresponse',
  'rsvp_attendance_mismatch',
  'availability',
  'subscription',
  'onboarding',
  'kit_return',
  'handover',
  'other'
);
