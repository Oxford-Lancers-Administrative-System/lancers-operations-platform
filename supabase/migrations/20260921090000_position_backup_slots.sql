-- LAN-387, part 1 of 2 — the two backup position slots.
--
-- The roster board's single Offence and Defence position columns become a
-- primary/backup pair (Brian–Stewart call, 2026-09-16; Stewart's Coaching
-- Assignments tab). A backup position is the same kind of fact as a primary
-- one, drawn from the same season vocabulary, so it is a second
-- `position_assignments` slot rather than a second table or a nullable column
-- beside the first. The exclusion constraint that already keeps one current
-- assignment per slot (invariant S1/S4) then keeps one current backup per
-- side for free, and the composite foreign keys that prove invariant S3 apply
-- to a backup exactly as they do to a primary.
--
-- `alter type ... add value` cannot run in the same transaction as a statement
-- that uses the new value (docs/migration-runbook.md), and part 2 both widens
-- `position_assignments_slot_matches_side` to name these slots and writes
-- rows into them. So the two statements are the whole of this file.

alter type public.position_slot add value if not exists 'offence_backup';
alter type public.position_slot add value if not exists 'defence_backup';
