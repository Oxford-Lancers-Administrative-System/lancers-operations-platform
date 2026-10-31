-- LAN-520 (Brian, 31 October 2026) — May send Messages becomes a role
-- permission.
--
-- Messages (`/operate/messages`, LAN-514) was hard-wired to the
-- `delivery_administration` capability: President, Vice-President, Secretary,
-- General Manager and IT Officer. No role-editor setting could give it to any
-- other seat, and Brian wants other seats to be able to message people.
--
-- It becomes a fourth switch, `send_messages`, none | yes, shown on the seat
-- page in its own Messaging group after Event templates. Messages, its pages,
-- the attachment upload and the send action check it instead of the
-- capability. The messaging settings (recruitment cycle, onboarding chase,
-- Messaging safety) and the Messaging queue stay on `delivery_administration`.
--
-- Nobody gains or loses anything: the switch is on for exactly the five seats
-- `delivery_administration` names and off for every other seat. The President,
-- General Manager and IT Officer stay fixed by the existing service rule.

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
        subject_key in ('add_to_roster', 'add_recruits', 'move_recruits_to_joined', 'send_messages')
        and level in ('none', 'yes')
      else false
    end
  );

insert into public.role_access_grants (role_id, subject_kind, subject_key, template_id, level)
select roles.id,
       'switch',
       'send_messages',
       null,
       case
         when roles.code in (
           'president', 'vice_president', 'secretary', 'general_manager', 'it_officer'
         )
           then 'yes'
         else 'none'
       end
  from public.roles
on conflict on constraint role_access_grants_one_line_per_subject do nothing;

comment on table public.role_access_grants is
  'LAN-429 (LAN-423). What each seat may see and change, one row per (seat, line): twelve roster categories and three recruiting categories (none/view/edit; Attendance and Event details none/view), one line per event template (none/view/manage) and four switches (none/yes: add to the roster, add recruits, — LAN-505 — move recruits to Joined and — LAN-520 — send Messages). An operator''s effective access is the union-maximum over their current seats, read once per request (`resolveOperatorAccess`). Edited on the seat page by `role_management` holders through `src/lib/services/access-grants.ts`, which refuses any change to the President, General Manager and IT Officer (the floor is a service rule, not a row). A template''s lines cascade with it. Every change is audited in `audit_events`.';
