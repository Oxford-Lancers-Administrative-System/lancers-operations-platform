-- LAN-79 the no-login RSVP page — SETUP.
--
-- Creates the invitations, events and RSVP links that make `/rsvp/[token]`
-- testable by hand against the deployed application, and creates nothing else.
--
-- Run by a human. Never by a migration, a seed, CI, a deploy or the app.
--
-- ---------------------------------------------------------------------------
-- BEFORE YOU RUN THIS: five token hashes have to be filled in
-- ---------------------------------------------------------------------------
-- An RSVP link is a 256-bit secret, and the database stores only its SHA-256
-- digest. Nothing can recover a link from a digest — that is the whole design
-- of LAN-78 and it is not being worked around here. So this file cannot ship
-- with usable links in it, and it does not try to: it ships with five
-- placeholders, and you generate the secrets yourself.
--
-- Run this once, in your own terminal, and keep the output:
--
--   node -e "const c=require('crypto');for(let i=1;i<=5;i++){const t=c.randomBytes(32).toString('base64url');console.log(i, t, c.createHash('sha256').update(t).digest('hex'))}"
--
-- That prints five lines of `number token hash`, using exactly the algorithm
-- `src/lib/services/rsvp-tokens.ts` uses. Then replace each `__TOKEN_HASH_n__`
-- with the matching hash. They are all in ONE block, immediately below `begin;`,
-- and each appears exactly once — so there is no second copy to miss. The
-- tokens themselves never come near this file, this repository, Linear, or a
-- log: they go straight into the URLs you visit, and you throw them away
-- afterwards.
--
-- If you paste a hash into the wrong slot the scenario still works; the links
-- simply belong to different invitees than the table in README.md says.
--
-- A placeholder you forget cannot reach the database: `token_hash` carries a
-- check constraint accepting 64 lowercase hex characters and nothing else, and
-- the preflight below refuses the whole script first with a clearer message.
--
-- WHAT IT ADDS
--   * Five clearly synthetic people and five `active` memberships in the open
--     season. No contact points: this scenario never sends anything, and a
--     phone number it does not need is a phone number that could be dialled.
--   * Three events, all carrying the sentinel in `name`:
--       - "PILOT-LAN-79 Response scenario"  — approved, fourteen days ahead.
--       - "PILOT-LAN-79 Started scenario"   — approved, started two hours ago.
--       - "PILOT-LAN-79 Cancelled scenario" — cancelled, twenty-one days ahead.
--   * Five invitations, one per person, and one RSVP access token for each:
--       1. Valid          — no answer yet. The ordinary case.
--       2. Late           — its response deadline passed two days ago and the
--                           invitation is `expired`. A late answer is still an
--                           answer, and this proves it.
--       3. Revoked        — its link was withdrawn.
--       4. Started        — its event began two hours ago, so no write is
--                           accepted through a link that still resolves.
--       5. Cancelled      — a valid link to a cancelled event.
--     Invitations 1, 2 and 3 share ONE event, which is what makes the
--     no-peer-visibility check meaningful: three invitees, three different
--     states, and each link must show its own holder and nobody else.
--
-- WHAT IT DELIBERATELY DOES NOT ADD
--   * No season. The open season belongs to the permanent pilot foundation and
--     this script ASSERTS it rather than creating one — the service layer
--     refuses when two seasons are open at once.
--   * No RSVP response. Every answer in this scenario is one you give through
--     the page, which is the thing under test. Inserting answers here would
--     test this script instead of the application.
--   * No notification job. Reminder cancellation is LAN-78's surface; a job
--     created here would be a job something might try to deliver.
--   * No auth user, operator account, role assignment or access grant. The RSVP
--     page needs none — it is the one unauthenticated surface in the slice.
--   * No audit row. The application writes its own when you answer.
--
-- WHAT IT CAN CAUSE TO BE SENT
--   Nothing, ever. This scenario creates no notification job and no delivery
--   work of any kind, and the people it creates have no contact point to send
--   to. The links reach you because you generated them, not because anything
--   was delivered.
--
-- OWNERSHIP MARKER — both halves, on every row this script writes:
--   * a deterministic primary key from the block 00790079-0079-4079-8079-…
--   * the sentinel string PILOT-LAN-79 in a text column — `known_as` on a
--     person, `name` on an event.
--   `season_memberships`, `event_audience_members`, `invitations` and
--   `rsvp_access_tokens` are the exceptions, for the reason LAN-78 recorded:
--   none has a free text column that is not load-bearing. Each carries the
--   deterministic id AND hangs off this scenario's own people or events, which
--   is a chain no unrelated row satisfies. `rsvp_access_tokens.revoked_reason`
--   does carry the sentinel on the one revoked row, because that column is free
--   text and the row is the one a reviewer is most likely to look for.
--
--   Rows the APPLICATION creates while the scenario is in use — the responses
--   you give, and the audit rows they write — have no identifier any script can
--   know, and cleanup removes them by the sentinel-qualified shape recorded in
--   docs/adr/0019-application-created-pilot-rows.md.
--
-- Safe to run twice: every insert is `on conflict (id) do nothing`. There is no
-- `do update` anywhere in this file, so a row this script did not create is
-- never silently rewritten. Running it again does NOT mint new links — the
-- tokens are keyed by id, so the hashes you already installed keep working.
--
-- Paired with cleanup.sql in this directory. Read README.md there first.

begin;

-- ---------------------------------------------------------------------------
-- THE FIVE TOKEN HASHES — the only thing in this file you edit
-- ---------------------------------------------------------------------------
-- Each placeholder appears exactly once, here and nowhere else, so a
-- find-and-replace cannot half-finish. The preflight below reads this table and
-- so does the token insert at the bottom.
--
-- `on commit drop` means it does not outlive the transaction: nothing is left
-- behind holding a digest, whether the script commits or is rolled back.
-- Dropped first so that running the script twice in ONE session is safe.
-- `on commit drop` handles the ordinary case, where each run is its own
-- transaction; this handles the case where it is not.
drop table if exists pg_temp.pilot_lan79_links;

create temporary table pilot_lan79_links (
  slot integer primary key,
  token_hash text not null
) on commit drop;

insert into pilot_lan79_links (slot, token_hash) values
  (1, '__TOKEN_HASH_1__'),
  (2, '__TOKEN_HASH_2__'),
  (3, '__TOKEN_HASH_3__'),
  (4, '__TOKEN_HASH_4__'),
  (5, '__TOKEN_HASH_5__');

-- ---------------------------------------------------------------------------
-- Preflight, part 1 of 2: make the target reviewable BEFORE anything is written
-- ---------------------------------------------------------------------------
-- Read this result set before you read anything else. If the database or the
-- user is not what you intended, roll back — you are one `commit` from writing
-- to it.
select
  'LAN-79 pilot setup — target' as check,
  current_database() as database,
  current_user as connected_as,
  now() as at,
  (select count(*) from public.people) as people_rows_before,
  (select count(*) from public.events) as event_rows_before,
  (select count(*) from public.invitations) as invitation_rows_before,
  (select count(*) from public.rsvp_access_tokens) as token_rows_before,
  (select count(*) from public.rsvp_responses) as response_rows_before,
  (
    select count(*) from public.seasons where status in ('open', 'active')
  ) as open_seasons,
  (
    select string_agg(label, ', ') from public.seasons where status in ('open', 'active')
  ) as open_season_label,
  (
    select count(*) from public.events where name like '%PILOT-LAN-79%'
  ) as scenario_events_already_present;

-- ---------------------------------------------------------------------------
-- Preflight, part 2 of 2: prerequisites, every one of which aborts
-- ---------------------------------------------------------------------------
do $preflight$
declare
  -- The RSVP delivery relations, which are the last migration this scenario
  -- needs. LAN-79 itself adds none.
  required_migration constant text := '20260813120000';
  open_seasons integer;
begin
  -- The hashes pasted in at the top, checked before anything is written. The
  -- column's own constraint would refuse a leftover placeholder too, but it
  -- would do it with a constraint name; this says what to do about it.
  if exists (select 1 from pilot_lan79_links where token_hash !~ '^[0-9a-f]{64}$') then
    raise exception
      'LAN-79 pilot setup: at least one token hash is still a placeholder, or is not a 64-character lowercase hex SHA-256 digest. Generate the five tokens with the command in the header of this file and paste their hashes in before running it.';
  end if;

  if (select count(distinct token_hash) from pilot_lan79_links) <> 5 then
    raise exception
      'LAN-79 pilot setup: two of the five token hashes are identical. Each invitation needs its own link; generate five and paste each one once.';
  end if;

  if not exists (
    select 1 from supabase_migrations.schema_migrations where version = required_migration
  ) then
    raise exception
      'LAN-79 pilot setup: migration % has not been applied to this database. The RSVP token table does not exist yet, so this scenario cannot be created.',
      required_migration;
  end if;

  if to_regclass('public.rsvp_access_tokens') is null then
    raise exception
      'LAN-79 pilot setup: public.rsvp_access_tokens is missing. Apply the delivery migration before running this scenario.';
  end if;

  select count(*) into open_seasons
    from public.seasons where status in ('open', 'active');

  if open_seasons = 0 then
    raise exception
      'LAN-79 pilot setup: no open season exists. The permanent pilot foundation (LAN-93) provides it; this scenario will not create one.';
  end if;

  if open_seasons > 1 then
    raise exception
      'LAN-79 pilot setup: % seasons are open at once. The service layer refuses that, so a scenario built against it would not be testable.',
      open_seasons;
  end if;
end;
$preflight$;

-- ---------------------------------------------------------------------------
-- The people
-- ---------------------------------------------------------------------------
-- `known_as` carries the sentinel AND is what the RSVP page displays, because
-- the page prefers it over `given_name`. So the sentinel is inside the name
-- Brian will actually see on the screen, rather than hidden behind it.
insert into public.people (id, given_name, family_name, known_as)
values
  ('00790079-0079-4079-8079-000000000001', 'Rsvp', 'Valid', 'PILOT-LAN-79 Valid'),
  ('00790079-0079-4079-8079-000000000002', 'Rsvp', 'Late', 'PILOT-LAN-79 Late'),
  ('00790079-0079-4079-8079-000000000003', 'Rsvp', 'Revoked', 'PILOT-LAN-79 Revoked'),
  ('00790079-0079-4079-8079-000000000004', 'Rsvp', 'Started', 'PILOT-LAN-79 Started'),
  ('00790079-0079-4079-8079-000000000005', 'Rsvp', 'Cancelled', 'PILOT-LAN-79 Cancelled')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The memberships
-- ---------------------------------------------------------------------------
insert into public.season_memberships
  (id, person_id, season_id, status, entry, confirmed_on, activated_on)
select
  member.id::uuid,
  member.person_id::uuid,
  (select id from public.seasons where status in ('open', 'active')),
  'active',
  'returning',
  current_date,
  current_date
from (values
  ('00790079-0079-4079-8079-000000000011', '00790079-0079-4079-8079-000000000001'),
  ('00790079-0079-4079-8079-000000000012', '00790079-0079-4079-8079-000000000002'),
  ('00790079-0079-4079-8079-000000000013', '00790079-0079-4079-8079-000000000003'),
  ('00790079-0079-4079-8079-000000000014', '00790079-0079-4079-8079-000000000004'),
  ('00790079-0079-4079-8079-000000000015', '00790079-0079-4079-8079-000000000005')
) as member(id, person_id)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The events
-- ---------------------------------------------------------------------------
-- Three, because the three states a player can meet are properties of the
-- EVENT, not of the link: an ordinary upcoming event, one that has already
-- begun, and one that was called off.
insert into public.events
  (id, season_id, name, event_type, status, scheduled_on, starts_at, ends_at, venue,
   solicits_response, is_mandatory,
   audience_confirmed_at, audience_confirmed_by_person_id,
   approved_at, approved_by_person_id, response_deadline_at, decision_reason)
select
  event.id::uuid,
  (select id from public.seasons where status in ('open', 'active')),
  event.name,
  'practice',
  event.status::public.event_status,
  event.scheduled_on::date,
  event.starts_at::time,
  event.ends_at::time,
  'PILOT-LAN-79 synthetic venue',
  true,
  false,
  now(),
  '00790079-0079-4079-8079-000000000001',
  now(),
  '00790079-0079-4079-8079-000000000001',
  event.deadline_at::timestamptz,
  event.decision_reason
from (values
  -- The ordinary case: fourteen days ahead, deadline twelve days ahead.
  ('00790079-0079-4079-8079-000000000021',
   'PILOT-LAN-79 Response scenario',
   'approved',
   (current_date + 14)::text, '19:00', '21:00',
   (((current_date + 12) + '18:00'::time) at time zone 'Europe/London')::text,
   null),
  -- Began two hours ago. `scheduled_on` and `starts_at` are computed from the
  -- instant rather than assumed, because Britain changes offset twice a season.
  --
  -- `ends_at` is kept on the same day. It is a `time` on `scheduled_on`, and
  -- `events_times_ordered` requires it to be after `starts_at` — so a session
  -- that began at 21:45 produced an end time of 00:15 and the whole script
  -- aborted. That made this scenario uninstallable for roughly two and a half
  -- hours every evening, which is exactly when somebody would be running it
  -- after a practice. Found by CI on 14 August 2026, during LAN-110.
  ('00790079-0079-4079-8079-000000000022',
   'PILOT-LAN-79 Started scenario',
   'approved',
   ((now() - interval '2 hours') at time zone 'Europe/London')::date::text,
   ((now() - interval '2 hours') at time zone 'Europe/London')::time::text,
   (case
      when ((now() - interval '2 hours' + interval '150 minutes')
              at time zone 'Europe/London')::date
           > ((now() - interval '2 hours') at time zone 'Europe/London')::date
        then time '23:59:59'
      else ((now() - interval '2 hours' + interval '150 minutes')
              at time zone 'Europe/London')::time
    end)::text,
   ((now() - interval '4 hours'))::text,
   null),
  -- Called off. Invariant P4: cancellation never deletes an invitation, so the
  -- invitee still holds a link and still deserves to be told.
  ('00790079-0079-4079-8079-000000000023',
   'PILOT-LAN-79 Cancelled scenario',
   'cancelled',
   (current_date + 21)::text, '19:00', '21:00',
   (((current_date + 19) + '18:00'::time) at time zone 'Europe/London')::text,
   'PILOT-LAN-79 synthetic cancellation — the astro was double-booked.')
) as event(id, name, status, scheduled_on, starts_at, ends_at, deadline_at, decision_reason)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The audience
-- ---------------------------------------------------------------------------
insert into public.event_audience_members
  (id, event_id, season_id, capacity, season_membership_id, added_at, added_by_person_id)
select
  member.id::uuid,
  member.event_id::uuid,
  (select id from public.seasons where status in ('open', 'active')),
  'player',
  member.membership_id::uuid,
  now(),
  '00790079-0079-4079-8079-000000000001'
from (values
  ('00790079-0079-4079-8079-000000000031', '00790079-0079-4079-8079-000000000021',
   '00790079-0079-4079-8079-000000000011'),
  ('00790079-0079-4079-8079-000000000032', '00790079-0079-4079-8079-000000000021',
   '00790079-0079-4079-8079-000000000012'),
  ('00790079-0079-4079-8079-000000000033', '00790079-0079-4079-8079-000000000021',
   '00790079-0079-4079-8079-000000000013'),
  ('00790079-0079-4079-8079-000000000034', '00790079-0079-4079-8079-000000000022',
   '00790079-0079-4079-8079-000000000014'),
  ('00790079-0079-4079-8079-000000000035', '00790079-0079-4079-8079-000000000023',
   '00790079-0079-4079-8079-000000000015')
) as member(id, event_id, membership_id)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The invitations
-- ---------------------------------------------------------------------------
-- The `late` invitation is the interesting one: its deadline passed two days
-- ago and its status is already `expired`, which is where the nonresponse queue
-- put it. Answering through the page must move it to `responded` — model §2.4,
-- "late answers are answers".
insert into public.invitations
  (id, event_id, event_status, solicits_response, season_id, capacity,
   season_membership_id, status, issued_at, expires_at, audience_member_id, cancelled_at)
select
  invitation.id::uuid,
  invitation.event_id::uuid,
  invitation.event_status::public.event_status,
  true,
  (select id from public.seasons where status in ('open', 'active')),
  'player',
  invitation.membership_id::uuid,
  invitation.status::public.invitation_status,
  now(),
  invitation.expires_at::timestamptz,
  invitation.audience_member_id::uuid,
  null
from (values
  -- Valid: deadline twelve days ahead, no answer yet.
  ('00790079-0079-4079-8079-000000000041', '00790079-0079-4079-8079-000000000021', 'approved',
   '00790079-0079-4079-8079-000000000011', 'issued',
   (((current_date + 12) + '18:00'::time) at time zone 'Europe/London')::text,
   '00790079-0079-4079-8079-000000000031'),
  -- Late: deadline two days GONE, already swept into the expired stream.
  ('00790079-0079-4079-8079-000000000042', '00790079-0079-4079-8079-000000000021', 'approved',
   '00790079-0079-4079-8079-000000000012', 'expired',
   (((current_date - 2) + '18:00'::time) at time zone 'Europe/London')::text,
   '00790079-0079-4079-8079-000000000032'),
  -- Revoked link, ordinary invitation.
  ('00790079-0079-4079-8079-000000000043', '00790079-0079-4079-8079-000000000021', 'approved',
   '00790079-0079-4079-8079-000000000013', 'issued',
   (((current_date + 12) + '18:00'::time) at time zone 'Europe/London')::text,
   '00790079-0079-4079-8079-000000000033'),
  -- Its event began two hours ago.
  ('00790079-0079-4079-8079-000000000044', '00790079-0079-4079-8079-000000000022', 'approved',
   '00790079-0079-4079-8079-000000000014', 'issued',
   ((now() - interval '4 hours'))::text,
   '00790079-0079-4079-8079-000000000034'),
  -- Its event was cancelled. The invitation survives it.
  ('00790079-0079-4079-8079-000000000045', '00790079-0079-4079-8079-000000000023', 'cancelled',
   '00790079-0079-4079-8079-000000000015', 'issued',
   (((current_date + 19) + '18:00'::time) at time zone 'Europe/London')::text,
   '00790079-0079-4079-8079-000000000035')
) as invitation(id, event_id, event_status, membership_id, status, expires_at, audience_member_id)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The RSVP links
-- ---------------------------------------------------------------------------
-- One per invitation. `expires_at` is the event's start instant, which is what
-- `issueTokenIn` stamps; `issued_at` is placed before it so that the
-- `expires_after_issue` check holds even for the event that has already begun.
--
-- The revoked one is revoked here rather than through the operator screen so
-- that the state is reproducible without a second surface being involved.
insert into public.rsvp_access_tokens
  (id, invitation_id, token_hash, issued_at, expires_at, revoked_at, revoked_reason)
select
  token.id::uuid,
  token.invitation_id::uuid,
  link.token_hash,
  token.issued_at::timestamptz,
  token.expires_at::timestamptz,
  token.revoked_at::timestamptz,
  token.revoked_reason
from (values
  ('00790079-0079-4079-8079-000000000051', '00790079-0079-4079-8079-000000000041', 1,
   (now() - interval '1 day')::text,
   (((current_date + 14) + '19:00'::time) at time zone 'Europe/London')::text,
   null, null),
  ('00790079-0079-4079-8079-000000000052', '00790079-0079-4079-8079-000000000042', 2,
   (now() - interval '1 day')::text,
   (((current_date + 14) + '19:00'::time) at time zone 'Europe/London')::text,
   null, null),
  ('00790079-0079-4079-8079-000000000053', '00790079-0079-4079-8079-000000000043', 3,
   (now() - interval '1 day')::text,
   (((current_date + 14) + '19:00'::time) at time zone 'Europe/London')::text,
   (now() - interval '1 hour')::text,
   'PILOT-LAN-79 synthetic revocation — withdrawn to demonstrate the terminal response.'),
  -- Issued a day before its event began, and expiring at that start instant.
  ('00790079-0079-4079-8079-000000000054', '00790079-0079-4079-8079-000000000044', 4,
   (now() - interval '1 day')::text,
   (now() - interval '2 hours')::text,
   null, null),
  ('00790079-0079-4079-8079-000000000055', '00790079-0079-4079-8079-000000000045', 5,
   (now() - interval '1 day')::text,
   (((current_date + 21) + '19:00'::time) at time zone 'Europe/London')::text,
   null, null)
) as token(id, invitation_id, slot, issued_at, expires_at, revoked_at, revoked_reason)
join pilot_lan79_links link on link.slot = token.slot
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Verification — read this before you commit
-- ---------------------------------------------------------------------------
select
  'LAN-79 pilot setup — created' as check,
  (
    select count(*) from public.people where known_as like 'PILOT-LAN-79%'
  ) as scenario_people,
  (
    select count(*) from public.events where name like 'PILOT-LAN-79%'
  ) as scenario_events,
  (
    select count(*) from public.invitations
     where audience_member_id in (
       select id from public.event_audience_members
        where event_id in (select id from public.events where name like 'PILOT-LAN-79%')
     )
  ) as scenario_invitations,
  (
    select count(*) from public.rsvp_access_tokens
     where invitation_id in (
       select i.id from public.invitations i
        join public.events e on e.id = i.event_id
       where e.name like 'PILOT-LAN-79%'
     )
  ) as scenario_tokens,
  (
    select count(*) from public.rsvp_responses
     where invitation_id in (
       select i.id from public.invitations i
        join public.events e on e.id = i.event_id
       where e.name like 'PILOT-LAN-79%'
     )
  ) as scenario_responses_so_far;

commit;
