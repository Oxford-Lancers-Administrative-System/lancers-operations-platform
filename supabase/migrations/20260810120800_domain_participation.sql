-- Domain baseline, part 9 of 12: invitations, RSVP history, question responses
-- and attendance.
--
-- The single most important structural rule in this file: RSVP and attendance
-- are separate authoritative records (locked Requirement 7). A Yes never
-- becomes a Present. There is deliberately no foreign key from attendance to
-- an invitation or a response, and no path by which one creates the other.

-- ---------------------------------------------------------------------------
-- Invitation
-- ---------------------------------------------------------------------------

create table public.invitations (
  id uuid primary key default gen_random_uuid(),

  event_id uuid not null,
  -- Denormalised from the event and kept true by a cascading composite foreign
  -- key. This is what turns invariants P1 and E6 into declarative constraints:
  -- the row cannot exist against a draft, and cannot expire if nothing was
  -- asked. Moving the event backwards out of an approved state would have to
  -- cascade into these columns and break the checks below — which is the point.
  event_status public.event_status not null,
  solicits_response boolean not null,
  season_id uuid not null,

  capacity public.invitation_capacity not null,

  -- Review F05 / invariant P8. Player-capacity invitations anchor to the season
  -- membership (the person is derivable); coach, committee, guest and recruit
  -- capacities anchor to the durable Person via their role. Overlapping seasons
  -- and historical reports are therefore never ambiguous.
  season_membership_id uuid,
  person_id uuid references public.people (id) on delete restrict,

  status public.invitation_status not null default 'pending',
  issued_at timestamptz,
  expires_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),

  constraint invitations_id_event_key unique (id, event_id),
  constraint invitations_id_capacity_key unique (id, capacity),

  constraint invitations_event_state_is_current
    foreign key (event_id, event_status, solicits_response)
    references public.events (id, status, solicits_response) on update cascade,
  constraint invitations_event_same_season
    foreign key (event_id, season_id)
    references public.events (id, season_id) on update cascade,
  constraint invitations_membership_same_season
    foreign key (season_membership_id, season_id)
    references public.season_memberships (id, season_id) on update cascade,

  -- Invariant P1: an invitation requires an approved event. A draft or pending
  -- event can carry no invitations — that is the structural rule of model §2.3.
  -- Cancellation and occurrence are downstream of approval and keep the row,
  -- because invariant P4 says cancellation never deletes an invitation.
  constraint invitations_require_an_approved_event check (
    event_status in ('approved', 'occurred', 'not_held', 'cancelled')),

  -- Invariant P8.
  constraint invitations_anchor_matches_capacity check (
    (capacity = 'player' and season_membership_id is not null and person_id is null)
    or (capacity <> 'player' and season_membership_id is null and person_id is not null)),

  -- Invariant E6: an invitation to a non-soliciting event never reaches
  -- `expired`, so it can never enter the nonresponse exception stream.
  constraint invitations_expire_only_when_asked check (
    solicits_response or status <> 'expired'),

  constraint invitations_cancellation_is_dated check (
    status <> 'cancelled' or cancelled_at is not null)
);

-- One invitation per invitee per event, whichever anchor applies.
create unique index invitations_one_per_player_per_event
  on public.invitations (event_id, season_membership_id)
  where season_membership_id is not null;
create unique index invitations_one_per_person_per_event
  on public.invitations (event_id, person_id)
  where person_id is not null;

create index invitations_event_status_idx on public.invitations (event_id, status);
create index invitations_membership_idx on public.invitations (season_membership_id)
  where season_membership_id is not null;
-- Requirement 6: the nonresponse queue reads exactly this.
create index invitations_expired_idx on public.invitations (status, expires_at)
  where status in ('pending', 'issued');

comment on table public.invitations is
  'An invitation exists whether or not it is ever delivered or answered (invariant P4). Delivery success and failure are NOT stored here — they are derived from notification jobs and delivery results (review F08).';

-- ---------------------------------------------------------------------------
-- RSVP response
-- ---------------------------------------------------------------------------

-- Locked Requirement 5, satisfied verbatim: the domain value is binary.
-- Append-only: each answer supersedes the previous, all are retained, nothing
-- is deleted. The current answer is derived by public.current_rsvp.
create table public.rsvp_responses (
  id uuid primary key default gen_random_uuid(),

  -- Invariant P2 / register D3: invitation-first. Once the season starts, every
  -- invitee is in the database. A walk-up is ATTENDANCE, not an RSVP.
  invitation_id uuid not null references public.invitations (id) on delete restrict,

  response public.rsvp_value not null,
  reason text,

  -- Register D2 as revised by review F01. An inbound WhatsApp "unsure",
  -- "maybe", "Yes?" or anything unparsed is stored here verbatim, mapped to a
  -- non-acceptance, and chased exactly like a no. The historical vocabulary is
  -- preserved as evidence without ever becoming an authoritative value.
  raw_capture text,

  source public.rsvp_source not null,
  responded_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  recorded_by_person_id uuid references public.people (id) on delete restrict,

  -- Invariant P3 / Requirement 5: a non-acceptance must carry a reason. It is
  -- unsubmittable without one.
  constraint rsvp_responses_no_requires_a_reason check (
    response = 'yes' or btrim(coalesce(reason, '')) <> ''),
  constraint rsvp_responses_one_answer_per_instant unique (invitation_id, responded_at)
);

create index rsvp_responses_current_idx
  on public.rsvp_responses (invitation_id, responded_at desc, recorded_at desc);

comment on column public.rsvp_responses.raw_capture is
  'Inbound channel text exactly as received. Never an authoritative value — the authoritative value is the binary `response` column.';

-- ---------------------------------------------------------------------------
-- Question responses
-- ---------------------------------------------------------------------------

create table public.question_responses (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null,
  event_id uuid not null,
  event_question_id uuid not null,

  answer_text text,
  answer_boolean boolean,
  answer_choice text,
  raw_capture text,
  responded_at timestamptz not null default now(),

  constraint question_responses_one_per_question unique (invitation_id, event_question_id),
  -- The question and the invitation must belong to the same event.
  constraint question_responses_invitation_event
    foreign key (invitation_id, event_id)
    references public.invitations (id, event_id) on update cascade,
  constraint question_responses_question_event
    foreign key (event_question_id, event_id)
    references public.event_questions (id, event_id) on update cascade,
  constraint question_responses_exactly_one_answer check (
    num_nonnulls(answer_text, answer_boolean, answer_choice) = 1)
);

create index question_responses_question_idx on public.question_responses (event_question_id);

-- ---------------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------------

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),

  event_id uuid not null,
  -- Same cascading-composite-foreign-key device as invitations, pinned harder:
  -- the check below admits exactly one event status. Marking an event back out
  -- of `occurred` while attendance exists cascades this column and breaks the
  -- check, so the correction has to deal with the attendance first.
  event_status public.event_status not null,
  season_id uuid not null,

  capacity public.invitation_capacity not null,
  season_membership_id uuid,
  person_id uuid references public.people (id) on delete restrict,

  presence public.attendance_presence not null,
  recorded_at timestamptz not null default now(),
  recorded_by_person_id uuid references public.people (id) on delete restrict,

  constraint attendance_records_event_state_is_current
    foreign key (event_id, event_status)
    references public.events (id, status) on update cascade,
  constraint attendance_records_event_same_season
    foreign key (event_id, season_id)
    references public.events (id, season_id) on update cascade,
  constraint attendance_records_membership_same_season
    foreign key (season_membership_id, season_id)
    references public.season_memberships (id, season_id) on update cascade,

  -- Invariant P5: attendance may only be recorded against an event that has
  -- OCCURRED. Draft, pending, rejected, withdrawn, cancelled and not-held
  -- events can never carry attendance, and a passed date never implies
  -- occurrence (review F03).
  constraint attendance_records_require_an_occurred_event check (event_status = 'occurred'),

  -- Invariant P8, same rule as invitations.
  constraint attendance_records_anchor_matches_capacity check (
    (capacity = 'player' and season_membership_id is not null and person_id is null)
    or (capacity <> 'player' and season_membership_id is null and person_id is not null))
);

create unique index attendance_records_one_per_player_per_event
  on public.attendance_records (event_id, season_membership_id)
  where season_membership_id is not null;
create unique index attendance_records_one_per_person_per_event
  on public.attendance_records (event_id, person_id)
  where person_id is not null;

create index attendance_records_membership_idx on public.attendance_records (season_membership_id)
  where season_membership_id is not null;
create index attendance_records_event_idx on public.attendance_records (event_id);

comment on table public.attendance_records is
  'Invariant P6: attendance may exist without an invitation or an RSVP — walk-ups happen. There is deliberately no foreign key to either, and an RSVP never creates an attendance record.';

alter table public.invitations enable row level security;
alter table public.rsvp_responses enable row level security;
alter table public.question_responses enable row level security;
alter table public.attendance_records enable row level security;

revoke all on table public.invitations, public.rsvp_responses, public.question_responses,
     public.attendance_records
  from anon, authenticated, service_role;

grant select, insert, update, delete
  on table public.invitations, public.question_responses, public.attendance_records
  to service_role;

-- Append-only: an answer is superseded by a later answer, never edited away
-- (invariant P4, register D5 — responses survive cancellation forever).
grant select, insert on table public.rsvp_responses to service_role;
