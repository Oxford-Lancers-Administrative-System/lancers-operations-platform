# W11 — Set up this season's checklist

- Purpose/intended outcome: A four-role operator says which items apply this
  season, what they are called, and how each one is verified. **That
  configuration is what generates for everybody who arrives**, through all three
  doors, for the rest of the season.
- Primary actor: A four-role operator.
- Trigger: a new season, or a mid-season change of mind.
- Entry point / route: **a new page under `/operate/admin/`**. See the grounding
  below — no configuration surface for this exists anywhere today.
- Controlling source: `S14`, `S15`, `S19`, `S20`; owned `R1`, `R1a`, `R1b`,
  `R2`, `R2-E`, `R2-V2`, `T10-A1`, `T10-entry-guards`, `PR7-checklist`.
- User-visible result: the season's checklist, which every arrival gets in full.

## Current `main` grounding

`onboarding_item_types` exists and is **seeded, never configured**. Nothing under
`src/app` reads or writes it; only `membership.ts` and `weekly-report.ts` touch
it at all. **There is no page for this.**

| The table carries today | What the approved sources need it to carry |
| ----------------------- | -------------------------------------------- |
| `code`, `label`         | —                                            |
| `sort_order`            | —                                            |
| `is_subscription`       | — (`R1a`'s invoiced/paid split)              |
| `is_required`           | **superseded — see below**                   |
| —                       | **verification class** (`R2-V2`)             |
| —                       | **applicability** (`R1a`)                    |
| —                       | **item owner** (`R2`)                        |

**Nearest implemented surface: `/operate/admin/messaging`.** It is the club's
existing per-type configuration page — a row per event type, expandable to that
type's settings, with a preview of what the rule means. That is exactly this
workflow's shape, and both screens are shot on it.

## The flag is gone, and this is where it stops meaning anything

Brian, 2026-09-01: *"Yes, drop the flag/not flag distinction, please."* The
approved `item-and-ask-inventory.md` records the consequence in its own words:

> "There is no flagged/unflagged distinction… Every item counts the same, and
> the Monday queue ranks a person by everything outstanding… **This supersedes
> Task 10 R3-G's retention of 'required' as a display flag.**"

So `is_required` stops driving anything, and **two shipped things lose their
meaning with it**:

1. The **`Required` chip** on every onboarding row of the player record.
2. The **required-outstanding alert** beneath the checklist — *"2 required items
   are still outstanding: …"*.

Both are visible on `W6`'s approved screens because both ship today. `W11-02`
photographs what removing the flag actually does to that section, because a
decision recorded only in a brief is a decision nobody sees until implementation.

**The frozen inventory's own wording for this workflow is stale on this point.**
It says an operator configures "which items apply this season, their labels,
their tracking flag and how each is verified". The tracking flag was dropped
five days later. The rest of the line stands.

`R1a`'s "BPS as a named gate" is stale for the same reason: BPS left the
checklist entirely on 2026-09-01 and became a plain attribute on the roster.
Amendment `A3` records that against Task 10.

## What is configured

| Setting                | What it does                                                                 |
| ---------------------- | ------------------------------------------------------------------------------ |
| **Applies this season** | Whether the item generates at all. An empty configuration is "not configured" |
| **Label**              | What everybody sees it called                                                |
| **Verification class** | `trust · verify · derived · operator` — configuration, never code (`R2-V2`)  |
| **Owner**              | Kit Manager, compliance owner, GM, Media Secretary, four-role (`R2`)         |
| **Subscription**       | The invoiced/paid split, which membership derives from (`R1a`)               |

## The generation guards

`T10-entry-guards`, and they are the parts that go wrong quietly if nobody
states them:

- **An empty configuration reads as "this season has no onboarding items
  configured"** — never as "everybody is complete". The record already renders
  that sentence; this is what makes it true rather than accidental.
- **An item type added mid-season backfills as `pending` onto everybody**, not
  only onto people who arrive afterwards.
- **The full checklist regenerates for everyone every season** (`R1b`). It is
  about the season, not the person: "it's about the president, not the person."
- **No mid-season expiry** (`R2-E`). Items reset at the season boundary and
  nowhere else; a lapse mid-season is a manual reopen, which is `W6`'s.
- **Formalwear is asked every season** (`T10-A1`), its returner carve-out
  removed as kit's already was.

## Required actions

1. Open the season's checklist configuration.
2. Turn items on or off for this season; rename them; set each one's
   verification class and owner.
3. Save. Everybody who arrives from now on gets this; everybody already here
   gets any newly-added item as `pending`.

## Handoffs

| To / from | What crosses                                                        |
| --------- | --------------------------------------------------------------------- |
| `W1`–`W3` | Generation at each of the three doors reads this configuration       |
| `W6`      | Labels, verification classes and owners, as the record renders them  |
| `W4`      | Which items the player is asked about at all                         |
| `W8`      | What counts as outstanding — every item equally, now the flag is gone |
| `W10`     | Nothing. Configuration never gates activation                        |

## Dependencies and mission boundaries

| Seam                        | This mission's side                    | The other side                        | Blocking?              |
| --------------------------- | ---------------------------------------- | --------------------------------------- | ------------------------ |
| Mission 5 · People & Roster | The configuration and what generates   | The record and board that display it  | Not blocking; shipped  |
| Mission 11 · Season Lifecycle | Reading the current season            | Creating one, and the boundary reset  | **See below**          |

**Mission 11 owns season creation and nothing creates a season.** This workflow
configures the checklist *for* a season that already exists. It inherits that
precondition rather than filling it, exactly as `W1` does.

## Exceptions and recovery

- **No season.** The page cannot open; `readCurrentSeason` throws, as everywhere.
- **Turning an item off mid-season.** It stops generating for new arrivals;
  people who already have it keep it, because deleting somebody's history to
  tidy a configuration is not a thing this mission does.
- **Renaming an item.** The label changes everywhere, including on history. The
  item is its `code`, not its label.
- **Two items with the same code.** Refused by the table's own unique
  constraint on `(season_id, code)`.

## Safety, privacy, consent, and authority boundaries

- **Four-role only.**
- Configuration carries no personal data at all.
- Changing a verification class never retroactively re-opens a resolved item;
  it governs what happens next.

## Acceptance evidence

| Screen   | What it proves                                                                     |
| -------- | ------------------------------------------------------------------------------------ |
| `W11-01` | The season's items, each with its applicability, verification class and owner       |
| `W11-02` | What dropping the flag removes from the shipped record: the chip, and the alert     |

Shot on `/operate/admin/messaging` — the club's existing per-type configuration
page and the nearest implemented analogue — and on
`/operate/roster/[membershipId]`. Both sides, measured 1280 and 375.

Grounding: **screenshots**.

## Core decisions

| Decision                                                                | Classification                  | Governing evidence or recommended default                                                              | Status   |
| ------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------- | -------- |
| The twelve items are per-season configuration, not code                 | locked                          | `R1`, `PR7-checklist`                                                                                  | settled  |
| Verification class is configuration, not code                           | locked                          | `R2-V2`                                                                                                | settled  |
| Item owners are per-item configuration                                  | locked                          | `R2`                                                                                                   | settled  |
| The full checklist regenerates for everyone every season                | locked                          | `R1b`                                                                                                  | settled  |
| No mid-season expiry; a lapse is a manual reopen                        | locked                          | `R2-E`                                                                                                 | settled  |
| An empty configuration reads as "not configured", never "complete"      | locked                          | `T10-entry-guards`                                                                                     | settled  |
| An item added mid-season backfills as `pending` onto everybody          | locked                          | `T10-entry-guards`                                                                                     | settled  |
| Formalwear is asked every season                                        | locked                          | `T10-A1`                                                                                               | settled  |
| The tracking flag is gone, and `is_required` drives nothing             | locked                          | Brian 2026-09-01; approved `item-and-ask-inventory.md`, which supersedes `R3-G`'s display-flag half     | settled  |
| **What replaces the shipped `Required` chip and the outstanding alert** | **proposed for owner approval** | Both lose their meaning with the flag. **Recommended: the chip goes entirely, and the alert becomes a plain count of everything outstanding** — which is what the Monday queue already ranks by | **open** |
| **Where this page lives**                                               | **proposed for owner approval** | No configuration surface exists for this. **Recommended: under `/operate/admin/`, beside the messaging schedule**, which is the club's existing home for per-type configuration | **open** |
| Whether an item's `code` is ever editable                               | delegated to Mission Lead       | The unique constraint is on `(season_id, code)`; the label is what people read                          | settled  |

## Brian approval

- Exact words:
- Date:
