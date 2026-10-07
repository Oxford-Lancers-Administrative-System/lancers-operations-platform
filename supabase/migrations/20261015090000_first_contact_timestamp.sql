-- LAN-486 — Recruitment "First contact" becomes an exact timestamp
-- (Brian, 7 October 2026: option B, done in place).
--
-- `recruitment_prospects.first_contact_on` changes type from `date` to
-- `timestamptz`. It keeps its name: no new column, no rename, no
-- expand/contract. This migration is applied before the new revision is
-- deployed, so the running code meets the new type for a short window. In
-- that window every old insert passes `$n::date`, which Postgres assigns to a
-- timestamptz implicitly, and every old read (`to_char(...)`, the merge's
-- `coalesce($n::date, first_contact_on)`) accepts a timestamptz. A rename or a
-- new column would refuse QR sign-up, the board and walk-up entry for that
-- window, so neither is done.
--
-- Backfill:
--   * where the Europe/London date of `created_at` equals the stored date, the
--     row's own creation time is when the recruit first contacted the club —
--     every production row on 7 October (33 of 33, all QR sign-ups);
--   * any other row gets 00:00 Europe/London on its stored date (local seed
--     data, and any walk-up recorded on hosted before release).
-- A null stays null. The overwritten date values remain recoverable from
-- `created_at` and from the 00:00 London instant itself.

begin;

alter table public.recruitment_prospects
  alter column first_contact_on type timestamptz
  using case
    when first_contact_on is null then null
    when (created_at at time zone 'Europe/London')::date = first_contact_on then created_at
    else first_contact_on::timestamp at time zone 'Europe/London'
  end;

comment on column public.recruitment_prospects.first_contact_on is
  'LAN-486: the instant the recruit first contacted the club. QR sign-up and '
  'hand-add record now(); walk-up records the event''s start (Europe/London), '
  'or now() when the event has no start time; a person merge keeps the earlier '
  'of the two. Surfaces that show a day take the Europe/London date of it.';

commit;
