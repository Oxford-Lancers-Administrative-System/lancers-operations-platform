-- LAN-423 round 6 (Brian's visual review, 2026-09-26) — Attendance becomes a
-- roster line.
--
-- The player record's Attendance section was the one section outside the
-- access list: always open to anyone who could open the record. Brian: "attendance
-- should be another thing that we give where they can see an individual
-- player's attendance record in the same view, or not view."
--
-- One new roster category, `attendance`, at `none | view` only (no `edit`:
-- nothing on the record writes attendance). It governs the player record's
-- Attendance section and nothing else; recording attendance on an event keeps
-- its own capabilities (`attendance_recording`, `attendance_recorder`).
--
-- The seed follows the rule of `20261006090000_granular_access.sql`: the five
-- seats Brian named (President, General Manager, IT Officer, Vice-President,
-- Secretary) at the line's maximum, `view`; every other seat at `none`.

alter table public.role_access_grants
  drop constraint role_access_grants_vocabulary;

alter table public.role_access_grants
  add constraint role_access_grants_vocabulary check (
    case subject_kind
      when 'roster_category' then
        (
          subject_key in (
            'person', 'contact_emergency', 'onboarding', 'membership', 'availability',
            'coaching', 'offensive', 'defensive', 'special_teams', 'warmup', 'kit'
          )
          and level in ('none', 'view', 'edit')
        )
        or (subject_key = 'attendance' and level in ('none', 'view'))
      when 'recruiting_category' then
        (subject_key in ('recruit_person', 'recruit_details') and level in ('none', 'view', 'edit'))
        or (subject_key = 'recruit_events' and level in ('none', 'view'))
      when 'event_template' then
        level in ('none', 'view', 'manage')
      when 'switch' then
        subject_key in ('add_to_roster', 'add_recruits') and level in ('none', 'yes')
      else false
    end
  );

insert into public.role_access_grants (role_id, subject_kind, subject_key, template_id, level)
select roles.id,
       'roster_category',
       'attendance',
       null,
       case
         when roles.code in ('president', 'general_manager', 'it_officer', 'vice_president', 'secretary')
           then 'view'
         else 'none'
       end
  from public.roles;

comment on table public.role_access_grants is
  'LAN-429 (LAN-423). What each seat may see and change, one row per (seat, line): twelve roster categories and three recruiting categories (none/view/edit; Attendance and Event details none/view), one line per event template (none/view/manage) and two switches (none/yes). An operator''s effective access is the union-maximum over their current seats, read once per request (`resolveOperatorAccess`). Edited on the seat page by `role_management` holders through `src/lib/services/access-grants.ts`, which refuses any change to the President, General Manager and IT Officer (the floor is a service rule, not a row). A template''s lines cascade with it. Every change is audited in `audit_events`.';

comment on column public.role_access_grants.level is
  'none | view | edit for categories (attendance and recruit_events: none | view); none | view | manage for a template; none | yes for a switch. Absence of a row reads as none.';
