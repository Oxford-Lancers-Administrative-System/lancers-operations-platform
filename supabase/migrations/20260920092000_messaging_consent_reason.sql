-- LAN-371. Why a messaging consent changed, so an operator can withdraw one.
--
-- A recruit who wants out and cannot make it happen may complain to WhatsApp,
-- which risks the club's sending account. A text-based "press X to stop" was
-- tried and Meta classified it as marketing, so the mechanism is an operator
-- action: "Stop messages" on the recruit's record, with a required reason.
--
-- `season_messaging_consents` already carries who recorded a change
-- (`recorded_by_person_id`, unused until now) and how it was obtained
-- (`source`). It cannot carry **why**, and a withdrawal an operator performed
-- on somebody's behalf without a reason is a decision nobody can review later
-- — the same rule `rsvp_access_tokens` and `person_access_tokens` state about
-- revocation.
--
-- `recorded_by_person_id` is also what tells the two withdrawals apart on the
-- record: set means an operator did it, null means the person did it through
-- their own Stop link. No second column, and no new enum value.
--
-- Deliberately **no check constraint** requiring a reason whenever
-- `recorded_by_person_id` is set. Rows that predate this migration — the
-- showcase dataset's own recruit consents among them — set that column with no
-- reason, and they are historically accurate as they stand. The requirement is
-- enforced where every other authorization rule in this repository is, in the
-- service layer: `messaging-consent.ts` refuses an operator change with no
-- reason before it writes anything.
alter table public.season_messaging_consents
  add column reason text;

comment on column public.season_messaging_consents.reason is
  'Why an operator changed this consent, in the operator''s own words — required of every operator-recorded change (LAN-371). Null for a change the person made themselves through their own Stop link, and for rows recorded before LAN-371.';
