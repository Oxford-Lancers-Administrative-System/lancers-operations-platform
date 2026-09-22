-- LAN-409 — braces become Braces L and Braces R, each holding any number of
-- the brace values.
--
-- Stewart, "Ops Improvements", 2026-09-21: "The braces columns should be able
-- to accept more than one choice (ankle plus knee plus shoulder if needed).
-- Perhaps we can even make it Braces L and Braces R which could add to
-- 'availability' type data." Brian's decision the same day: two items,
-- `braces_left` and `braces_right`, each a multi-select over the same twelve
-- brace values, replacing the two unsided single-pick slots.
--
-- The list itself does not change. Clint's values stand as written.
--
-- Two changes, and no data is moved.
--
--   1. The enum values are *renamed* rather than added beside the old pair.
--      `braces_1` becomes `braces_left` and `braces_2` becomes `braces_right`,
--      which is the only reading of two unsided slots that loses nothing: a
--      player with two braces recorded keeps both, in the order they were
--      recorded in, and nothing has to guess which side either was on.
--
--      A rename is also the only shape available in one transaction. Adding a
--      value to an enum and then using that value are not allowed in the same
--      transaction (PostgreSQL refuses "unsafe use of new value of enum
--      type"), so an add-and-copy would have to be two migrations. A rename
--      carries every existing `kit_issue_records` row and every
--      `kit_item_options` row with it, at no cost and with nothing to
--      back-fill: `braces_left` keeps exactly the list `braces_1` had, and
--      `braces_right` exactly the list `braces_2` had, which are the same
--      twelve values in the same order.
--
--      `braces_1` and `braces_2` therefore do not survive as history. Nothing
--      is lost by that: no row, no option and no audit context named them as a
--      side, and the issue leaves keeping them optional.
--
--   2. The one-value-per-item rule narrows to the items that still mean it.
--      `kit_issue_records_one_per_item` is replaced by a partial unique index
--      over every item except the two brace items, plus a unique index on
--      (membership, item, value) so one brace value cannot be recorded twice
--      on the same side. The composite foreign key on (item, value) is
--      untouched: a value is still proved against that item's own list.
--
-- Kit Distributed is unaffected — braces were never in its rule, and
-- `refresh_kit_distributed` names the five items it reads explicitly.

alter type public.kit_item rename value 'braces_1' to 'braces_left';
alter type public.kit_item rename value 'braces_2' to 'braces_right';

alter table public.kit_issue_records
  drop constraint kit_issue_records_one_per_item;

-- Every other item is still blank or exactly one value.
create unique index kit_issue_records_one_per_single_item
  on public.kit_issue_records (season_membership_id, item)
  where item <> 'braces_left'::public.kit_item
    and item <> 'braces_right'::public.kit_item;

-- A set, not a bag: the same brace value is recorded at most once a side.
create unique index kit_issue_records_one_per_item_value
  on public.kit_issue_records (season_membership_id, item, value);

comment on table public.kit_issue_records is
  'Which kit a player was issued this season — one row per filled item (LAN-375). Blank is the absence of a row. Braces L and Braces R hold a set, so they take several rows for one item (LAN-409); every other item is one row at most. Not an inventory: nothing here counts stock.';
