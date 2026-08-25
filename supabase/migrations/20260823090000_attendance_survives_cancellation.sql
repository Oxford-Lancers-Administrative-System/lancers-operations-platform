-- LAN-156 — attendance records survive a cancellation.
--
-- Work package WP-amend-cancel of mission M-EVENTS-CALENDAR-TARGET-STATE, and
-- the mission's SECOND migration. `20260822120000_events_target_state.sql` is
-- merged and forward-only, so this corrects it rather than editing it.
--
-- The defect. `attendance_records` carries a denormalised copy of the event's
-- status, bound by a composite foreign key declared `on update cascade`, and
-- `attendance_records_require_an_approved_event` said that copy must read
-- exactly `approved`. Cancelling an event therefore cascaded `cancelled` onto
-- every attendance row and the row's own check refused it — so an approved
-- event whose register had been opened could not be cancelled at all.
--
-- W6 says the opposite in words: attendance records, if any, are untouched by a
-- cancellation. D57 keeps a cancelled event visible with its history and its
-- responses. D31 permits cancelling a past event as an administrative
-- correction. D71's six-hour buffer opens the register before the event starts,
-- which makes "the register is already open when the pitch floods" the ordinary
-- case rather than an edge one.
--
-- The fix is the one `public.invitations` already carries for invariant P1:
-- admit `cancelled` as well as `approved`, so the cascade rewrites the child's
-- copy into a value the child still accepts and the participation record
-- survives the event being called off. Mission question Q-8, decided.
--
-- What moves, and what does not. The half of invariant P5 that says attendance
-- is only ever *created* against an approved event is no longer held twice: the
-- database now admits a `cancelled` row because the cascade must be able to
-- write one, and the service layer holds the creation rule alone --
-- `closedReasonFor` in `src/lib/services/attendance.ts` returns `not_approved`
-- for any event that is not approved, which is what every write path asks
-- before it writes. `draft` is still refused structurally, here, by this check:
-- a draft was never held, nothing cascades a draft onto an attendance row, and
-- no cascade needs the database to admit one.
--
-- Data: none. Widening a check admits rows that were previously refused and
-- rewrites nothing, so there is no existing row to validate or repair and no
-- backfill step. Every row that satisfied `event_status = 'approved'` satisfies
-- `event_status in ('approved', 'cancelled')`.

alter table public.attendance_records
  drop constraint attendance_records_require_an_approved_event;

alter table public.attendance_records
  -- Invariant P5's structural half, widened to the same shape as
  -- `invitations_require_an_approved_event`. Attendance belongs to an event the
  -- club approved; it survives that event being called off (W6, D57); and it
  -- can never belong to a draft.
  add constraint attendance_records_require_an_approved_event check (
    event_status in ('approved', 'cancelled'));

comment on table public.attendance_records is
  'Invariant P6: attendance may exist without an invitation or an RSVP -- walk-ups happen. There is deliberately no foreign key to either, and an RSVP never creates an attendance record. The event must have been approved, and a draft is refused here structurally; a record survives the event being cancelled (W6, D57), which is why the check admits `cancelled` as well. Whether the register may be opened -- the approval and the clock together -- is the service rule in `attendance.ts`, because a check constraint cannot read the clock.';
