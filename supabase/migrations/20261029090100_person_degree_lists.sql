-- LAN-512. College and degree become fixed lists, chosen in the forms; LAN-494's
-- Degree type with Other is superseded (Brian and Stewart, 29 October 2026).
--
-- The degree is now two choices: the award letters in `degree_type` (DPhil,
-- BA, MSc...) and the subject in `degree_field` (Geography; Philosophy,
-- Politics and Economics (PPE)...), the pair offered together by the
-- University. The lists live in `src/lib/services/oxford-academic.ts` with
-- their sources.
--
-- Validation is on input only (Brian): no constraint here refuses a value
-- outside the lists, so existing free text stays readable until LAN-513's
-- cleanup. That is why LAN-494's `people_degree_type_known` goes rather than
-- being rewritten for the new letters: it would hold `degree_type` to a list
-- the database should not enforce, and its list carries Other.
--
-- There is no Other, so `degree_type_other` and its two checks go. LAN-494's
-- migration was never applied in production, so no Other name is lost there;
-- a local row holding one loses it with the column.
--
-- No grant changes: `people` keeps its table grants; RLS stays enabled.

alter table public.people
  drop constraint people_degree_type_known,
  drop constraint people_degree_type_other_not_blank,
  drop constraint people_degree_type_other_only_for_other;

-- The erasure invariant (LAN-361), recreated without the dropped column.
alter table public.people
  drop constraint people_erased_rows_carry_no_identity;

alter table public.people
  drop column degree_type_other;

alter table public.people
  add constraint people_erased_rows_carry_no_identity check (
    erased_at is null
    or (
      family_name is null
      and middle_name is null
      and college is null
      and degree_field is null
      and degree_type is null
      and matriculation_year is null
      and expected_graduation_year is null
      and date_of_birth is null
      and student_number is null
      and bafa_registration_number is null
      and merge_reason is null
      and dietary_preference is null
    ));

comment on column public.people.degree_type is
  'LAN-512. The degree''s award letters (DPhil, BA, MSc...) from the University''s list in oxford-academic.ts, chosen in the forms. Paired with degree_field, the subject. Not constrained here: a legacy value stays until LAN-513''s cleanup.';

comment on column public.people.degree_field is
  'LAN-512. The degree''s subject, from the subjects the University offers with the letters in degree_type. Not constrained here: a legacy free-text value stays until LAN-513''s cleanup.';

comment on column public.people.college is
  'LAN-512. The college or permanent private hall, from the University''s list in oxford-academic.ts, chosen in the forms. Not constrained here: a legacy free-text value stays until LAN-513''s cleanup.';
