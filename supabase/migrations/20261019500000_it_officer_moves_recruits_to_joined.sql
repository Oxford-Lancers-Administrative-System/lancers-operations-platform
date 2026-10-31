-- LAN-505 follow-up (Brian, 19 October 2026): "IT Officer should always have
-- that sort of access that the GM has. It should be equivalent."
--
-- `20261017090000_move_recruits_to_joined.sql` switched May move recruits to
-- Joined on for President, Vice-President, Secretary and General Manager and
-- left the IT Officer off. The IT Officer is a fixed seat: it holds every line
-- at its maximum and no role-editor write may change it. This switch was the
-- one exception, and it is removed: the IT Officer now holds it at Yes like
-- every other line, so it holds everything the General Manager holds.
--
-- Forward-only: the LAN-505 migration is left as written. Its row exists (that
-- migration inserted one per seat), so this updates it; the insert covers a
-- database where it does not.

insert into public.role_access_grants (role_id, subject_kind, subject_key, template_id, level)
select roles.id, 'switch', 'move_recruits_to_joined', null, 'yes'
  from public.roles
 where roles.code = 'it_officer'
on conflict on constraint role_access_grants_one_line_per_subject
do update set level = excluded.level, updated_at = now();
