-- LAN-457 / LAN-474 — Attendance becomes the roster's eleventh coloured group
-- (Brian, visual review 5 October 2026).
--
-- LAN-457 put an Attendance group on the roster board, right of Availability,
-- but left it on a code colour outside `roster_group_colours`, so Edit
-- categories could not recolour it. Attendance joins the stored groups: the
-- group check constraint gains `attendance` and the group gets its row,
-- seeded at `slate` (Brian's default). The permission line for attendance
-- (`roster_category/attendance`, none or view only) is unchanged.
--
-- The earlier migration's constraint is dropped and re-added, never edited.

begin;

alter table public.roster_group_colours
  drop constraint roster_group_colours_group_known;

alter table public.roster_group_colours
  add constraint roster_group_colours_group_known check (
    group_key in (
      'person', 'onboarding', 'membership', 'availability', 'attendance',
      'coaching', 'offensive', 'defensive', 'special_teams', 'warmup', 'kit'
    )
  );

insert into public.roster_group_colours (group_key, colour_key)
values ('attendance', 'slate')
on conflict (group_key) do nothing;

comment on table public.roster_group_colours is
  'LAN-429 (W2 of LAN-423); Attendance added by LAN-457 (fix round 4). The colour each of the roster board''s eleven groups wears on the board and the record, as a palette key from `TEMPLATE_COLOUR_PALETTE` (`src/lib/services/event-template-input.ts`). Edited by `role_management` holders from the roster''s Edit categories; every save is one `roster.group_colours.changed` audit row.';

commit;
