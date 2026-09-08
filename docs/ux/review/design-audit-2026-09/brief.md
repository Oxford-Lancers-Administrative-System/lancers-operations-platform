# Redesign brief — September 2026

Written for LAN-225 (the mockup ticket) and for whoever runs mission intake for
the implementation. Everything here follows from [`findings.md`](findings.md);
nothing here is decided until Brian approves a direction in LAN-225.

Scope reminder (Brian, 3 September 2026): the roster and recruitment boards'
spreadsheet behaviour stays exactly as it is. This brief changes their colours
and chrome only, and treats the board idiom as the reference the rest of the
application converges on.

## 1. Token proposal

### 1.1 Palette

The nine club colours from the Figma brand board, mapped to MUI palette roles.
Contrast ratios are WCAG 2.x, computed on 3 September 2026 (matrix in
`findings.md` §D). AA is 4.5 for text and 3.0 for large text and UI components.

| Role                    | Colour                     | Hex       | Passes                                      | Rule                                                                                      |
| ----------------------- | -------------------------- | --------- | ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `primary.main`          | Oxford Blue                | `#002147` | White on it 16.05                           | Sidebar, contained buttons, active navigation, table band headers, links on tinted ground |
| `primary.light`         | Oxford Royal Blue          | `#1D42A6` | On white 8.82; white on it 8.82             | Links, focus rings, hover on primary, `info` semantic                                     |
| `primary.container`     | Oxford Sky Blue            | `#B9D6F2` | Oxford Blue on it 10.67; Royal on it 5.86   | Selected rows, active filter chips, info tint. Never a text colour                        |
| `secondary.main`        | Gold                       | `#C09723` | Charcoal on it 6.12; Oxford Blue on it 5.88 | Accent bands, the crest, one highlight per page. **White text on Gold fails (2.73)**      |
| `secondary.dark`        | Oxford Old Gold            | `#8D7149` | On white 4.57 (AA text, barely)             | Secondary emphasis text such as overlines, borders, the onboarding band                   |
| `tertiary` (decorative) | Oxford Yellow Ochre        | `#E2C044` | Charcoal on it 9.43; **on white 1.77**      | Backgrounds under dark text only: a highlighted row, a callout band. Never text or icon   |
| `tertiary` (decorative) | Oxford Lemon Yellow        | `#F7EF66` | Charcoal on it 13.91; **on white 1.20**     | Same rule as Ochre; use sparingly, it is the brightest thing on any screen                |
| `text.primary`          | Oxford Charcoal            | `#211D1C` | On white 16.70; on ground 15.32             | All body text. Replaces MUI's `rgba(0,0,0,0.87)`                                          |
| `text.secondary`        | Charcoal, 70 %             | `#5A5754` | On white 7.18                               | Captions, helper text, table sublines                                                     |
| `background.paper`      | White                      | `#FFFFFF` |                                             | Cards, tables, forms                                                                      |
| `background.default`    | Warm off-white (not brand) | `#F6F5F2` | Charcoal on it 15.32                        | Page ground. Chosen to sit with the golds; the Figma supplies no neutral                  |
| `divider`               | Charcoal, 12 %             | —         |                                             | Table rules, card borders                                                                 |

Pairs that fail AA and what to do:

- **White on Gold (2.73), Ochre (1.77), Lemon (1.20), Sky Blue (1.50).** These
  four are never text-on-colour with white. They are backgrounds under Charcoal
  or Oxford Blue text, or decoration that carries no meaning.
- **Gold, Ochre, Lemon on white (2.73, 1.77, 1.20).** Never used as text, icon,
  or a chip outline that must be read. A gold rule or band is decorative.
- **Royal Blue on Oxford Blue (1.82).** The two blues never stack as
  text-on-background. Sidebar text is white; the active item is a Sky Blue tint
  with Oxford Blue text, or a white left rule.
- **Old Gold on white (4.57).** Passes AA text, fails AAA. Fine for overlines
  and secondary emphasis; not for long body copy.
- **Old Gold on Oxford Blue (3.51).** Large text or a rule only.

### 1.2 Semantic set

The club palette supplies no green or red, so these are chosen to sit with it:
slightly desaturated, warm, and every `main` passes AA as white-on-colour for
filled chips and as text-on-white for outlined chips and alerts.

| Semantic  | `main`    | White on main | Tint (`light`) | Charcoal on tint | Meaning                                             |
| --------- | --------- | ------------- | -------------- | ---------------- | --------------------------------------------------- |
| `success` | `#1E6F3C` | 6.19          | `#E3F1E7`      | 14.32            | Done, positive, present                             |
| `warning` | `#9A5B00` | 5.43          | `#FBF1DC`      | 14.89            | Needs attention, not failed                         |
| `error`   | `#B3261E` | 6.54          | `#FBE7E5`      | 14.05            | Failed, refused, negative                           |
| `info`    | `#1D42A6` | 8.82          | `#E3EBF8`      | 13.92            | In progress, informational (this is Royal Blue)     |
| `neutral` | `#5A5754` | 7.18          | `#ECEAE6`      | 13.90            | Not yet, none, archived (the "default" chip colour) |

MUI's default `warning` (`#ED6C02`) fails AA as white-on-colour (3.11); the
orange chips on the events list and the cancel button are on that colour today.

### 1.3 One status → colour vocabulary

One table for the whole application. Filled chips for stored statuses, outlined
chips for derived or secondary facts, always with the word. The labels are the
fixed vocabulary in `slice-ux.md` §6 and the `*-vocabulary.ts` modules; nothing
here renames a state.

| Colour             | Membership / person                | Event                           | Delivery                               | Recruitment        | Attendance / RSVP         | Operator account                         |
| ------------------ | ---------------------------------- | ------------------------------- | -------------------------------------- | ------------------ | ------------------------- | ---------------------------------------- |
| `success` filled   | Active                             | Approved                        | Delivered                              | Joined             | Present, Attending        | Active                                   |
| `info` filled      | Onboarding                         | —                               | Attempted                              | Engaged, Committed | Excused                   | —                                        |
| `warning` filled   | Inactive                           | —                               | Retryable, Held, WhatsApp unresponsive | Disengaged         | Late                      | Invitation pending, Email change pending |
| `error` filled     | —                                  | —                               | Failed, Not dispatched (no channel)    | Declined           | Absent, Not attending     | Delivery failed                          |
| `error` outlined   | —                                  | Cancelled                       | Escalated                              | —                  | —                         | —                                        |
| `neutral` filled   | Departed, Archived, Recruit (type) | Draft, Occurred (derived, dark) | Queued, Cancelled (job)                | Identified, Void   | No response, Not recorded | Deactivated                              |
| `primary` outlined | Player (type)                      | —                               | —                                      | —                  | —                         | —                                        |

Consequences: the events list stops using orange for Occurred and blue for
Draft; the calendar's cancelled chip stops being orange; recruitment stops
using `primary` and `secondary` as statuses; Excused reads the same on the
attendance sheet and the participation table. Event **type** keeps its own
non-semantic hue set on the calendar (LAN-114 rule: colour = type, words =
status); those hues are re-picked from the club palette in LAN-225 and remain
distinct from the semantic set above.

### 1.4 Type scale

Keep Geist (see decision 4.1). Sizes in px / line-height, weight.

| Token      | Size    | Weight | Use                                                   |
| ---------- | ------- | ------ | ----------------------------------------------------- |
| `display`  | 28 / 34 | 700    | Page title (`h1`), one per page                       |
| `h2`       | 22 / 28 | 700    | Record name, section group                            |
| `h3`       | 17 / 24 | 600    | Card and panel headings                               |
| `overline` | 11 / 16 | 600    | Caps, 0.08em tracking: band labels, fact labels       |
| `body1`    | 15 / 22 | 400    | Body, form values                                     |
| `body2`    | 13 / 18 | 400    | Captions, table sublines, helper text                 |
| `table`    | 13 / 18 | 400    | Cells, `size="small"` stays                           |
| `button`   | 14 / 20 | 600    | **Sentence case** (`textTransform: none`)             |
| `mono`     | 13 / 18 | 400    | Geist Mono for identifiers and the import prompt only |

The page title tier today is accidental (h4 refusals, h5 records, h6 lists);
one `display` token replaces all three.

### 1.5 Spacing, radius, elevation

- Spacing unit 8px. Page gutter 32px desktop, 16px phone. Content max width
  1200px, centred, so the wide pages (events, follow-ups) stop stretching to 1440.
- Section gap 24px; card padding 24px desktop, 16px phone; table cell padding
  keeps MUI small.
- Radius 8px everywhere (cards, fields, buttons); chips 16px (pill); the
  drawer and dialogs 12px.
- Elevation: none on cards (outlined `Paper`, 1px divider colour) as today;
  one shadow level (`elevation 8`) reserved for the drawer, menus, and dialogs.
  Band headers on record cards keep their filled treatment but move to the
  palette: `PERSON` Oxford Blue, `SEASON`/`RECRUITMENT` Royal Blue,
  `ONBOARDING` Old Gold, history bands `neutral`. The purple attendance band
  goes.
- Buttons: `contained` primary for the one main action, `outlined` for
  secondary, `text` for tertiary and back links. Destructive actions are
  `outlined` in `error`; never a filled orange.
- Dates: `27 Aug 2026` and `27 Aug 2026, 14:22` everywhere, from
  `event-vocabulary.ts`; the `Sept` form disappears.

## 2. The component kit

Reconciled with LAN-219's P1 list. Names in bold are LAN-219's; the rest are
what the audit showed is missing. Every entry replaces the local duplicates
named in `findings.md` §Inventory.

| Component                   | Replaces                                                                                          | Notes                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **PageHeader**              | ~30 ad hoc headings, `AdminPageHeading`, the record-view headers                                  | Title (display), subtitle, optional back link, primary and secondary action slots. Actions always top right          |
| **Section**                 | 6 local `Section`, record-shell `Section`, admin panels                                           | `banded` (filled overline band) and `plain` (h3) variants; same padding both                                         |
| **Fact**                    | 8 local `Fact`, `Label`/`Field`/`LabeledField`, record-shell `Row`                                | Label above or beside value, `not recorded` rendering built in, provenance chip slot                                 |
| **Metric**                  | 2 local `Metric`, the report headline numbers                                                     | Value, label, optional caption                                                                                       |
| **StatusChip**              | `StatusCell`, `StatusChip`, `TypeCell`, `StatusPill`, inline chip colouring in 39 files           | One `status → colour` map from §1.3; filled/outlined by kind; never colour without the word                          |
| **Notice**                  | 133 inline `Alert`s                                                                               | Severity from §1.2 plus a `refusal` variant (rule 6) and an `outcome` variant tied to `OutcomeSlot`                  |
| **PageHeader** + `BackLink` | 4 back-link constructions                                                                         | One text-button back link in `PageHeader`, sentence case, always "Back to <place>"                                   |
| **EmptyState**              | `EmptyPeople`, `EmptyQueue`, inline "no rows" copy                                                | What was searched, and the link that resolves it (rule 5)                                                            |
| **Field**                   | 136 `TextField` uses with mixed size/width                                                        | One size, `fullWidth`, helper slot, MUI date and time pickers only (no native inputs)                                |
| `Refusal`                   | 4 local `Refusal`, `NotPermittedScreen`, `CoachNotPermittedScreen`, `UnavailableScreen`           | One screen: display title, one sentence, one back action. Parametrised, not copied                                   |
| `OutcomeSlot`               | admin `useOutcomeSlot` promoted out of `operate/admin/`; every local error/pending pair elsewhere | Rule 1 for the whole application                                                                                     |
| `ActionBar`                 | Form footers built five ways                                                                      | Primary, secondary, cancel; sticky on phone                                                                          |
| `RowCard`                   | 7 phone card renderers                                                                            | Title, sublines, chips, one tap target; the phone half of every table                                                |
| `SortableHeader`            | 4 implementations                                                                                 | Href-based sort, unchanged behaviour                                                                                 |
| `CandidateRow`              | 3 implementations                                                                                 | Duplicate-person match row                                                                                           |
| `PublicShell`               | Three different public headers and one missing one                                                | Wordmark (and crest if approved), one `<main>` landmark, used by login, reset, RSVP, answer, my page, join, calendar |
| `Shell` tokens              | hard-coded greys in `shell-nav.tsx`                                                               | Sidebar and drawer on `primary.main`; no behaviour change (LAN-195 stays)                                            |

Out of the kit deliberately: the board (`board-filter-controls.tsx`,
`roster-board.tsx`, `recruitment-board-view.tsx`). It only takes the tokens.

## 3. Screens to mock up

The shell plus eight pages. Between them they use every kit component.

| #   | Screen                                         | Why                                                                                                       |
| --- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 0   | Shell: sidebar, phone drawer, page header      | Every operator page inherits it; the palette lands here first                                             |
| 1   | Roster board `/operate/roster`                 | The reference idiom; tokens only, proves the palette on the densest screen (`StatusChip`, filters, bands) |
| 2   | Player record `/operate/roster/[membershipId]` | `Section` banded, `Fact`, `Metric`, `StatusChip`, the long-page problem on phone                          |
| 3   | Event record `/operate/events/[id]` (approved) | `Metric`, `Notice`, participation table, `ActionBar`, share panel; the page most operators live on        |
| 4   | Create event `/operate/events/new`             | `Field`, pickers, `ActionBar`, `Notice` as helper vs the rejected explanatory copy                        |
| 5   | RSVP invitation `/rsvp/[token]`                | `PublicShell`, Yes emphasis (LAN-172), the security-uniform not-found sibling                             |
| 6   | Monday report `/operate/report`                | Print-like density, `Metric`, tables at 1200 max width, the native date input replaced                    |
| 7   | Login `/login`                                 | `PublicShell`, crest decision, sentence-case buttons, the removed explanatory alert                       |
| 8   | Operators `/operate/admin/operators` + detail  | `PageHeader` with help link, grouped tables, `OutcomeSlot`, the deactivate/restore panels                 |

If only six are affordable: 0, 1, 3, 4, 5, 7.

## 4. Open decisions for Brian

1. **Typeface.** Keep Geist (recommended). Nothing in the Figma names a face;
   Geist is already loaded, reads well at 13px in tables, and a brand face
   would need an export and a licence check. Revisit only if the crest export
   comes with a wordmark face.
2. **Light only, or light and dark.** Light only (recommended). Oxford Blue on
   white is the brand; a dark theme doubles the token work and the club's
   yellows have no dark-mode role. Leave `cssVariables` on so dark can follow.
3. **Density.** Compact tables, comfortable forms (recommended): keep
   `size="small"` tables and 44px touch targets; forms at `body1` with 16px
   field height on phone.
4. **Crest in the shell.** Yes, if Brian exports it as SVG (recommended):
   sidebar top beside the wordmark, 32px, and on `PublicShell`. Without an
   export, the wordmark alone in Oxford Blue.
5. **Sentence-case buttons.** Yes (recommended). One theme line removes the
   all-caps that the screenshots show on every surface.
6. **`product` findings worth taking now** (each is one sentence in a file and
   no behaviour): H1 explanatory alert on login; H2 delivery banner; H3 second
   alert on the refusal screen; H4 dashboard copy and raw role codes; E9 native
   date inputs (US format) on person edit and report; A6 `Sept` vs `Sep`.
   The rest of the `product` rows wait for their owning surface.

## 5. Sequencing against LAN-219

1. **LAN-225 first**: approve tokens (§1) and the kit list (§2) on the nine
   mockups. Nothing in code.
2. **Theme tokens land before the kit.** A one-file `src/theme.ts` change
   (palette, typography, shape, `textTransform`, chip and button overrides)
   ships on its own and immediately recolours every page without touching
   components. Low risk, big visible change, and it is what LAN-219's kit
   should be built on so nothing is built twice against the placeholder.
3. **LAN-219 P1 builds the kit on those tokens**, migrating surfaces in the
   order of §3 (shell, records, event, forms, public, report, admin). The
   board takes tokens in step 2 and is otherwise untouched.
4. **Copy findings** (`product`, §4.6) ride with whichever surface is migrated;
   they need Brian's one-line approval each, recorded in the PR.
5. **After** the kit: the remaining `product` findings (pagination on
   follow-ups and the coach event list, the operator appearing in two groups)
   are separate tickets because they change what a screen does.
