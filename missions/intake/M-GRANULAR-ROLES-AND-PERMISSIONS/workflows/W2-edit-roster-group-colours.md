# W2 — Edit roster group colours

**Status: specification draft (round 3), pending Brian's approval.** Replaces round 1–2's "Manage template
categories on the event templates page", retired: events are per template and the event templates page is
unchanged by this delivery.

- Purpose/intended outcome: the club chooses the colour each roster group wears on the board and the record,
  from the app's palette, without a code change.
- Primary actor: proposed, a holder of `role_management` (President, General Manager, IT Officer) — open
  question W2-01.
- Trigger: the club wants a group to look different, or wants the team colours on the board.
- Entry point: Roster → _Edit categories_ (top right, beside _Add players_).
- Route/placement: `/operate/roster`; a Dialog, _Roster categories_, over the board (W2-02).
- Controlling source: Brian's round-3 amendments (2026-09-25), item 8.
- User-visible result: every band head of that group on the board and every record section of that group in
  the new colour, for every operator, from the next request.

## Current `main` grounding

- Group colours are code: `BAND_COLOURS` in `src/components/section.tsx`, read by
  `src/app/operate/roster/board-columns.ts` (board) and the record's banded Sections. Tones: Person and
  Coaching Oxford Blue `#002147`; Membership Royal Blue `#1D42A6`; Onboarding and Kit Old Gold `#8D7149`;
  Availability `#455A64`; Offensive `#1F5C4A`; Defensive `#5B3A7E`; Special teams `#7A4A18`; Warmup `#1D4A7A`.
  Band head text is always white.
- The palette is `TEMPLATE_COLOUR_PALETTE` in `src/lib/services/event-template-input.ts`: twelve swatches
  (Blue `#1565c0`, Teal, Purple, Red, Orange, Green, Slate, Indigo, Pink, Brown, Cyan, Lime), stored as keys;
  `event_templates.colour_key` is guarded by the check constraint `event_templates_colour_key_known`
  (migration `20260916090000_event_templates.sql`), which restates the key list.
- Reused components: the app's outlined Button; MUI `Dialog`, `TextField` select and `Menu`; the template
  editor's swatch drawing (14px tint square, 2px accent edge).
- Desktop and 375px evidence: `mockups/W2-edit-roster-group-colours.html`, W2-01 and W2-02, photographed on
  both sides at 1280 and 375.

## Required actions

1. Open the roster; press _Edit categories_.
2. For any of the ten groups, choose a colour from the palette; the band preview follows.
3. _Save colours_. The dialog closes; the board redraws.

## State transitions

- A group's colour key: any palette key → any palette key. Duplicates allowed (today Onboarding and Kit share).
- Palette change (round 3): key `blue` becomes _Lancer Blue_ (the team blue); _Lancer Gold_ added; the old
  blue kept as _Oxford Blue_; every other swatch unchanged.

## Handoffs

- W3 draws every band in the stored colour.
- The palette is shared with event templates: renaming key `blue` re-tones every template on it (open question).

## Dependencies and mission boundaries

- A new club-level store for ten group colours (a new table or a settings row) — a data-model addition that
  must map into `docs/architecture/data-model.md`; RLS and narrow grants in its creating migration.
- Adding keys `lancer_gold` and `oxford_blue` needs a forward migration replacing
  `event_templates_colour_key_known`, or the palette keeps a separate list for groups.
- The calendar feed (`src/app/calendar/feed.ics/route.ts`, `src/lib/services/calendar-feed.ts`) carries no
  colour, so it constrains nothing.
- Contrast: band heads print white overline text. White on Lancer Gold `#C09723` is 2.7:1 and on Orange
  `#ef6c00` 3.1:1, both under AA; each swatch needs a text colour (charcoal on those two). `src/theme.test.ts`
  recomputes contrast and would need the new pairs.
- Contact & emergency has no board columns and gets no colour (its record section uses Person's).

## Exceptions and recovery

- Save fails: the dialog stays open with an error Notice; nothing changes.
- A key removed from the palette later: groups on it fall back to the default (delegated).

## Safety, privacy, consent, and authority boundaries

- Colours carry no meaning: a band is a place, not a verdict (the rule recorded in `section.tsx`). The palette
  offers no traffic-light meaning for a group.
- Every save is audited in `audit_events` (one entry, a line per changed group).

## Core decisions

| Decision                                                                             | Classification              | Governing evidence or recommended default | Status    |
| ------------------------------------------------------------------------------------ | --------------------------- | ----------------------------------------- | --------- |
| Roster group colours editable; _Edit categories_ at the top right of the roster      | locked                      | Round 3 brief, item 8                     | recorded  |
| Palette: Lancer Blue (current blue), Lancer Gold added, old blue kept as Oxford Blue | locked                      | Round 3 brief, item 8                     | recorded  |
| Event templates page unchanged; no template categories                               | locked                      | Round 3 brief, item 3                     | recorded  |
| Who may edit group colours: `role_management`                                        | proposed for owner approval | W2-01                                     | open      |
| Lancer Blue hex (`#1D42A6` drawn) and which hex is "Oxford Blue"                     | proposed for owner approval | W2-02                                     | open      |
| Starting colours: nearest swatch to today's tones                                    | proposed for owner approval | W2-02                                     | open      |
| Band text colour per swatch (charcoal on Lancer Gold and Orange)                     | proposed for owner approval | W2-02, contrast finding                   | open      |
| Storage shape, migration of the key check, audit row shape                           | delegated to Mission Lead   |                                           | delegated |

## Brian approval

- Exact words: pending
- Date: pending
