# W2 — Manage template categories on the event templates page

**Status: specification draft, pending Brian's approval.**

- Purpose/intended outcome: the colour of every event comes from its category, chosen once by the club, so
  the calendar reads the same way everywhere.
- Primary actor: a calendar manager (`event_calendar_management`: President, Vice-President, Secretary,
  General Manager, IT Officer).
- Trigger: the club wants a category to look different, or creates a new template.
- Entry point: Events → Edit templates.
- Route/placement: `/operate/events/templates` — a _Template categories_ section at the top (locked by
  LAN-424); `/operate/events/templates/[templateId]` and `/new` — a Category field where Colour was.
- Controlling source: LAN-424 decision 1 (Brian, 2026-09-25).
- User-visible result: the category's new colour on every event of that category in the calendar and every
  event list; each template shows its category.

## Current `main` grounding

- Locally rendered route or nearest implemented analogue: the templates list (Template, Invites by default,
  Where, Questions; no swatch on the row) and the template form's _Colour_ section with twelve swatch buttons
  (`TEMPLATE_COLOUR_PALETTE`, LAN-276). New templates are silently `practice` (`DEFAULT_TEMPLATE_CLASS`).
- Reused component, language, interaction, and permission patterns: `TableFrame`/`RowCard` list idiom; the
  outlined `Field` (select) from the form; the existing palette and its swatch rendering; standards rule 4 for
  a disabled control.
- Desktop and 375px evidence: `mockups/W2-manage-template-categories.html`, W2-01 to W2-03, photographed on
  both sides at 1280 and 375.
- Reason for any departure from the implemented application: the per-template colour is removed by decision.

## Required actions

1. Change a category's colour from its Colour select (saves on choice, audited — delegated).
2. On a new template, choose one of the seven categories.
3. On an existing template with events, read its category; it cannot change.

## State transitions

- Category colour: palette key → palette key.
- Template category: chosen at creation, no default; fixed once an event exists.

## Handoffs

- W4 and the calendar read the category colour. The events list's _Type_ column and filter are unchanged.

## Dependencies and mission boundaries

- LAN-276's `event_templates.colour_key` is dropped and its values migrated to the category (delegated).
- The calendar legend (`src/app/calendar/type-legend.tsx`) and every event list recolour by category.

## Exceptions and recovery

- Colour already held by another category: proposed refusal naming the other category.
- Template with events: Category disabled with the enabling rule stated.

## Safety, privacy, consent, and authority boundaries

- No new authority: `event_calendar_management` gates the page as today. Category colours are not personal data.

## Acceptance evidence

- W2-01 to W2-03 behaviour walked at 1280 and 375; the calendar shows the category colour after a change.

## Core decisions

| Decision                                                       | Classification              | Governing evidence or recommended default | Status    |
| -------------------------------------------------------------- | --------------------------- | ----------------------------------------- | --------- |
| Seven fixed categories = `event_type`; no create/rename        | locked                      | LAN-424 decision 1                        | recorded  |
| One colour per category, nothing else configurable             | locked                      | LAN-424 decision 1                        | recorded  |
| Templates carry a category, never a swatch; `colour_key` goes  | locked                      | LAN-424 decision 1                        | recorded  |
| "Template categories" section at the top of the templates page | locked                      | LAN-424 decision 1                        | recorded  |
| Section as a table (Category, Colour, Templates); cards at 375 | proposed for owner approval | W2-01                                     | open      |
| Category column on the template list                           | proposed for owner approval | W2-01                                     | open      |
| Two categories may not share a colour                          | locked                      | Lead decision, round 2                    | recorded  |
| Template category fixed once an event exists                   | locked                      | Lead decision, round 2                    | recorded  |
| New template has no default category; the operator must choose | locked                      | Lead decision, round 2; W2-03 redrawn     | recorded  |
| Colour migration, audit of colour changes, calendar wiring     | delegated to Mission Lead   | —                                         | delegated |

## Brian approval

- Exact words: pending
- Date: pending
