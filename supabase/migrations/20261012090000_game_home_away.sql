-- LAN-475 — Home or Away on the Game template (Brian and Stewart, 2 October 2026).
--
-- Stewart wants a game's calendar card to read
--
--   HOME
--   Oxford Lancers vs Oxford Brookes University
--
-- with the first line separate from the event's ordinary name. The decision is
-- a binary Home/Away value on the event, not a free-text heading, and it is
-- scoped to **the current seeded Game template only**: the template whose fixed
-- identifier `20260916090000_event_templates.sql` gave it,
-- `67fbd6c7-1c6c-55d5-ab83-f85816c4c2ae`. A template an operator creates later
-- is not included, even if it were ever given the `game` class, so the scope is
-- the template's identity rather than the behavioural class.
--
-- Nullable, and nothing is backfilled. A draft may be saved without it; the
-- approval service refuses a Game-template event until it is set (the gate is
-- in `missingForApproval`, not here, because approval is a service act and the
-- schema already lets an approved event exist without it — the local seed's
-- approved games and anything approved before today). Stewart confirmed no game
-- has been approved in production, so there is no approved history to fill,
-- and existing drafts are left unset rather than guessed from their names.
--
-- The name stays the event's name. No opponent, university, `vs` or `@` field.

begin;

create type public.home_away as enum ('home', 'away');

comment on type public.home_away is
  'LAN-475. Whether a game is played at home or away; printed on the operator calendar as its own first line, above the event name.';

alter table public.events
  add column home_away public.home_away;

-- The value belongs to the current Game template and to no other. The service
-- writes null whenever a draft moves off that template; this makes the rule
-- provable rather than conventional, the way `events_joining_url_is_for_online_events`
-- does for the joining link.
alter table public.events
  add constraint events_home_away_is_game_template_only check (
    home_away is null or template_id = '67fbd6c7-1c6c-55d5-ab83-f85816c4c2ae'::uuid);

comment on column public.events.home_away is
  'LAN-475. Home or Away, for an event of the current seeded Game template only (events_home_away_is_game_template_only). Null on every other event and on a Game draft nobody has answered yet; approval of a Game-template event is refused while it is null. Shown only as the first line of an operator calendar tile; lists, the event page, the public calendar, the feed, RSVP pages, messages and reports keep the ordinary name.';

commit;
