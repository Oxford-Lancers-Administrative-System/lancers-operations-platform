-- LAN-361 — erasure means anonymisation, and it takes two sign-offs.
--
-- Brian, 2026-09-16. The controller is the University of Oxford. A person who
-- asks to be erased is tombstoned rather than deleted: everything that
-- identifies them goes, and every record of what the club did — attendance,
-- RSVPs, agreements, delivery results, status events, audit rows — keeps
-- pointing at the row that is left. A club that deleted the row would lose the
-- history of its own seasons, and a person asking not to be identifiable is
-- not asking for that.
--
-- Two things here, and the rest is service-layer:
--
--   1. `people.erased_at`, with the invariant beside it. The check is the
--      point: a row stamped erased cannot also carry a name, a date of birth,
--      a college, a student number or a BAFA number. It is what makes "erased"
--      mean something a reader can verify rather than something a function
--      promised once.
--
--   2. `person_erasure_signoffs` — the two confirmations, as data. The action
--      needs the President and the General Manager each to confirm as separate
--      acts, so there has to be somewhere for the first one to wait. The
--      unique key is the second half of the rule: one signer, one sign-off,
--      so the second confirmation can never be the first signer clicking
--      twice. `requested_on` is the date the person asked, typed by the
--      operator; the club has one month from it.
--
-- The rows are deleted once the erasure completes: what happened is in the one
-- audit event the service writes, which names no personal data, and a table of
-- sign-offs for people who no longer exist is a list of who asked to disappear.

alter table public.people
  add column erased_at timestamptz;

comment on column public.people.erased_at is
  'When this person was anonymised at their own request (LAN-361). A stamped row is a tombstone: it keeps its id and every record that points at it, and carries no identity.';

-- The erasure invariant, in the database rather than in a function's promise.
alter table public.people
  add constraint people_erased_rows_carry_no_identity check (
    erased_at is null
    or (
      family_name is null
      and middle_name is null
      and college is null
      and degree_field is null
      and matriculation_year is null
      and expected_graduation_year is null
      and date_of_birth is null
      and student_number is null
      and bafa_registration_number is null
      and merge_reason is null
    ));

create table public.person_erasure_signoffs (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete restrict,
  signed_by_person_id uuid not null references public.people (id) on delete restrict,

  -- Which of the four seats the signer held when they confirmed — all of them,
  -- because one person may hold two and what is still needed depends on which.
  -- Recorded because the seat is what authorises the act, and seats move.
  role_codes text[] not null,
  -- The date the person asked, as the operator entered it. The club has one
  -- month from it.
  requested_on date not null,
  signed_at timestamptz not null default now(),

  -- One signer, one sign-off. This is the whole of "the second confirmation
  -- cannot come from the first signer".
  constraint person_erasure_signoffs_one_per_signer unique (person_id, signed_by_person_id),
  constraint person_erasure_signoffs_never_self check (person_id <> signed_by_person_id),
  constraint person_erasure_signoffs_role_recorded check (array_length(role_codes, 1) >= 1)
);

create index person_erasure_signoffs_person_idx
  on public.person_erasure_signoffs (person_id);

comment on table public.person_erasure_signoffs is
  'Confirmations waiting for their pair — LAN-361. Two are needed before anything is anonymised, from two different people, and the rows are deleted once the erasure completes.';

-- ---------------------------------------------------------------------------
-- Row Level Security and Data API exposure
-- ---------------------------------------------------------------------------

alter table public.person_erasure_signoffs enable row level security;

revoke all on table public.person_erasure_signoffs from anon, authenticated, service_role;

grant select, insert, delete on table public.person_erasure_signoffs to service_role;
