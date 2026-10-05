-- LAN-474 — regular Blue restored beside Oxford Blue (Stewart, QA 2 October 2026).
--
-- LAN-429 re-toned palette key `blue` to Oxford Blue (`#002147`) and so took
-- the regular blue out of the palette. Stewart wants both. Oxford Blue keeps
-- key `blue`, so no stored colour moves; regular Blue comes back under a new
-- key, `royal_blue`, with the values `blue` carried before LAN-429. The hex
-- and label live in `src/lib/services/event-template-input.ts`; these two
-- check constraints restate its list of keys, and both gain the fourteenth.
--
-- Nothing is backfilled: no row holds the new key until an operator chooses it.

begin;

alter table public.event_templates
  drop constraint event_templates_colour_key_known;

alter table public.event_templates
  add constraint event_templates_colour_key_known check (
    colour_key in (
      'blue', 'royal_blue', 'teal', 'purple', 'red', 'orange', 'green',
      'slate', 'indigo', 'pink', 'brown', 'cyan', 'lime', 'lancer_gold'
    )
  );

alter table public.roster_group_colours
  drop constraint roster_group_colours_colour_key_known;

alter table public.roster_group_colours
  add constraint roster_group_colours_colour_key_known check (
    colour_key in (
      'blue', 'royal_blue', 'teal', 'purple', 'red', 'orange', 'green',
      'slate', 'indigo', 'pink', 'brown', 'cyan', 'lime', 'lancer_gold'
    )
  );

commit;
