-- LAN-502. A dietary preference on the person.
--
-- Brian, 2026-10-15: onboarding asks each player for one of three answers —
-- Vegan, Vegetarian, No dietary requirements — and the roster shows it, so food
-- at socials and events can be planned without asking every time.
--
-- On `people`, not on the season membership: it carries across seasons and is
-- corrected from the person record like every other durable person fact.
--
-- Nullable. Everyone already on file has no answer and is not asked again: the
-- onboarding details step requires a choice on the form, but the column is not
-- part of the required set (`person-required.ts`), so nobody who has finished
-- onboarding becomes "missing" a fact or is chased for it.
--
-- The three stored codes are the whole vocabulary. Allergies, medical diets
-- and any further option (pescatarian, halal, kosher) are out of LAN-502's
-- scope; adding one is a check-constraint change here and a label in
-- `src/lib/services/person-dietary.ts`.
--
-- No grant changes: `people` already revokes everything from anon,
-- authenticated and service_role and grants service_role exactly select,
-- insert, update and delete (20260810120100_domain_identity.sql); a new column
-- inherits the table grant. RLS is already enabled on the table.
alter table public.people
  add column dietary_preference text;

alter table public.people
  add constraint people_dietary_preference_known
    check (dietary_preference is null
           or dietary_preference in ('vegan', 'vegetarian', 'none'));

comment on column public.people.dietary_preference is
  'LAN-502. vegan, vegetarian or none ("No dietary requirements"). Asked, and required, on the onboarding details step; null for everyone who onboarded before it was asked, and never chased. Shown on the person record and as a Person column on the roster board.';

-- The erasure invariant (LAN-361) names every identifying column; a diet is a
-- fact about the person, so an erased tombstone carries none.
alter table public.people
  drop constraint people_erased_rows_carry_no_identity;

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
      and dietary_preference is null
    ));
