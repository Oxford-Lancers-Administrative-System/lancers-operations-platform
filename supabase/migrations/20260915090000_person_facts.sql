-- LAN-275 (G6) — person facts: student number and BAFA registration number.
--
-- This package's only migration, and the wave's first: G7's
-- `20260916090000_event_templates.sql` follows it and touches disjoint tables
-- (`event_templates`, `messaging_schedules`, `event_type_settings`,
-- `events.template_id`), so only the order matters, not the content
-- (Lead, LAN-275, 2026-09-09).
--
-- ## What this adds, and why it is two columns on `people`
--
-- LAN-267 needs two facts the club has never recorded anywhere:
--
--   * the **student number**, which the BAFRA roster form prints beside every
--     dressed player's name, and
--   * the **BAFA registration number**, which it prints beside every coach and
--     sideline person.
--
-- Both are durable facts *about the person*, not ways of reaching them, so
-- neither is a `contact_points` row. `contact_points` holds a `kind`
-- (`phone`, `email`) and a `scope` (`college`, `personal`) and exists to
-- answer "where do we write to this person"; it carries `valid_from` /
-- `valid_until` because a way of reaching somebody is superseded rather than
-- corrected. A student number is not superseded — it is the university's own
-- identifier for one person and it does not change while they are here — and
-- `selectMobileNumber`, the audience queries and the delivery path all walk
-- `contact_points` looking for something to send to. Putting an identifier
-- there would put a non-address into the table every send path reads.
--
-- So they land exactly where `college`, `matriculation_year`,
-- `expected_graduation_year`, `degree_field` and `date_of_birth` landed in
-- `20260828120000_person_substrate.sql` (field inventory rows 9–13): nullable
-- columns on `people`, blank-checked, filled in by the questionnaire and by
-- the operator edit form, and chased by the missing-data queue rather than
-- refused by a `not null`.
--
-- ## Nullable, deliberately
--
-- Every person already on file has neither. A `not null` would refuse the
-- club's own roster, which is the mistake `family_name` was kept nullable to
-- avoid. Missing values print blank on the form and are named in the warning
-- line above it (LAN-267), which is the whole point of generating the form
-- from the record: the operator can see who to chase before the game.
--
-- ## Privacy
--
-- Both are personal facts under the same handling as the other person facts:
-- shown on the person record to an authorised operator, never on a list,
-- board or queue, and named in the privacy notice (LAN-236). They are
-- deliberately *not* held to `date_of_birth`'s stricter
-- `REQ-restricted-fields` rule — the roster form has to print them, and that
-- form is the reason they exist — so they are read by
-- `src/lib/services/roster-form.ts`, which is that form's own reader and
-- nothing else.
--
-- ## Nothing else is needed for the required college email
--
-- LAN-268 makes the college email a required fact on both doors and on the
-- player questionnaire. It is already `contact_points` with `scope = 'college'`
-- (`20260828120000_person_substrate.sql`, part 2c), so it needs no schema at
-- all: required-ness is `person-required.ts`'s tier table, and the Oxford
-- domain rule is a validator. No onboarding item type is added — the
-- missing-data queue reads the required-set tiers, not
-- `onboarding_item_types`.

-- ---------------------------------------------------------------------------
-- The two identifiers
-- ---------------------------------------------------------------------------

alter table public.people
  add column student_number text,
  add column bafa_registration_number text;

alter table public.people
  add constraint people_student_number_not_blank check (
    student_number is null or btrim(student_number) <> ''),
  add constraint people_bafa_registration_number_not_blank check (
    bafa_registration_number is null or btrim(bafa_registration_number) <> '');

comment on column public.people.student_number is
  'The university''s own identifier for this person, as they wrote it. LAN-267: printed beside the name on the BAFRA roster form. Free text, never validated to a pattern — the club has no authority over its shape and refusing a real number would lose it.';

comment on column public.people.bafa_registration_number is
  'BAFA registration number. LAN-267: printed beside every coach and sideline person on the BAFRA roster form. Writable by an authorised operator as well as by the player questionnaire, because a coach never sees a questionnaire and the form''s coach table is the half the officials need.';

-- ---------------------------------------------------------------------------
-- Grants and RLS
-- ---------------------------------------------------------------------------
--
-- Nothing to do, and that is worth saying rather than leaving to inference.
-- `public.people` already has row level security enabled
-- (`20260810120100_domain_identity.sql`) and its grants are table-wide, not
-- per-column: `anon` and `authenticated` hold nothing, and `service_role`
-- holds exactly what the server path needs. A column added to an existing
-- table inherits both. `npm run check:rls` has nothing to check here because
-- this migration creates no table.
