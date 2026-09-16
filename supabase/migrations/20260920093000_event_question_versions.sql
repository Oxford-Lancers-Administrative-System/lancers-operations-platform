-- LAN-367. A question that changes after the invitation went out voids the
-- answers it already collected, and the people who gave them are asked again.
--
-- Brian, 2026-09-16: "a question that did not change keeps every answer; a
-- question that did change has its old answers nullified and everyone who
-- answered is told and asked again; a new question is asked of everyone."
-- Until now `upsertEventQuestionsIn` rewrote the set and nothing looked at
-- `question_responses` or told anybody, so an operator correcting a question's
-- wording silently kept answers to a question nobody had been asked.
--
-- Three things this needs and the schema did not have: a way to say which
-- version of a question an answer was given to, a way to mark an answer
-- superseded without deleting it, and a job type for the message.

-- ---------------------------------------------------------------------------
-- Which version of the question an answer was given to
-- ---------------------------------------------------------------------------
--
-- A version rather than a `sent_at` marker. "Has this question changed since
-- the answer was given?" is the question the re-ask has to answer, and a
-- timestamp only says when things happened relative to each other — it cannot
-- distinguish a question edited twice from one edited once. The version is
-- bumped by the service when the wording, the answer type or a choice
-- question's options change; reordering and a required/optional flip do not
-- bump it, because neither changes what was asked.
alter table public.event_questions
  add column version smallint not null default 1;

alter table public.event_questions
  add constraint event_questions_version_is_positive check (version >= 1);

comment on column public.event_questions.version is
  'Bumped whenever the wording, the answer type or a choice question''s options change — never for a reorder or a required/optional flip (LAN-367). An answer given to an earlier version is superseded and asked again.';

alter table public.question_responses
  add column question_version smallint not null default 1;

comment on column public.question_responses.question_version is
  'The `event_questions.version` this answer was given to (LAN-367).';

-- ---------------------------------------------------------------------------
-- Superseded, never deleted
-- ---------------------------------------------------------------------------
--
-- "changed or removed superseded, not deleted (the audit shows what the person
-- said before), current view shows no answer". The row keeps its value; the
-- stamp is what takes it out of every current read.
alter table public.question_responses
  add column superseded_at timestamptz;

alter table public.question_responses
  add column superseded_reason text;

comment on column public.question_responses.superseded_at is
  'Set when the question this answers changed or was removed (LAN-367). The answer itself is retained — the record of what the person said before — and every current read filters it out.';

-- The uniqueness that made this table "one current answer per question per
-- invitation" has to become "one *live* answer", or a re-answer after a change
-- would collide with the superseded row it is replacing.
alter table public.question_responses
  drop constraint question_responses_one_per_question;

create unique index question_responses_one_live_per_question
  on public.question_responses (invitation_id, event_question_id)
  where superseded_at is null;

-- ---------------------------------------------------------------------------
-- The job type the re-ask is declared as
-- ---------------------------------------------------------------------------
--
-- Its own type, not `schedule_change_notice`: the two say different things,
-- and the existing change notice ends "Your response still stands", which is
-- the opposite of what a voided answer needs to hear. `alter type ... add
-- value` cannot run inside a transaction block in older PostgreSQL; from 12
-- onwards it can, provided the new value is not used in the same transaction.
-- Nothing below uses it.
alter type public.notification_job_type add value if not exists 'question_change_notice';
