# Design system — the visual target

Status: **proposed**, LAN-225 — awaiting Brian's visual approval on the mockup
branch `chore/lan-225-design-mockup`. Approved by Brian on: _pending_.
Applies to: every user-facing surface, once the implementation mission lands.
Sits beside: [`standards.md`](standards.md) (the seven rules), which this page
never contradicts; [`slice-ux.md`](slice-ux.md) (routes, vocabulary, states),
which this page never redefines.

This is the single place the implementation mission is held to. It is short
on purpose: the tokens are in `src/theme.ts`, the components are in
`src/components/`, and the evidence is on the review page for LAN-225. What is
here is the rule for each, and the reason where a reason is not obvious.

## 1. Palette

The nine colours from the Figma brand board, in MUI roles. Every ratio below is
WCAG 2.x, measured, and re-measured by `src/theme.test.ts` on every run.

| Role                 | Colour              | Hex                  | Allowed uses                                                                                      | Never                                   |
| -------------------- | ------------------- | -------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `primary.main`       | Oxford Blue         | `#002147`            | Sidebar and drawer, public masthead, contained buttons, active navigation text, the Person band   | Text on Royal Blue (1.82)               |
| `primary.light`      | Oxford Royal Blue   | `#1D42A6`            | Links, focus ring, `info`, the Season and Recruitment bands                                       | On Oxford Blue                          |
| `primary.dark`       | Oxford Blue, darker | `#001633`            | Hover on a contained primary button                                                               | —                                       |
| Sky Blue             | Oxford Sky Blue     | `#B9D6F2`            | The active navigation item's ground, selected rows, sidebar secondary text on Oxford Blue (10.67) | A text colour on white (1.50)           |
| `secondary.main`     | Gold                | `#C09723`            | The crest, one accent band per page, a gold rule                                                  | White text on it (2.73); text on white  |
| `secondary.dark`     | Oxford Old Gold     | `#8D7149`            | The Onboarding band; overlines and secondary emphasis (4.57, AA not AAA)                          | Long body copy                          |
| decorative           | Ochre, Lemon        | `#E2C044`, `#F7EF66` | Grounds under Charcoal text only: a highlighted row, a callout band                               | Text, icon, chip outline; white on them |
| `text.primary`       | Oxford Charcoal     | `#211D1C`            | All body text (16.70 on white)                                                                    | —                                       |
| `text.secondary`     | Charcoal 70 %       | `#5A5754`            | Captions, helper text, table sublines, table heads (7.18); the neutral chip                       | —                                       |
| `text.disabled`      | Charcoal 50 %       | `#8C8987`            | Disabled controls and the italic _not recorded_                                                   | The only way to read a value            |
| `background.default` | Warm off-white      | `#F6F5F2`            | The page ground. Not a brand colour; chosen to sit with the golds                                 | —                                       |
| `background.paper`   | White               | `#FFFFFF`            | Cards, tables, forms, table heads                                                                 | —                                       |
| `divider`            | Charcoal 12 %       | —                    | Table rules, card borders, the rule between form sections                                         | —                                       |

### 1.1 Semantic set

The club palette has no green or red. These five sit with it and every `main`
passes AA both as white-on-colour (filled chips) and as colour-on-white
(outlined chips, alert text). `light` is the tint an alert or a selected row
sits on; Charcoal on every tint is ≥ 13.9.

| Semantic  | `main`    | `light`   | Meaning                                      |
| --------- | --------- | --------- | -------------------------------------------- |
| `success` | `#1E6F3C` | `#E3F1E7` | Done, positive, present                      |
| `warning` | `#9A5B00` | `#FBF1DC` | Needs attention, not failed                  |
| `error`   | `#B3261E` | `#FBE7E5` | Failed, refused, negative                    |
| `info`    | `#1D42A6` | `#E3EBF8` | In progress, informational (Royal Blue)      |
| `neutral` | `#5A5754` | `#ECEAE6` | Not yet, none, archived (the "default" chip) |

MUI's default orange `warning` (`#ED6C02`, 3.11 as white-on-colour) is gone
from every surface.

## 2. Type

Geist, loaded by `next/font`; Geist Mono for identifiers and the import prompt
only. Sizes in px / line-height, weight. The page title is the one `display`
heading per page and it is always `h1`; `h4`–`h6` alias the same three tiers
so a page that still picks by habit lands on the scale.

| Token      | Size    | Weight | Use                                             |
| ---------- | ------- | ------ | ----------------------------------------------- |
| `h1`       | 28 / 34 | 700    | Page title, one per page                        |
| `h2`       | 22 / 28 | 700    | Record name, metric value                       |
| `h3`       | 17 / 24 | 600    | Card and section headings                       |
| `overline` | 11 / 16 | 600    | Caps, 0.08em tracking: band labels, fact labels |
| `body1`    | 15 / 22 | 400    | Body, form values, emphasised facts (600)       |
| `body2`    | 13 / 18 | 400    | Captions, table cells and sublines, helper text |
| `caption`  | 12 / 16 | 400    | Provenance lines                                |
| `button`   | 14 / 20 | 600    | Sentence case, always                           |

## 3. Spacing, radius, elevation

- Spacing unit 8px. Page gutter 32px desktop, 16px phone. Content max width
  1200px, centred; the roster and recruitment boards scroll inside it.
- Section gap 24px; card padding 24px desktop, 16px phone; tables stay
  `size="small"` (6px 12px).
- Radius 8px on cards, fields and buttons; 16px (pill) on chips; 12px on
  drawers, dialogs and menus.
- No shadow on cards (outlined `Paper`, 1px divider). One shadow level for the
  drawer, menus and dialogs.
- Buttons: `contained` primary for the one main action on a page, `outlined`
  for secondary, `text` for tertiary and back links. Destructive actions are
  `outlined` in `error`; a filled red belongs only inside a confirmation panel.
  Medium buttons are 44px tall; small are 36px.
- Focus: one ring, Royal Blue, 2px, offset 2px, on every control.
- Links: Royal Blue, underline on hover and focus. No other link style.
- Dates: `27 Aug 2026` and `27 Aug 2026, 14:22`, from `event-vocabulary.ts`;
  never `Sept`, never `mm/dd/yyyy`, never a native date input.

## 4. Status → colour

One table, in `src/components/status-chip.tsx` as `STATUS_VOCABULARY`. Filled
chips for stored statuses, outlined for derived or secondary facts, always with
the word from the owning vocabulary module. Nothing here renames a state.

| Colour             | Membership / person                | Event              | Delivery                               | Recruitment        | Attendance / RSVP         | Operator account                         |
| ------------------ | ---------------------------------- | ------------------ | -------------------------------------- | ------------------ | ------------------------- | ---------------------------------------- |
| `success` filled   | Active                             | Approved           | Delivered                              | Joined             | Present; Yes              | Active                                   |
| `info` filled      | Onboarding                         | —                  | Attempted                              | Engaged, Committed | Excused                   | —                                        |
| `warning` filled   | Inactive                           | —                  | Retryable, Held, WhatsApp unresponsive | Disengaged         | Late                      | Invitation pending, Email change pending |
| `error` filled     | —                                  | —                  | Failed, Not dispatched (no channel)    | Declined           | Absent; No                | Delivery failed                          |
| `error` outlined   | —                                  | Cancelled          | Escalated                              | —                  | —                         | —                                        |
| `neutral` filled   | Departed, Archived, Recruit (type) | Draft, Occurred    | Queued, Cancelled (job)                | Identified, Void   | No response, Not recorded | Deactivated                              |
| `success` outlined | —                                  | Upcoming (derived) | —                                      | —                  | —                         | —                                        |
| `primary` outlined | Player (type)                      | —                  | —                                      | —                  | —                         | —                                        |

Two rows the brief did not list, added because two screens show them:
onboarding items (Complete `success` filled; Pending or Outstanding `warning`
outlined; Waived and Not applicable `neutral` outlined; the Required and
Never-blocks flags `neutral` outlined) and availability (Green `success`,
Orange `warning`, Red `error`, filled). Event **type** keeps its own hue set on
the calendar — colour = type, words = status (LAN-114) — to be picked from the
club palette when that surface is migrated; it is not a status and never a
`StatusChip`.

## 5. The kit

`src/components/`. One line each: what it is for. Every entry replaces the
local copies the audit inventory names; none is a wrapper for its own sake.

| Component                                                       | Use it when                                                                                                                                              |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PageHeader`, `BackLink`                                        | Every page's one heading: title, subtitle, the parent as "Back to <place>" above it, actions top right.                                                  |
| `Section`                                                       | A card with a heading. `plain` for panels and forms; `banded` for record surfaces (bands: person, season, recruitment, onboarding, attendance, history). |
| `Fact`, `FactGrid`, `FactList`                                  | A labelled value. `stacked` in cards and public pages, `inline` in record sections; absent renders _not recorded_; `provenance` only when known.         |
| `Metric`, `MetricRow`                                           | A headline number, or a status where the headline is a state.                                                                                            |
| `StatusChip`                                                    | Any status. Reads §4; never colour without the word.                                                                                                     |
| `Notice`                                                        | An outcome, a refusal (`variant="refusal"`), or a condition the reader must know now. Never standing guidance.                                           |
| `OutcomeSlot`                                                   | A screen with more than one action: one result at a time (rule 1).                                                                                       |
| `EmptyState`                                                    | A list with nothing to list: what was searched, and the link that resolves it (rule 5).                                                                  |
| `Field`, `SelectField`, `ChoiceField`, `DateField`, `TimeField` | Every form control. Full width, one size, helper names the format. Pickers, never native dates.                                                          |
| `Refusal`                                                       | A guard fired correctly: title, one sentence, the requirement, one action (rule 6).                                                                      |
| `ActionBar`                                                     | A form's foot: primary, secondary, cancel; sticky on a phone; the enabling sentence (rule 4).                                                            |
| `RowCard`, `RowCardList`, `DesktopOnly`                         | The phone half of every table; one tap target per row.                                                                                                   |
| `SortableHeader`, `TableFrame`                                  | A sortable column heading (href-based) and the frame every desktop table sits in.                                                                        |
| `CandidateRow`                                                  | A duplicate-person match with one resolving action.                                                                                                      |
| `PublicShell`                                                   | Every page reached without a session: masthead with the crest, one `<main>`, one card.                                                                   |
| `BrandMark`                                                     | The crest and the club's name, on dark or on light.                                                                                                      |

Out of the kit deliberately: the roster and recruitment boards
(`board-filter-controls.tsx`, `roster-board.tsx`, `recruitment-board-view.tsx`).
They take the tokens and the band colours and are otherwise untouched.

## 6. The shell

- The sidebar (226px) and the drawer (280px) are Oxford Blue with white text.
  Secondary lines are Sky Blue. The active item is Sky Blue with Oxford Blue
  text. Dividers are white at 18 %.
- The crest (32px) and the club's name sit at the top, with the section caption
  under them ("Operations", "Attendance"). The signed-in name, the role caption
  and **Sign out** are the account block at the foot.
- Nothing repeats above the page: no "Lancers Operations", no "Signed in as".
  The page's `PageHeader` is its first heading.
- The phone top bar is Oxford Blue and carries the hamburger and the crest.
  LAN-195's three dismiss paths and drawer width are unchanged.
- The public masthead is the same Oxford Blue, full bleed, with the crest and
  the name, on every page reached without a session.
- The crest file is `public/brand/crest.svg`, supplied by Brian from the Figma;
  the wordmark is set in Geist unless the export brings one.

## 7. What this does not decide

Product findings the audit classed `owner` that this page does not touch:
`/operate` landing (B4), the help link's home (B6), `/dashboard` and the root
page (B7, B8), the record's attendance length (F1), unbounded lists (F2),
copy cuts other than H1 (H2–H4, H7), the operator-in-two-groups rule (H8),
the future "Showed" column (H9), the report's tense (H10). Each stays a
finding until Brian says otherwise.
