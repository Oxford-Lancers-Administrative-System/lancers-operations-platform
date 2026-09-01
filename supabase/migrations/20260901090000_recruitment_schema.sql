-- LAN-201 — WP-recruitment-schema, mission M-RECRUITMENT, epoch E-1.
--
-- The mission's only migration-owning package. Everything else in the mission
-- compiles against the types this regenerates, so nothing else can start until
-- this applies from empty.
--
-- Authority: missions/packets/M-RECRUITMENT/packet.json (REQ-status-ladder,
-- REQ-recruit-record, REQ-qr-per-season, REQ-two-questionnaires,
-- REQ-two-ladders, REQ-rls-and-grants),
-- missions/intake/M-RECRUITMENT/workflows/{W1,W2,W4,W7,W8,W10,W13,W14}.md, and
-- the LAN-201 issue body's Addendum A, approved by Brian 2026-08-31.
--
-- ## Owner correction, 2026-09-01 — there is no duplicate-capture queue
--
-- The packet's `REQ-duplicate-queue` and this migration's own first draft
-- built a parked-capture queue (`recruitment_parked_captures` and its
-- candidate matches) at the Mission Lead's direction, over the conflict the
-- first version of this file recorded against `W8`'s own post-approval
-- amendment ("The queue is deleted"). Brian adjudicated the conflict directly
-- on 2026-09-01: "there is no queue for duplicates, he just gets handled
-- through the normal merge process." `W8` governs; `REQ-duplicate-queue` is
-- stale and superseded, and this package does not implement it. A capture
-- that slips through goes to the people table's own merge at
-- `/operate/people/[personId]/merge` (Mission 5's, already shipped) —
-- nothing here duplicates it. Edited in place rather than layered under a
-- second migration, because this file had not been applied anywhere.
--
-- ## Packet amendment 1 (owner question Q-1), in force here
--
-- The sign-up form is the mission's single consent gate and is the same
-- surface as Questionnaire A. Consent is season-scoped, keyed
-- (person_id, season_id), and gates every send that season — granted, it
-- carries a person from recruit through onboarding to player with no second
-- ask. `recruit_details_ask` as a separate template is withdrawn. Where W4,
-- W5, W6, W7 and W10 on `main` describe the superseded pre-amendment flow,
-- this amendment wins; the conflict is recorded in the package receipt rather
-- than reconciled in those documents.
--
-- ## What this migration does, in seven parts
--
--   1. The seven-value status ladder: `converted` -> `joined`,
--      `lapsed` -> `disengaged`, `void` added. Existing constraints re-added
--      against the new type with their meaning unchanged (Addendum A).
--   2. Attributed, dated notes — `recruitment_prospect_notes` — migrating the
--      prose `notes` column's content rather than dropping it silently.
--   3. Status history — `recruitment_prospect_status_events` — so W2 can show
--      how a recruit reached its current rung and W13 can prove an exit
--      changed only the status.
--   4. Questionnaire answers — `recruitment_questionnaire_responses` — for
--      both questionnaires, on the `/a/[token]` substrate `person_access_tokens`
--      already provides.
--   5. The season sign-up QR — `recruitment_signup_codes` — one live code per
--      season, mintable, deactivatable and re-mintable.
--   6. Season-scoped messaging consent — `season_messaging_consents` — the
--      table every send checks, and Channel Presence's early, partial landing
--      out of the frozen model's §1.2 deferral.
--   7. The recruit ladder on `messaging_schedules`: two new columns on the
--      `recruitment` row's own body (DEC-split-on-the-schedule), never a
--      second row.
--
-- ## `void`, settled
--
-- `DEC-void-is-a-marker` left the shape open and W13 recommended a separate
-- marker column; the Lead's decision (this package's brief) binds instead:
-- `REQ-status-ladder` is explicit that there is exactly one `prospect_status`
-- field with seven values, so `void` is the seventh enum value, not a second
-- column. Whether a recruit appears on the board for a `void` record is a
-- display rule read off this one field, decided by a later package, never by
-- the schema. What the schema does enforce (Addendum A) is that a `void`
-- transition is always explained — see
-- `recruitment_prospect_status_events_void_is_explained` in part 3 — so the
-- record reads as "this row is wrong", not as a claim about the person.
--
-- ## What this migration deliberately does NOT add
--
-- No duplicate-capture queue. See the owner correction above — `W8` governs
-- and there is no review queue; a slipped-through duplicate is the people
-- table's own merge, not a table here.
--
-- No membership status. `season_memberships` and `membership_status` are
-- untouched; `joined` continues to mean the existing `converted_membership_id`
-- linkage into a real season membership (DEC-committed-on-is-joined).
--
-- No separate `void` marker column — see above.
--
-- No admin-configurable questionnaire catalogue. The exact field lists for
-- both questionnaires are still `proposed for owner approval` (W4's own core
-- decisions table), so this migration builds the answer shape generically
-- (`question_code` free text, one of three typed answer columns) rather than
-- seeding specific questions a later package would have to live with.
--
-- No recruitment-cycle schedule rows (the welcome / details-ask / reminder
-- sequence W10 describes). The brief's "What this package delivers" and the
-- LAN-201 issue both scope this migration to the Recruitment event row's two
-- audiences on `messaging_schedules` alone; the cycle itself is
-- `WP-recruitment-messaging`'s.
--
-- No per-channel opt-out table. Addendum A's own words are that the season
-- consent record "is part of [Channel Presence] landing" — it is the landing,
-- not a preface to a second table — and because it gates every send
-- regardless of channel, "an opt-out honoured across channels" falls out of
-- there being exactly one gate rather than one per channel.

begin;

-- ---------------------------------------------------------------------------
-- Part 1 — the seven-value status ladder
-- ---------------------------------------------------------------------------

-- These two carry `prospect_status` literals bound to the type's current OID,
-- exactly the reason `20260828120000_person_substrate.sql` dropped
-- `membership_status`'s dependents first. No view depends on `prospect_status`
-- (checked against `pg_depend`, 2026-09-01).
alter table public.recruitment_prospects
  drop constraint recruitment_prospects_conversion_matches_status,
  drop constraint recruitment_prospects_commitment_is_dated;

-- The column default is bound to the old type's OID exactly as the two
-- constraints were; drop it so `alter column ... type` below does not have to
-- cast a default literal that no longer resolves once the old type is gone.
alter table public.recruitment_prospects
  alter column status drop default;

alter type public.prospect_status rename to prospect_status__superseded;

create type public.prospect_status as enum (
  'identified',
  'engaged',
  'committed',
  'joined',
  'declined',
  'disengaged',
  'void'
);

comment on type public.prospect_status is
  'Model §2.2 as rebuilt 2026-08-31 (LAN-201, REQ-status-ladder). Seven values: converted -> joined, lapsed -> disengaged, and void added as the seventh rung — a marker that the record itself is wrong, never a statement about the person (Addendum A). Whether a void record shows on the board is a display rule read off this one field, decided by a later package, never by the schema.';

-- The total mapping. Meaning is unchanged for every other value, so this is a
-- straight rename rather than the lossy collapse `membership_status` needed.
alter table public.recruitment_prospects
  alter column status type public.prospect_status
  using (
    case status::text
      when 'converted' then 'joined'
      when 'lapsed' then 'disengaged'
      else status::text
    end
  )::public.prospect_status;

drop type public.prospect_status__superseded;

alter table public.recruitment_prospects
  alter column status set default 'identified'::public.prospect_status;

-- Unchanged in meaning, re-added against the new type (Addendum A: "The
-- existing constraints ... are re-added against the new type with their
-- meaning unchanged"). Validated normally rather than `not valid`, because the
-- mapping above is a rename and every row that satisfied the old constraint
-- satisfies this one under its new name.
alter table public.recruitment_prospects
  add constraint recruitment_prospects_conversion_matches_status check (
    (status = 'joined') = (converted_membership_id is not null)),
  add constraint recruitment_prospects_commitment_is_dated check (
    status not in ('committed', 'joined') or committed_on is not null);

-- ---------------------------------------------------------------------------
-- Part 2 — attributed, dated notes
-- ---------------------------------------------------------------------------

-- W2: "Write a note, attributed and dated." `recruitment_prospects.notes` was
-- one prose column with no author; this is a repeating attribute, so it is a
-- table, on the exact `actor_person_id` / `actor_label` idiom
-- `season_membership_status_events` already uses for "a person or a named
-- process, never blank".
create table public.recruitment_prospect_notes (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.recruitment_prospects (id) on delete restrict,

  note text not null,
  author_person_id uuid references public.people (id) on delete restrict,
  author_label text,

  created_at timestamptz not null default now(),

  constraint recruitment_prospect_notes_note_present check (btrim(note) <> ''),
  constraint recruitment_prospect_notes_has_an_author check (
    author_person_id is not null or btrim(coalesce(author_label, '')) <> '')
);

create index recruitment_prospect_notes_prospect_idx
  on public.recruitment_prospect_notes (prospect_id, created_at desc);

comment on table public.recruitment_prospect_notes is
  'W2, DEC-notes-on-the-membership: free text about a recruit, with its author and date. Append-only by privilege — a correction is a new note, never a rewrite.';

-- Migrate the prose column's content rather than dropping it silently
-- (LAN-201 item 2). `created_at` is the best available date for a note nobody
-- timestamped individually; `author_label` says plainly that this is a
-- migrated row rather than inventing an author nothing records.
insert into public.recruitment_prospect_notes (prospect_id, note, author_label, created_at)
select id, notes, 'Migrated from recruitment_prospects.notes (LAN-201)', created_at
  from public.recruitment_prospects
 where notes is not null and btrim(notes) <> '';

alter table public.recruitment_prospects drop column notes;

-- ---------------------------------------------------------------------------
-- Part 3 — status history
-- ---------------------------------------------------------------------------

-- W2 renders it; W13 needs it to prove an exit "changed only the status: the
-- record, its signals and its notes are unchanged" (REQ-exit-is-a-status-
-- change). Same shape as `season_membership_status_events`, including the
-- has-an-actor check.
create table public.recruitment_prospect_status_events (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.recruitment_prospects (id) on delete restrict,
  from_status public.prospect_status,
  to_status public.prospect_status not null,
  occurred_at timestamptz not null default now(),
  actor_person_id uuid references public.people (id) on delete restrict,
  actor_label text,
  reason text,

  constraint recruitment_prospect_status_events_is_a_change check (
    from_status is distinct from to_status),
  constraint recruitment_prospect_status_events_has_an_actor check (
    actor_person_id is not null or btrim(coalesce(actor_label, '')) <> ''),
  -- Addendum A: a void record must never read as a statement about the
  -- person, only as a marker that the record itself is wrong. Enforced on the
  -- transition that means it, rather than as a second column on the current
  -- row — a mistake worth recording is worth explaining, the same reasoning
  -- `nonresponse_flags_resolution_is_explained` and
  -- `operator_accounts_revocation_is_explained` already carry.
  constraint recruitment_prospect_status_events_void_is_explained check (
    to_status <> 'void' or btrim(coalesce(reason, '')) <> '')
);

create index recruitment_prospect_status_events_prospect_idx
  on public.recruitment_prospect_status_events (prospect_id, occurred_at desc);

comment on table public.recruitment_prospect_status_events is
  'W2 / W13 / REQ-exit-is-a-status-change: how a recruit reached its current rung. Append-only by privilege, on the season_membership_status_events pattern.';

-- ---------------------------------------------------------------------------
-- Part 4 — questionnaire answers
-- ---------------------------------------------------------------------------

-- REQ-two-questionnaires, DEC-two-questionnaires: two separate sends, on the
-- shared `/a/[token]` -> `person_access_tokens` substrate. The shape is
-- generic over `question_code` rather than a fixed field list, because W4's
-- own core-decisions table still carries "the six-field set" as `proposed for
-- owner approval` — this migration must not invent the answer.
create type public.recruitment_questionnaire as enum ('personal_details', 'football_background');

comment on type public.recruitment_questionnaire is
  'W4''s two separate sends (DEC-two-questionnaires). personal_details is Questionnaire A, football_background is Questionnaire B. Question text, order and the exact field set are a later package''s to seed once Brian settles them.';

create table public.recruitment_questionnaire_responses (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.recruitment_prospects (id) on delete restrict,
  questionnaire public.recruitment_questionnaire not null,
  question_code text not null,

  -- Same three-column shape `question_responses` already carries for exactly
  -- the same reason: yes/no, a fixed-set chooser, and open text.
  answer_text text,
  answer_boolean boolean,
  answer_choice text,

  responded_at timestamptz not null default now(),
  -- W4 exceptions: "The recruit answers twice. The later answer supersedes;
  -- the earlier is kept." The same superseded_at idiom `rsvp_access_tokens`
  -- already uses, rather than `question_responses`' overwrite-in-place, so the
  -- earlier answer is retained rather than lost.
  superseded_at timestamptz,

  created_at timestamptz not null default now(),

  constraint recruitment_questionnaire_responses_exactly_one_answer check (
    num_nonnulls(answer_text, answer_boolean, answer_choice) = 1),
  constraint recruitment_questionnaire_responses_question_code_present check (
    btrim(question_code) <> '')
);

-- The current answer per question. A missing row for an asked questionnaire
-- is what "left blank" is — never a placeholder, never a value that blocks
-- anything (REQ-missing-never-blocks, invariant 4).
create unique index recruitment_questionnaire_responses_one_current_per_question
  on public.recruitment_questionnaire_responses (prospect_id, questionnaire, question_code)
  where superseded_at is null;

comment on table public.recruitment_questionnaire_responses is
  'REQ-two-questionnaires. What a recruit chose to answer on either send, attributed to the recruit and never to the club (Addendum A). A missing question_code is what "left blank" looks like.';

-- ---------------------------------------------------------------------------
-- Part 5 — the season sign-up QR
-- ---------------------------------------------------------------------------

-- REQ-qr-per-season, DEC-one-qr-per-season, Addendum A: one live code per
-- season, mintable, deactivatable and re-mintable.
create table public.recruitment_signup_codes (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete restrict,

  -- Unlike rsvp_access_tokens / person_access_tokens / club_link_tokens, this
  -- is not a secret: it is a shared, printable code for a whole season and
  -- W1-04 has to redisplay it (COPY LINK, DOWNLOAD) indefinitely, which a
  -- digest-only credential can never do because its plaintext is discarded at
  -- mint. Reaching it only opens the public sign-up page (W7) — nothing about
  -- the club is exposed by knowing it.
  code text not null,

  minted_at timestamptz not null default now(),
  minted_by_person_id uuid references public.people (id) on delete restrict,

  deactivated_at timestamptz,
  deactivated_by_person_id uuid references public.people (id) on delete restrict,
  deactivated_reason text,

  sign_in_count integer not null default 0,

  created_at timestamptz not null default now(),

  constraint recruitment_signup_codes_code_unique unique (code),
  constraint recruitment_signup_codes_code_present check (btrim(code) <> ''),
  constraint recruitment_signup_codes_sign_in_count_non_negative check (sign_in_count >= 0),
  constraint recruitment_signup_codes_deactivation_is_explained check (
    deactivated_at is null or btrim(coalesce(deactivated_reason, '')) <> '')
);

-- Re-minting is deactivate-then-insert, the same partial-unique-index idiom
-- `person_access_tokens_one_live_per_person_season` already uses.
create unique index recruitment_signup_codes_one_live_per_season
  on public.recruitment_signup_codes (season_id)
  where deactivated_at is null;

comment on table public.recruitment_signup_codes is
  'REQ-qr-per-season. One live sign-up code per season, mintable, deactivatable and re-mintable (Addendum A). Points at the club''s own public page (W7) — never an external form.';

-- ---------------------------------------------------------------------------
-- Part 6 — season-scoped messaging consent (Channel Presence's early landing)
-- ---------------------------------------------------------------------------

-- Packet amendment 1: consent is keyed (person_id, season_id), unique per
-- season, and gates every send that season regardless of channel — which is
-- what makes "an opt-out honoured across channels" true of one gate rather
-- than requiring a second, per-channel table.
--
-- Frozen model §1.2 defers Channel Presence from the release-one schema
-- (docs/architecture/data-model.md, "Deliberately not implemented"). This
-- table is that entity's early, partial landing: Brian's owner amendment of
-- 2026-08-31 (packet amendment 1), not a quiet migration. The map is updated
-- in the same PR.
create type public.messaging_consent_state as enum (
  'never_asked', 'asked', 'granted', 'refused', 'withdrawn'
);

create type public.messaging_consent_source as enum (
  'qr_self_entry', 'walk_up_read_back', 'operator_recorded'
);

create table public.season_messaging_consents (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete restrict,
  season_id uuid not null references public.seasons (id) on delete restrict,

  state public.messaging_consent_state not null default 'never_asked',
  source public.messaging_consent_source,
  changed_at timestamptz not null default now(),
  recorded_by_person_id uuid references public.people (id) on delete restrict,

  created_at timestamptz not null default now(),

  constraint season_messaging_consents_one_per_person_per_season unique (person_id, season_id),
  -- An outcome names how it was obtained; "never asked" and "asked" have
  -- nothing yet to obtain.
  constraint season_messaging_consents_outcome_has_a_source check (
    (state in ('granted', 'refused', 'withdrawn')) = (source is not null))
);

create index season_messaging_consents_season_state_idx
  on public.season_messaging_consents (season_id, state);

comment on table public.season_messaging_consents is
  'Packet amendment 1 (Brian, 2026-08-31): the season-scoped consent gate every send checks. Granted, it carries a person from recruit through onboarding to player with no second ask; each new season is re-approved. Channel Presence''s early, partial landing out of the frozen model''s §1.2 deferral.';

-- ---------------------------------------------------------------------------
-- Part 7 — the recruit ladder on the messaging schedule
-- ---------------------------------------------------------------------------

-- REQ-two-ladders, DEC-split-on-the-schedule: the two ladders split in the
-- body of the Recruitment event row, not as a second row, so that one row per
-- event type and one save per row — both laws of that page — survive. Regular
-- players keep the shipped six-field chase unchanged; these two columns are
-- the Recruits group's own "first invitation, one follow-up", with no
-- escalation field at all. Null for every event type but `recruitment`.
alter table public.messaging_schedules
  add column recruit_invitation_lead_days smallint,
  add column recruit_follow_up_cadence_hours smallint;

-- Populate before the constraints below so the check is validated against a
-- table that already satisfies it, not the freshly widened, still-null one.
update public.messaging_schedules
   set recruit_invitation_lead_days = 5,
       recruit_follow_up_cadence_hours = 72
 where event_type = 'recruitment';

alter table public.messaging_schedules
  add constraint messaging_schedules_recruit_fields_are_recruitment_only check (
    (event_type = 'recruitment') = (recruit_invitation_lead_days is not null)
    and (event_type = 'recruitment') = (recruit_follow_up_cadence_hours is not null)),
  add constraint messaging_schedules_recruit_invitation_lead_is_sane check (
    recruit_invitation_lead_days is null or recruit_invitation_lead_days between 0 and 120),
  add constraint messaging_schedules_recruit_follow_up_cadence_is_sane check (
    recruit_follow_up_cadence_hours is null or recruit_follow_up_cadence_hours between 1 and 720);

comment on column public.messaging_schedules.recruit_invitation_lead_days is
  'DEC-split-on-the-schedule: the Recruits audience''s own first-invitation lead, in the body of the Recruitment row rather than a second row. Null for every event type but recruitment.';
comment on column public.messaging_schedules.recruit_follow_up_cadence_hours is
  'Hours after the recruit invitation before the one permitted follow-up. Recruits carry no escalation field at all (REQ-two-ladders, REQ-never-harsh).';

-- ---------------------------------------------------------------------------
-- Row Level Security and Data API exposure
-- ---------------------------------------------------------------------------
-- ADR 0002 / ADR 0010, unchanged and no weaker: RLS on, zero policies, nothing
-- granted to a browser-facing role, only the narrow server need to
-- `service_role`.

alter table public.recruitment_prospect_notes enable row level security;
alter table public.recruitment_prospect_status_events enable row level security;
alter table public.recruitment_questionnaire_responses enable row level security;
alter table public.recruitment_signup_codes enable row level security;
alter table public.season_messaging_consents enable row level security;

revoke all on table
  public.recruitment_prospect_notes,
  public.recruitment_prospect_status_events,
  public.recruitment_questionnaire_responses,
  public.recruitment_signup_codes,
  public.season_messaging_consents
  from anon, authenticated, service_role;

-- Append-only, by privilege rather than convention: a note or a status change
-- is corrected by adding a new row, never by rewriting one.
grant select, insert on table
  public.recruitment_prospect_notes,
  public.recruitment_prospect_status_events
  to service_role;

-- A later, corrected answer supersedes in place (`superseded_at`), so update
-- is needed alongside insert; never delete.
grant select, insert, update on table public.recruitment_questionnaire_responses to service_role;

-- Minted, deactivated, re-minted; the sign-in counter is updated in place.
-- Never deleted — the record that a code existed outlives the code.
grant select, insert, update on table public.recruitment_signup_codes to service_role;

-- The current consent state, corrected in place. `audit_events` carries the
-- change history generically (invariant M2), exactly as it does for
-- `operator_accounts`.
grant select, insert, update on table public.season_messaging_consents to service_role;

commit;
