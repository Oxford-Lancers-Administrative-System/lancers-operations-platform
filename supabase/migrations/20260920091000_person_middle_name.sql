-- LAN-366. A middle name on the person record.
--
-- `people` carried `given_name`, `family_name` (nullable by design) and
-- `known_as` and nothing between them. Brian, 2026-09-16: a middle name is
-- entered on the person record, the operator's create-person form and the
-- onboarding details step, optional everywhere; the QR sign-up door stays
-- given and family name only; it is shown on the record and its edit form and
-- nowhere else; and it is not part of matching.
--
-- Nullable and never required, on the same reasoning `family_name` is
-- nullable: a quarter of the club's existing records carry a first name and
-- nothing else, and a middle name is rarer still. The not-blank check is the
-- same one the other three name columns carry — an empty string is a value
-- that reads as a name and is not one.
alter table public.people
  add column middle_name text;

alter table public.people
  add constraint people_middle_name_not_blank
    check (middle_name is null or btrim(middle_name) <> '');

comment on column public.people.middle_name is
  'Optional. Shown on the person record and its edit form only — every list, board, template and greeting keeps the display name it already uses. Never part of duplicate matching (LAN-366).';
