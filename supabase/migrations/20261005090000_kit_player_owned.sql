-- LAN-421 — "Player-Owned" becomes a value on each of the five kit items that
-- drive Kit Distributed, and on no other item.
--
-- Stewart, 2026-09-22: "Let's please add an option to all 'required' kit items
-- (items that go toward the kit assigned Y/N binary): 'Player-Owned'. This way,
-- players who own a piece of their own kit can still complete 'kit assigned'
-- binary." Brian the same day: the value only, no notes field.
--
-- The five items are Helmet, Shoulder Pads, Lower Pads, Lowers and Practice
-- Jersey — exactly the list `internal.refresh_kit_distributed` reads
-- (`20260923090000_kit_issue_records.sql`, LAN-375). Team Mouthguard, Loaner
-- Cleats, Team Gloves, Socks and the two brace items are outside that rule and
-- deliberately do not get the value: a player owning their own gloves has never
-- been able to block Kit Distributed, so there is nothing for the value to fix
-- there, and offering it would only invite a reading of the picker that the
-- flag does not honour.
--
-- Nothing about the derivation changes. Kit Distributed already reads complete
-- when all five items carry *any* value; Player-Owned is a value like
-- "Speedflex M" is, so the existing trigger counts it with no rule change. That
-- is the whole point of doing this as reference data rather than as a second
-- kind of completeness: the one place that decides what "issued" means stays
-- the one place, and a player who owns their own helmet stops having to be
-- recorded against a size the club never handed them.
--
-- Data only. No table, column, type, constraint, policy or grant is touched, so
-- `src/lib/supabase/database.types.ts` is unchanged by this migration.
--
-- The sort order is computed from each item's own list rather than written out,
-- so the value lands last in the picker whatever that list has grown to by the
-- time this runs. `kit_item_options` is read in `sort_order` by the board, the
-- player record and the CSV import alike, so one row per item is all it takes
-- for the value to appear in all three, last, after the sizes.

insert into public.kit_item_options (item, value, sort_order)
select item, 'Player-Owned', max(sort_order) + 1
  from public.kit_item_options
 where item in (
   'helmet'::public.kit_item,
   'shoulder_pads'::public.kit_item,
   'lower_pads'::public.kit_item,
   'lowers'::public.kit_item,
   'practice_jersey'::public.kit_item
 )
 group by item;

comment on table public.kit_item_options is
  'What each issued-kit item allows — Clint''s kit sheet, LAN-375, values and spellings verbatim. Player-Owned (LAN-421) is the one value the club did not write on that sheet: it sits last on each of the five items Kit Distributed reads, so a player who owns their own kit can complete the flag. Reference data: a new size is a migration.';
