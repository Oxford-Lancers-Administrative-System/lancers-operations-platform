-- LAN-428, item 4 (Brian, 2026-09-26, after the Saïd fair). How many times the
-- public sign-up page was opened through a code: the first of the three numbers
-- at the top of `/operate/recruitment/qr` (Visits, Partial, Completed).
--
-- A column on the code's own row rather than a table of its own: the counter is
-- keyed to exactly one code, lives and dies with it, and sits beside
-- `sign_in_count`, the Completed number's source, which has the same shape.
-- Incremented server-side by `recordRecruitmentSignupVisitIn` when `/join/[code]`
-- is served for a live code, in the same statement that resolves the code; an
-- unknown or deactivated code counts nothing. The page is unauthenticated, so
-- the number is a count of page loads (link-preview fetches included), which
-- Brian accepts.
--
-- Security posture is the table's own, unchanged and restated here: RLS is
-- enabled (20260901090000_recruitment_schema.sql), `anon` and `authenticated`
-- hold nothing, and `service_role` holds `select, insert, update` on the table,
-- which is the narrow grant this column needs — the server reads and
-- increments it and nothing else touches it. No new grant is made.

alter table public.recruitment_signup_codes
  add column visit_count integer not null default 0;

alter table public.recruitment_signup_codes
  add constraint recruitment_signup_codes_visit_count_non_negative check (visit_count >= 0);

comment on column public.recruitment_signup_codes.visit_count is
  'LAN-428. Times the public sign-up page (/join/[code]) was served for this code while it was live. Incremented server-side by recordRecruitmentSignupVisitIn; never decremented. Page loads, not people: a link-preview fetch counts.';

-- Restated, not changed: the posture every exposed table carries.
alter table public.recruitment_signup_codes enable row level security;
revoke all on table public.recruitment_signup_codes from anon, authenticated;
