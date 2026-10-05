-- LAN-460 — the Running Backs Coach seat.
--
-- QA (1 October 2026) found the coaching catalogue had no Running Backs Coach.
-- The catalogue is rows (`20260819090100_role_catalogue.sql`), and shared
-- migrations are forward-only, so the seat arrives here rather than by editing
-- that file. It is an assistant position coach exactly like the other seven:
-- season-scoped, in Coaching Staff, any number of holders, no constitutional
-- office.
--
-- Order (decision recorded on LAN-470): directly after Quarterbacks Coach.
--
-- ## Why the positions below Quarterbacks Coach jump to 11
--
-- `roles_group_sort_order_key` forbids two seats in one group sharing a
-- position, and it is checked row by row. Only the order is read
-- (`order by groups.sort_order, roles.sort_order`); nothing reads the number
-- itself or expects the positions to be contiguous. So rather than pushing
-- six seats down by one, which has to pass through a collision, the Running
-- Backs Coach takes 11 and the six seats below it take 12–17, a range the
-- original catalogue file never uses. That keeps a re-run of both files, in the
-- order the migration runner applies them, collision-free and a no-op — which
-- `tests/role-catalogue.test.ts` executes. Coaching Staff now reads 1–4, 11–17.
--
-- Every statement is a keyed update, an upsert or a guarded insert, so a
-- second run changes nothing.
update public.roles
   set sort_order = renumbered.sort_order
  from (
    values
      ('offensive_line_coach',  12),
      ('wide_receivers_coach',  13),
      ('defensive_line_coach',  14),
      ('linebackers_coach',     15),
      ('defensive_backs_coach', 16),
      ('special_teams_coach',   17)
  ) as renumbered (code, sort_order)
 where roles.code = renumbered.code;

insert into public.roles (
  code, name, scope, role_group_id, sort_order,
  is_constitutional_office, is_single_holder_seat
)
select 'running_backs_coach', 'Running Backs Coach', 'season'::public.role_scope,
       role_groups.id, 11, false, false
  from public.role_groups
 where role_groups.code = 'coaching_staff'
on conflict (code) do update
  set name = excluded.name,
      scope = excluded.scope,
      role_group_id = excluded.role_group_id,
      sort_order = excluded.sort_order,
      is_constitutional_office = excluded.is_constitutional_office,
      is_single_holder_seat = excluded.is_single_holder_seat;

-- Access lines, seeded as every other assistant coach is: every line present,
-- every line at `none` (the rule of `20261006090000_granular_access.sql` and
-- the attendance line of `20261007090000_attendance_access_line.sql`). What a
-- coach can do without a grant — take a register, read the attendance views —
-- comes from `FIXED_COACHING_ROLE_CODES` in `src/lib/auth/capabilities.ts`.
insert into public.role_access_grants (role_id, subject_kind, subject_key, template_id, level)
select roles.id, lines.subject_kind, lines.subject_key, null, 'none'
  from public.roles
 cross join (
   values
     ('roster_category', 'person'),
     ('roster_category', 'contact_emergency'),
     ('roster_category', 'onboarding'),
     ('roster_category', 'membership'),
     ('roster_category', 'availability'),
     ('roster_category', 'coaching'),
     ('roster_category', 'offensive'),
     ('roster_category', 'defensive'),
     ('roster_category', 'special_teams'),
     ('roster_category', 'warmup'),
     ('roster_category', 'kit'),
     ('roster_category', 'attendance'),
     ('recruiting_category', 'recruit_person'),
     ('recruiting_category', 'recruit_details'),
     ('recruiting_category', 'recruit_events'),
     ('switch', 'add_to_roster'),
     ('switch', 'add_recruits')
 ) as lines (subject_kind, subject_key)
 where roles.code = 'running_backs_coach'
on conflict on constraint role_access_grants_one_line_per_subject do nothing;

insert into public.role_access_grants (role_id, subject_kind, subject_key, template_id, level)
select roles.id, 'event_template', null, templates.id, 'none'
  from public.roles
 cross join public.event_templates templates
 where roles.code = 'running_backs_coach'
on conflict on constraint role_access_grants_one_line_per_subject do nothing;
