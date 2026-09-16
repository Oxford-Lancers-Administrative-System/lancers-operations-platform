-- LAN-376. The standing RSVP is the answer recorded last, whoever recorded it.
--
-- Brian, 2026-09-16: "The last recorded answer wins, whoever recorded it.
-- Operator records Yes, then the player opens their link and says No: it is No.
-- Player says No, then the operator records Yes: it is Yes. No source outranks
-- a later one."
--
-- Until now `public.current_rsvp` ranked by `responded_at`, which is not when
-- an answer was recorded. A player's own answer stamps it with the database
-- clock; an operator's stamps it with the date and time the operator typed —
-- the operator's statement of when the player told them, floored to the
-- picker's five-minute step. Ranking on it therefore let an answer recorded
-- later lose to one recorded earlier, and there was no way for anyone to tell
-- from the event page why.
--
-- `responded_at` keeps its meaning and its place on the record: it is still
-- when the player says they answered, and it is still what an operator types.
-- It simply stops deciding which answer stands.

-- ---------------------------------------------------------------------------
-- The invariant "one answer per instant", moved to the column that now ranks
-- ---------------------------------------------------------------------------
--
-- `rsvp_responses_one_answer_per_instant` existed so that the standing answer
-- was never ambiguous: two rows at the same instant would have tied in the
-- order below. That tie is now a tie on `recorded_at`, so the constraint moves
-- to `recorded_at` with it. This is the same invariant on the column it now
-- protects, not a relaxation of it — and it is what makes an operator
-- correcting their own answer inside one five-minute step possible at all,
-- which the decision above requires (two operator records in one minute used
-- to be refused outright by the unique index on `responded_at`).
alter table public.rsvp_responses
  drop constraint rsvp_responses_one_answer_per_instant;

alter table public.rsvp_responses
  add constraint rsvp_responses_one_answer_per_instant unique (invitation_id, recorded_at);

-- The supporting index follows the new order. The old one led on
-- `responded_at`, which no view reads first any more.
drop index if exists public.rsvp_responses_current_idx;
create index rsvp_responses_current_idx
  on public.rsvp_responses (invitation_id, recorded_at desc, responded_at desc);

-- ---------------------------------------------------------------------------
-- The view
-- ---------------------------------------------------------------------------
--
-- `create or replace` keeps the column list, the grants and the dependent
-- views (`invitation_response_state`, `nonresponse_queue`,
-- `rsvp_attendance_mismatches`, the event-audience and events views) intact —
-- only the order changes. `security_invoker = true` is restated because a view
-- without it runs with its owner's rights, and postgres bypasses RLS (ADR
-- 0010).
create or replace view public.current_rsvp with (security_invoker = true) as
select distinct on (r.invitation_id)
  r.invitation_id,
  r.id as rsvp_response_id,
  r.response,
  r.reason,
  r.raw_capture,
  r.source,
  r.responded_at,
  r.recorded_at
from public.rsvp_responses r
order by r.invitation_id, r.recorded_at desc, r.responded_at desc, r.id desc;

comment on view public.current_rsvp is
  'The standing answer per invitation: the row recorded last, whoever recorded it (LAN-376, Brian 2026-09-16). Each response supersedes the previous; all are retained (model §2.5). `responded_at` is the operator''s statement of when the player told them and never ranks.';

-- Restated rather than assumed. `create or replace view` does preserve
-- privileges, but the posture is that nothing reaches a browser-facing role and
-- that is cheaper to prove here than to look up.
revoke all on public.current_rsvp from anon, authenticated, service_role;
grant select on public.current_rsvp to service_role;
