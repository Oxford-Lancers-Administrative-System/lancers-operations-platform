-- LAN-505 (Brian, 16 October 2026) — May move recruits to Joined becomes a
-- role permission.
--
-- Moving a recruit to Joined was hard-wired to four offices: President,
-- Vice-President, Secretary and General Manager (LAN-204's `W14`, the
-- `FLIP_ROLE_CODES` constant). No role-editor setting could grant it, so the
-- Kit Manager could not move walk-in recruits to Joined at kit handout even
-- after being given Recruit details at edit.
--
-- It becomes a third switch, `move_recruits_to_joined`, none | yes, shown on
-- the seat page with the Recruiting lines. The server action checks it instead
-- of the office list.
--
-- Nobody loses anything: the switch is on for exactly the four offices the
-- fixed rule named. Every other seat starts off, the IT Officer included (it
-- never could, and the decision names the four).

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
        subject_key in ('add_to_roster', 'add_recruits', 'move_recruits_to_joined')
        and level in ('none', 'yes')
      else false
    end
  );

insert into public.role_access_grants (role_id, subject_kind, subject_key, template_id, level)
select roles.id,
       'switch',
       'move_recruits_to_joined',
       null,
       case
         when roles.code in ('president', 'vice_president', 'secretary', 'general_manager')
           then 'yes'
         else 'none'
       end
  from public.roles
on conflict on constraint role_access_grants_one_line_per_subject do nothing;

comment on table public.role_access_grants is
  'LAN-429 (LAN-423). What each seat may see and change, one row per (seat, line): twelve roster categories and three recruiting categories (none/view/edit; Attendance and Event details none/view), one line per event template (none/view/manage) and three switches (none/yes: add to the roster, add recruits, and — LAN-505 — move recruits to Joined). An operator''s effective access is the union-maximum over their current seats, read once per request (`resolveOperatorAccess`). Edited on the seat page by `role_management` holders through `src/lib/services/access-grants.ts`, which refuses any change to the President, General Manager and IT Officer (the floor is a service rule, not a row). A template''s lines cascade with it. Every change is audited in `audit_events`.';
