-- LAN-413 — BUCS Play and Hudl are trust-class items on every season, and the
-- database is what keeps them that way.
--
-- Production, 2026-09-22: Joey opened his onboarding link at step 4, pressed
-- the confirm button and got the generic server error page. The eleven 2026-27
-- `onboarding_item_types` had been inserted by hand on 2026-09-17 (LAN-396)
-- without `verification_class`, so `bucs_play` and `hudl_access` took the
-- column's `direct` default. `claimOnboardingItem` refuses a claim on a
-- non-trust item (`onboarding_item_claim_requires_trust_class`), the refusal
-- reached the step as a 500, and Brian repaired the two rows by hand.
--
-- `verification_class` is a property of the item type, never a season setting
-- (the type's own comment, R2-V / REQ-item-states), and W4's locked decision
-- names exactly these two codes as the trust pair. So the correct answer is
-- not a better default: it is that these two codes cannot hold anything else.
--
-- Two statements, in this order, because the constraint would refuse the
-- existing rows otherwise.
--
--   1. Correct every season's rows, past and open alike. A season whose rows
--      are already `trust` is untouched.
--
--   2. Refuse `direct` for those codes from here on, so no hand insert, no
--      baseline script and no future seed can reintroduce the defect. Every
--      other code keeps the column's full freedom and its `direct` default.
--
-- The constraint is deliberately narrow: it names the trust pair and says
-- nothing about the other nine codes. The inventory is frozen
-- (`REQ-checklist-fixed`) but this migration is not the place that freezes it —
-- `src/lib/services/onboarding-item-types.json` is, and
-- `tests/onboarding-item-inventory.test.ts` is what holds the three readers of
-- that list together.

update public.onboarding_item_types
   set verification_class = 'trust'
 where code in ('bucs_play', 'hudl_access')
   and verification_class <> 'trust';

alter table public.onboarding_item_types
  add constraint onboarding_item_types_trust_codes_are_trust
  check (
    code not in ('bucs_play', 'hudl_access')
    or verification_class = 'trust'
  );

comment on constraint onboarding_item_types_trust_codes_are_trust
  on public.onboarding_item_types is
  'LAN-413. BUCS Play and Hudl complete on the player''s word and must stay trust-class on every season: a `direct` row makes the player''s own confirm button refuse, and the refusal is not something a player can act on. W4''s locked decision names these two codes; every other code is unconstrained here.';
