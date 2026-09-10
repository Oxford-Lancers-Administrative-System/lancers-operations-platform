-- One human, one audience row, one invitation — per event. LAN-293/LAN-294.
--
-- Brian, 2026-09-10, walking the G7 review environment: "One invitation per
-- person per event." A person who is a player, a coach and a committee member
-- is one person, and the club sends them one message.
--
-- ## The hole this closes
--
-- Both tables already carry a *pair* of partial unique indexes:
--
--   event_audience_members_one_per_player_per_event
--     on (event_id, season_membership_id) where season_membership_id is not null
--   event_audience_members_one_per_person_per_event
--     on (event_id, person_id)            where person_id is not null
--
-- and `*_anchor_matches_capacity` (invariant P8) forces a player row to fill
-- only the first of those columns and every other capacity only the second. So
-- one human admitted twice — once through their season membership as a player,
-- once through the person who holds their committee seat — violates neither
-- index. Between them the two say "one row per invitee *per anchor*", which is
-- a materially weaker sentence than the one they read as.
--
-- It was not hypothetical. Both seeds wrote exactly that pair for anybody who
-- plays and also holds a seat, and on the seeded club 840 person/event
-- combinations carried two audience rows and two invitations each. Brian read
-- the consequence off the screen: Bertram and Caspian counted twice in the
-- confirmed audience and listed twice in the participation table.
--
-- ## Why a denormalised person rather than a trigger
--
-- The fact that has to be unique is *the human*, and for a player row the human
-- is only reachable through `season_memberships`. A check constraint cannot read
-- another table and a unique index has no expression to index, so the obvious
-- reach is a constraint trigger — which ADR 0008 rejected by name ("a rule that
-- is *sometimes* a trigger is harder to reason about than one that is never a
-- trigger"), and ADR 0012 rejected again for this very table.
--
-- ADR 0008 also names what to do instead, and this is that device exactly: the
-- child carries a copy of the parent's discriminator, joined back by a composite
-- foreign key so the copy cannot lie. `season_memberships` already publishes
-- `unique (id, person_id)` for it. `invitee_person_id` is therefore not a new
-- concept and not a second anchor — invariant P8 is untouched, `person_id` is
-- still null on a player row and `participant_id` still generates from the
-- anchor. It is the human the row is about, stated where an index can see it:
--
--   * a player row's copy must agree with the membership it names (the
--     composite foreign key; MATCH SIMPLE skips it for a non-player row, whose
--     `season_membership_id` is null);
--   * every other row's copy must equal its own `person_id` (the check);
--   * and one human therefore holds at most one row per event, by a plain,
--     total unique index rather than by a rule somebody has to remember.
--
-- Invitations need nothing at all, and that is worth saying rather than leaving
-- to be re-derived. Every invitation names the audience member it was resolved
-- from, and `invitations_belong_to_the_resolved_audience` binds it to that row's
-- event, capacity and participant — so an invitation cannot describe a human the
-- audience does not already hold exactly one row for. One row per human per
-- event therefore *is* one invitation per human per event, which is Brian's
-- sentence, reached without a second index that could only ever agree with the
-- two invitations already carries.
--
-- ## Applying this to a database that already holds duplicates
--
-- The unique index is created last and will refuse to build if any event still
-- holds two rows for one human. That is deliberate: silently keeping them would
-- leave the club sending two messages to the same person with nothing to say so.
-- Both seeds were fixed in the same change, so `db:reset` + `db:seed` produces
-- none. A database seeded before this migration must be reset, and any hosted
-- environment must be checked for the pair before the migration is applied.

alter table public.event_audience_members add column invitee_person_id uuid;

comment on column public.event_audience_members.invitee_person_id is
  'The human this row is about, denormalised so one-per-event is indexable (LAN-294). Not an anchor: invariant P8 still puts a player on their membership. Kept true by a composite foreign key to season_memberships (id, person_id) for a player, and by event_audience_members_invitee_is_the_anchor_person for everybody else.';

update public.event_audience_members a
   set invitee_person_id = coalesce(
         a.person_id,
         (select m.person_id from public.season_memberships m
           where m.id = a.season_membership_id));

alter table public.event_audience_members
  alter column invitee_person_id set not null;

alter table public.event_audience_members
  add constraint event_audience_members_invitee_is_the_anchor_person check (
    person_id is null or invitee_person_id = person_id);

alter table public.event_audience_members
  add constraint event_audience_members_invitee_holds_the_membership
    foreign key (season_membership_id, invitee_person_id)
    references public.season_memberships (id, person_id) on update cascade;

-- Invariant P9. One human, one row in an event's audience.
create unique index event_audience_members_one_per_human_per_event
  on public.event_audience_members (event_id, invitee_person_id);
