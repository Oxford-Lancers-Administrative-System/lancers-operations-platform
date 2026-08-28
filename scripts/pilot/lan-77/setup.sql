-- LAN-77 audience confirmation and approval — SETUP.
--
-- Creates the two scenarios that make LAN-77's approval transaction testable by
-- hand against the deployed application, and creates nothing else.
--
-- Run by a human. Never by a migration, a seed, CI, a deploy or the app.
--
-- WHAT IT ADDS
--   * Three clearly synthetic people with contact points, and three `active`
--     memberships in the open season. `active` is the state the audience
--     builder selects from, so without them the builder is empty and none of
--     the matrix is reachable. Unlike LAN-75's scenario — which deliberately
--     stops at `confirmed` because activation is the thing under test — here
--     `active` is a *precondition*, not the result.
--   * One `draft` event, "PILOT-LAN-77 Approval scenario". The empty-audience
--     refusal, the successful approval and the double submission are all run
--     against this one.
--   * One further `draft` event, "PILOT-LAN-77 Rollback scenario", together
--     with a single notification job that has already claimed the idempotency
--     key its first invitee's job would need. Approving that event therefore
--     fails at the last write of the transaction, which is what makes rollback
--     observable by hand rather than only in an automated test.
--
-- WHAT IT DELIBERATELY DOES NOT ADD
--   * No season. The open season belongs to the permanent pilot foundation and
--     this script ASSERTS it — the service layer refuses when two seasons are
--     open at once, so a scenario creating its own would break the feature it
--     exists to test.
--   * No auth user, operator account, role assignment or access grant. Approval
--     needs a President, Vice-President, Secretary or General Manager; that is
--     Brian's to arrange through docs/pilot-data-runbook.md, and this script
--     reports whether one exists rather than granting anything.
--   * No `event_audience_members`, no `invitations`, and no notification job
--     for the approval scenario. Those are the result the test produces. The one
--     job it does create belongs to the rollback scenario and is a *blocker*,
--     not a result — see below.
--   * No audit row. Approval writes its own, naming the human who approved.
--   * No role assignment for the synthetic people. They are invitees, not
--     operators, and nothing here can sign in.
--
-- WHAT IT CAN CAUSE TO BE SENT
--   Nothing, by itself. It creates no invitation and no deliverable job. The
--   one job it creates is `cancelled`, belongs to no invitation, and exists
--   only to occupy an idempotency key.
--
--   Approving the scenario event through the application WILL create real
--   notification jobs for the three synthetic people. Their contact points use
--   the reserved `.invalid` TLD and Ofcom's reserved drama range, so neither can
--   reach a real person even if LAN-78 later dispatches them. Run cleanup.sql
--   when the scenario is no longer needed.
--
-- OWNERSHIP MARKER — both halves, on every row:
--   * a deterministic primary key from the block 00770077-0077-4077-8077-…
--   * the sentinel string PILOT-LAN-77 in a text column — the display alias of a
--     person, `source` on a contact point, `actor_label` on a status event,
--     `name` on an event, `idempotency_key` and `cancelled_reason` on the job.
--   The three `season_memberships` rows are the one exception: the table has no
--   free text column that is not load-bearing (`inactivity_label` describes an
--   `inactive` membership and these are `active`). They carry the deterministic
--   id AND belong to this scenario's people AND sit in the open season — a
--   three-way chain no unrelated row satisfies. Cleanup checks all three.
--
-- Safe to run twice: every insert is `on conflict (id) do nothing`. There is no
-- `do update` anywhere in this file, so a row this script did not create is
-- never silently rewritten.
--
-- Paired with cleanup.sql in this directory. Read README.md there first.
--
-- That alias is where LAN-182 moved the name a person is shown under. It was
-- `people.known_as` until the migration struck that column; the sentinel reads
-- on screen in exactly the same place it always did.

begin;

-- ---------------------------------------------------------------------------
-- Preflight, part 1 of 2: make the target reviewable BEFORE anything is written
-- ---------------------------------------------------------------------------
-- Read this result set before you read anything else. If the database or the
-- user is not what you intended, roll back — you are one `commit` from writing
-- to it.
select
  'LAN-77 pilot setup — target' as check,
  current_database() as database,
  current_user as connected_as,
  now() as at,
  (select count(*) from public.people) as people_rows_before,
  (select count(*) from public.season_memberships) as membership_rows_before,
  (select count(*) from public.events) as event_rows_before,
  (select count(*) from public.event_audience_members) as audience_rows_before,
  (select count(*) from public.invitations) as invitation_rows_before,
  (select count(*) from public.notification_jobs) as job_rows_before,
  (
    select count(*) from public.seasons where status in ('open', 'active')
  ) as open_seasons,
  (
    select string_agg(label, ', ') from public.seasons where status in ('open', 'active')
  ) as open_season_label,
  (
    select count(*) from public.events where name like '%PILOT-LAN-77%'
  ) as scenario_events_already_present,
  -- Not a guard: this script grants nothing, and who holds a seat is arranged
  -- through docs/pilot-data-runbook.md. Reported so you can see, before you
  -- commit, whether the approval step is performable yet. Zero is not a
  -- failure — the audience builder and the authorization refusal are both
  -- testable regardless, and rows 1 and 2 of the matrix need no approver.
  (
    select count(*)
    from public.role_assignments ra
    join public.roles r on r.id = ra.role_id
    where r.code in ('president', 'vice_president', 'secretary', 'general_manager')
      and ra.effective_from <= current_date
      and (ra.effective_to is null or ra.effective_to > current_date)
  ) as approver_assignments_available;

-- ---------------------------------------------------------------------------
-- Preflight, part 2 of 2: prerequisites, every one of which aborts
-- ---------------------------------------------------------------------------
-- Every check below raises. None warns and continues: the point is to stop a
-- test that could not have meant anything, before a human spends an afternoon
-- on it.
do $preflight$
declare
  -- The audience relation, which is the last migration this scenario needs.
  required_migration constant text := '20260810121300';
  scenario_person constant uuid := '00770077-0077-4077-8077-000000000010';
  open_seasons integer;
begin
  -- (a) The schema this scenario was written against must actually be applied.
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception
      'LAN-77 setup: no supabase_migrations.schema_migrations table. This does not look like a Supabase-managed database.';
  end if;

  if not exists (
    select 1 from supabase_migrations.schema_migrations where version >= required_migration
  ) then
    raise exception
      'LAN-77 setup: migration % is not applied. The event audience relation does not exist yet, so nothing here would work.',
      required_migration;
  end if;

  -- (b) Exactly one open season. Two is the condition the service layer refuses
  -- outright, and zero leaves the memberships nowhere to go.
  select count(*) into open_seasons from public.seasons where status in ('open', 'active');

  if open_seasons = 0 then
    raise exception
      'LAN-77 setup: no open or active season. The permanent pilot foundation provides it — see docs/pilot-data-runbook.md.';
  end if;

  if open_seasons > 1 then
    raise exception
      'LAN-77 setup: % seasons are open or active. The application refuses to resolve a current season while that is true.',
      open_seasons;
  end if;

  -- (c) A deterministic id already in use by something that is NOT this
  -- scenario would mean the id block collided with real data. `on conflict do
  -- nothing` would silently skip it and leave a half-installed scenario.
  if exists (
    select 1 from public.people
    where id = scenario_person and coalesce((select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1), '') <> 'PILOT-LAN-77'
  ) then
    raise exception
      'LAN-77 setup: person % exists and is not this scenario''s. Refusing to touch it.',
      scenario_person;
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. The synthetic people
-- ---------------------------------------------------------------------------
-- Names are obviously not real and are readable on screen as such, which is the
-- point: a human running the matrix has to be able to tell a scenario row from
-- a club row at a glance.
insert into public.people (id, given_name, family_name)
values
  ('00770077-0077-4077-8077-000000000010', 'Alder', 'Pilotcase'),
  ('00770077-0077-4077-8077-000000000011', 'Bracken', 'Pilotcase'),
  ('00770077-0077-4077-8077-000000000012', 'Cobble', 'Pilotcase')
on conflict (id) do nothing;

-- The sentinel, in the place LAN-182 moved it to: the alias flagged as each
-- person's display name. It reads on screen exactly where `known_as` used to.
insert into public.person_aliases (id, person_id, alias, source, is_display_name)
values
  ('00770077-0077-4077-8077-000000009010', '00770077-0077-4077-8077-000000000010', 'PILOT-LAN-77', 'PILOT-LAN-77', true),
  ('00770077-0077-4077-8077-000000009011', '00770077-0077-4077-8077-000000000011', 'PILOT-LAN-77', 'PILOT-LAN-77', true),
  ('00770077-0077-4077-8077-000000009012', '00770077-0077-4077-8077-000000000012', 'PILOT-LAN-77', 'PILOT-LAN-77', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Contact points that cannot reach anybody
-- ---------------------------------------------------------------------------
-- `.invalid` is reserved by RFC 2606 and can never resolve. The phone numbers
-- are in Ofcom's reserved drama range, which is never allocated to a subscriber.
-- Both matter more here than in any earlier scenario: this is the first issue
-- whose feature creates queued messages addressed to these values.
insert into public.contact_points (id, person_id, kind, raw_value, is_preferred, source)
values
  ('00770077-0077-4077-8077-000000000030', '00770077-0077-4077-8077-000000000010',
   'email', 'alder.pilotcase@example.invalid', true, 'PILOT-LAN-77 setup script'),
  ('00770077-0077-4077-8077-000000000031', '00770077-0077-4077-8077-000000000010',
   'phone', '+44 7700 900771', true, 'PILOT-LAN-77 setup script'),
  ('00770077-0077-4077-8077-000000000032', '00770077-0077-4077-8077-000000000011',
   'phone', '+44 7700 900772', true, 'PILOT-LAN-77 setup script'),
  ('00770077-0077-4077-8077-000000000033', '00770077-0077-4077-8077-000000000012',
   'phone', '+44 7700 900773', true, 'PILOT-LAN-77 setup script')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Three active memberships in the open season
-- ---------------------------------------------------------------------------
insert into public.season_memberships
  (id, person_id, season_id, status, entry, confirmed_on, activated_on)
select
  member.id,
  member.person_id,
  season.id,
  'active',
  'returning',
  current_date - 30,
  current_date - 14
from (values
  ('00770077-0077-4077-8077-000000000020'::uuid, '00770077-0077-4077-8077-000000000010'::uuid),
  ('00770077-0077-4077-8077-000000000021'::uuid, '00770077-0077-4077-8077-000000000011'::uuid),
  ('00770077-0077-4077-8077-000000000022'::uuid, '00770077-0077-4077-8077-000000000012'::uuid)
) as member(id, person_id)
cross join (
  select id from public.seasons where status in ('open', 'active') limit 1
) as season
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Truthful status history for each of them
-- ---------------------------------------------------------------------------
-- A membership that appeared at `active` with no history would be a lie about
-- how it got there, and invariant M2 says every transition leaves a record. The
-- actor is a named process rather than a person — nobody performed these.
--
-- Two steps each, not three. The chain used to walk
-- `null → confirmed → onboarding → active`, and LAN-182 maps `confirmed` onto
-- `onboarding` — so the middle step would now record a change from a state to
-- itself. Identifiers …0041, …0044 and …0047 are consequently unused; cleanup
-- still names them, so an install made before this change is still removed.
insert into public.season_membership_status_events
  (id, season_membership_id, from_status, to_status, occurred_at, actor_label)
values
  ('00770077-0077-4077-8077-000000000040', '00770077-0077-4077-8077-000000000020',
   null, 'onboarding', now() - interval '30 days', 'PILOT-LAN-77 setup script'),
  ('00770077-0077-4077-8077-000000000042', '00770077-0077-4077-8077-000000000020',
   'onboarding', 'active', now() - interval '14 days', 'PILOT-LAN-77 setup script'),
  ('00770077-0077-4077-8077-000000000043', '00770077-0077-4077-8077-000000000021',
   null, 'onboarding', now() - interval '30 days', 'PILOT-LAN-77 setup script'),
  ('00770077-0077-4077-8077-000000000045', '00770077-0077-4077-8077-000000000021',
   'onboarding', 'active', now() - interval '14 days', 'PILOT-LAN-77 setup script'),
  ('00770077-0077-4077-8077-000000000046', '00770077-0077-4077-8077-000000000022',
   null, 'onboarding', now() - interval '30 days', 'PILOT-LAN-77 setup script'),
  ('00770077-0077-4077-8077-000000000048', '00770077-0077-4077-8077-000000000022',
   'onboarding', 'active', now() - interval '14 days', 'PILOT-LAN-77 setup script')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 5. The two draft events
-- ---------------------------------------------------------------------------
-- Both are dated a week out, so the configured two-day practice deadline still
-- lies in the future and the approval screen shows a real date rather than the
-- "due immediately" clamp. Testing the clamp is matrix row 8, and it uses a
-- date the operator edits through the application rather than a third event.
insert into public.events
  (id, season_id, name, event_type, origin, status, scheduled_on, starts_at, ends_at,
   venue, is_mandatory)
select
  scenario.id,
  season.id,
  scenario.name,
  'practice',
  'club_controlled',
  'draft',
  current_date + 7,
  '19:00',
  '21:00',
  'PILOT-LAN-77 synthetic venue',
  true
from (values
  ('00770077-0077-4077-8077-000000000050'::uuid, 'PILOT-LAN-77 Approval scenario'),
  ('00770077-0077-4077-8077-000000000051'::uuid, 'PILOT-LAN-77 Rollback scenario')
) as scenario(id, name)
cross join (
  select id from public.seasons where status in ('open', 'active') limit 1
) as season
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 6. The blocker that makes rollback observable
-- ---------------------------------------------------------------------------
-- Invariant M1 gives every invitation job a key derived from the event, the
-- capacity and the participant. This row claims, in advance, exactly the key
-- the rollback scenario's first invitee would need — so approving that event
-- fails on the very last insert of the transaction, after the event has been
-- flipped to `approved`, after the audience is in and after the invitations
-- are in. Everything then rolls back together, which is the property matrix
-- row 7 exists to see.
--
-- It is `cancelled` and names no invitation, so nothing will ever try to send
-- it, and no queue will pick it up. Its `event_id` is what ties it to the
-- scenario for cleanup.
insert into public.notification_jobs
  (id, idempotency_key, job_type, status, event_id, cancelled_reason)
values
  ('00770077-0077-4077-8077-000000000060',
   'event:00770077-0077-4077-8077-000000000051:invitation:player:00770077-0077-4077-8077-000000000020',
   'invitation',
   'cancelled',
   '00770077-0077-4077-8077-000000000051',
   'PILOT-LAN-77: occupies an idempotency key so the rollback scenario fails deliberately')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Verification — read this before you commit
-- ---------------------------------------------------------------------------
-- Expected on a correct install: 3, 4, 3, 9, 2, 1, and 0 for both result
-- counts. A non-zero audience or invitation count means a previous run of the
-- matrix was not cleaned up, and the approval scenario will refuse as "already
-- approved" rather than behaving as the matrix expects.
select
  'LAN-77 pilot setup — installed' as check,
  (select count(*) from public.people
    where (select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1) = 'PILOT-LAN-77') as scenario_people,
  (select count(*) from public.contact_points
    where source = 'PILOT-LAN-77 setup script') as scenario_contact_points,
  (select count(*) from public.season_memberships
    where id in ('00770077-0077-4077-8077-000000000020',
                 '00770077-0077-4077-8077-000000000021',
                 '00770077-0077-4077-8077-000000000022')) as scenario_memberships,
  (select count(*) from public.season_membership_status_events
    where actor_label = 'PILOT-LAN-77 setup script') as scenario_status_events,
  (select count(*) from public.events
    where name like '%PILOT-LAN-77%') as scenario_events,
  (select count(*) from public.notification_jobs
    where cancelled_reason like 'PILOT-LAN-77%') as scenario_blocking_jobs,
  (select count(*) from public.event_audience_members
    where event_id in ('00770077-0077-4077-8077-000000000050',
                       '00770077-0077-4077-8077-000000000051')) as scenario_audience_rows,
  (select count(*) from public.invitations
    where event_id in ('00770077-0077-4077-8077-000000000050',
                       '00770077-0077-4077-8077-000000000051')) as scenario_invitations,
  (select status::text from public.events
    where id = '00770077-0077-4077-8077-000000000050') as approval_scenario_status,
  (select status::text from public.events
    where id = '00770077-0077-4077-8077-000000000051') as rollback_scenario_status;

commit;
