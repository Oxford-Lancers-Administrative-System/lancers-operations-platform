# W5 — Work this season's roster

- Purpose/intended outcome: an operator sees the whole squad at once and works
  across it — who is where on the ladder, who is missing something, who plays
  what — instead of opening forty records one at a time.
- Primary actor: a four-role operator — President, Vice-President, Secretary,
  General Manager.
- Trigger: Monday review; the week before a fixture; subs chasing; kit ordering;
  "how many actives do we actually have?"
- Entry point: **Roster** in the operate navigation, where it already is.
- Route/placement: `/operate/roster`. **This surface exists on `main`** and is
  redesigned, not extended — portfolio rule 3, backwards-looking.
- Controlling source: Task 08 §5 (the wide command surface, its column set,
  search, combinable filters, sortable columns, and the condensed mobile view);
  §6 (four-role only; column visibility as a function of category grants); the
  field inventory approved 2026-08-26; LAN-174 (roster is season-scoped without
  needing the season lifecycle).
- User-visible result: the season's squad as a working command surface, carrying
  the approved column set rather than the six columns the slice shipped.

## Required actions

- Show every membership in the season in view, in any status.
- **Carry the approved column set**: player, standing, entry, college,
  positions, jersey, onboarding completeness, contactability, and the
  missing-data flag — replacing today's Member · Status · Entry · Email · Phone
  · Onboarding.
- **Take the raw email and phone off the grid.** Task 08 §5 puts contactability
  indicators there, not values. This is a deliberate narrowing of what a routine
  screen discloses.
- Search by first name, last name and alias.
- **Combinable filters**, applied immediately: standing, entry, onboarding
  completeness, missing data, college, position.
- Sort on every column that can be meaningfully ordered.
- Open a player (`W6`), and add a player through the door that already exists.
- Render column visibility from the viewer's category grants, so widening access
  later drops restricted columns rather than needing a special case.

## State transitions

**None. This workflow is read-only.** Nothing on the grid moves a membership.
Activation, correction and every status change happen on player detail or in
`W2`.

## Handoffs

- To `W6` on opening a player.
- To `W7` from the missing-data flag.
- To `W1` when the person being looked for is not a player.
- To the shipped returner intake for adding a player, which is not rebuilt here.
- To Mission 9 for what positions, jersey and availability mean; this workflow
  places them and Mission 9 gives them semantics.
- To Mission 7 for onboarding behaviour; the grid shows completeness and the
  filter, and owns neither.
- To Mission 11 for anything about the season itself — opening it, closing it,
  rolling it over.

## Dependencies and mission boundaries

- **The status enum changes underneath this surface.** The rebuilt ladder is
  five stored values, and twelve views depend on the column, so the migration
  drops and recreates every one of them. Measured, not estimated, in
  `field-inventory.md`.
- **No season picker.** The roster follows the active season as ambient context,
  which is how it already behaves. Choosing an arbitrary season is Mission 11's.
- Jersey is not one value — two kits, several numbers per player in one kit,
  numbers that are not unique, a predominant designation and a note. Mission 9
  owns the model; this grid shows the predominant number.
- Availability renders only for a viewer holding availability read, which is
  moot while the roster is four-role. The mechanism is built anyway, because it
  is what makes the grant-driven column visibility real.
- Coaching group and responsible coach have no substrate on `main` and do not
  render at this mission's acceptance.
- Consent state and channel presence likewise.

## Exceptions and recovery

- **A filter matches nothing**, and **the season has no memberships at all**.
  Different copy for each, both carrying the smallest authorized recovery, which
  is what the shipped surface already does and what the state contract requires.
- **A player with almost nothing recorded.** They appear with `not recorded` in
  each empty cell and the missing flag set, never as a blank row.
- **A very wide grid on a narrow screen.** The condensed card view Task 08 §5
  describes, and the mobile quick action is **voice call only** — a one-tap
  WhatsApp link would be manual sending outside the pipeline's consent checks,
  which R12 and R15 prohibit.
- **An operator outside the four-role group.** Refused, exposing nothing. A
  coach keeps the narrow LAN-110 attendance tool and reaches nothing here.

## Safety, privacy, consent, and authority boundaries

- Four-role only, for the grid and every column on it.
- **Contact values leave this surface.** Indicators only.
- Date of birth and emergency contact never appear on any list, this one
  included.
- Column visibility is a function of the viewer's category grants; anything not
  granted is absent from the DOM and the payload, not hidden in it.
- The only channel action is a voice call. Nothing here composes, schedules or
  sends a message.
- No destructive action.

## Acceptance evidence

Against seeded synthetic data, an operator can:

1. see the **approved column set**, and confirm raw email and phone are gone;
2. **combine filters** — onboarding incomplete _and_ missing data _and_ active —
   and get a real list;
3. **sort every sortable column**, and keep the sort through a refresh and the
   back button;
4. search by an **alias** and find the player;
5. open a player and come back;
6. see the **condensed view at a measured 375px**, with voice call as the only
   quick action;
7. see both **empty states** and tell them apart;
8. confirm a coach reaches **nothing** here.

## Core decisions

| Decision                                                                      | Classification                | Governing evidence or recommended default                                                                             | Status                |
| ----------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------- |
| The default column set                                                        | `proposed for owner approval` | Task 08 §5 approves a set; the field inventory names which fields reach the grid. The exact order and width are drawn | Confirm at the mockup |
| Raw email and phone come off the grid, replaced by indicators                 | `locked`                      | Task 08 §5                                                                                                            | Settled               |
| Filters combine and apply immediately                                         | `locked`                      | Task 08 §5                                                                                                            | Settled               |
| No season picker; the roster follows the active season                        | `locked`                      | Brian, 2026-08-26                                                                                                     | Settled               |
| Column visibility is derived from category grants, not special-cased          | `locked`                      | Task 08 §6                                                                                                            | Settled               |
| The mobile quick action is voice call only                                    | `locked`                      | Task 08 §5; R12 and R15 prohibit manual sending outside the pipeline                                                  | Settled               |
| The grid shows the predominant jersey number, not every number a player holds | `proposed for owner approval` | Roughly 8% hold several in one kit. Showing all makes the column unreadable for the 92%                               | Recommend predominant |
| Availability renders only under an availability grant                         | `locked`                      | Task 08 §6                                                                                                            | Settled               |
| Page size, column widths, and the sort's default column                       | `delegated to Mission Lead`   | No product meaning                                                                                                    | Delegated             |

## Brian approval

- Exact words:
- Date:
