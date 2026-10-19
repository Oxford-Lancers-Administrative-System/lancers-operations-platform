-- LAN-494. Degree type on the person, apart from the Degree field.
--
-- Brian, 2026-10-10: Student information gains a Degree type — the kind of
-- Oxford award (DPhil, MSc, MBiochem...) — beside the existing free-text
-- Degree field, which keeps the course or subject. An award type is not a
-- course name, and neither column is derived from the other: nothing here
-- reads or rewrites `degree_field`, and no existing row is backfilled.
--
-- `degree_type` holds one of the University's own award abbreviations, the
-- list in `src/lib/services/oxford-degree-types.ts` (sources cited there), or
-- `Visiting` for a recognised or visiting student with no Oxford degree in
-- view, or `Other`. `degree_type_other` is the name of an Other type, and is
-- held only while the type is Other. Both nullable and never required: a
-- non-student, an early recruit and everyone already on file has none.
--
-- No grant changes: `people` already revokes everything from anon,
-- authenticated and service_role and grants service_role exactly select,
-- insert, update and delete (20260810120100_domain_identity.sql); a new
-- column inherits the table grant. RLS is already enabled on the table.
alter table public.people
  add column degree_type text,
  add column degree_type_other text;

alter table public.people
  add constraint people_degree_type_known check (
    degree_type is null or degree_type in (
      'BA', 'BFA', 'BTh', 'BM BCh',
      'MBiochem', 'MBiol', 'MBiomedSci', 'MChem', 'MCompSci', 'MCompPhil',
      'MEarthSci', 'MEng', 'MMath', 'MMathCompSci', 'MMathPhil', 'MMathPhys',
      'MPhys', 'MPhysPhil', 'MSci',
      'MSt', 'MSc', 'MPhil', 'MBA', 'EMBA', 'MFA', 'MPP', 'MTh', 'BCL', 'BPhil',
      'MJur', 'PGDip', 'PGCert', 'PGCE',
      'DPhil', 'MSc by Research', 'DClinPsych',
      'UGCert', 'UGDip', 'UGAdvDip', 'CertHE', 'FCert', 'Diploma in Legal Studies',
      'Visiting',
      'MA', 'MLitt', 'MCh', 'BSc', 'BMus', 'BD', 'BLitt',
      'DEng', 'DD', 'DCL', 'DM', 'DLitt', 'DSc', 'DMus',
      'Other'
    )),
  add constraint people_degree_type_other_not_blank check (
    degree_type_other is null or btrim(degree_type_other) <> ''),
  -- `coalesce`: with no type at all, `degree_type = 'Other'` is null, which a
  -- check constraint would let through.
  add constraint people_degree_type_other_only_for_other check (
    degree_type_other is null or coalesce(degree_type = 'Other', false));

comment on column public.people.degree_type is
  'LAN-494. The Oxford award type (an abbreviation from oxford-degree-types.ts), Visiting, or Other. Separate from degree_field, the course or subject; neither is derived from the other. Optional.';

comment on column public.people.degree_type_other is
  'LAN-494. The name of an Other degree type, as the operator entered it. Held only while degree_type is Other.';

-- The erasure invariant (LAN-361), recreated with both columns in it.
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
      and degree_type is null
      and degree_type_other is null
      and matriculation_year is null
      and expected_graduation_year is null
      and date_of_birth is null
      and student_number is null
      and bafa_registration_number is null
      and merge_reason is null
      and dietary_preference is null
    ));
