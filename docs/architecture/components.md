# The component kit

`src/components/` is the one place a shared piece of interface is defined. Its
visual rules — palette, type, spacing, the status-to-colour table and one line
per member on when to use it — are in [`../ux/design-system.md`](../ux/design-system.md)
§ 4 and § 5. This page is the engineering map: what is in the kit, how a page
uses it, and the rule for adding to it.

## The rule

> A component is shared when the second page needs it, and it is defined once.

A page that needs a piece nobody else renders keeps it as a **sibling file**
beside its `page.tsx` (`share-panel.tsx`, `renotify-panel.tsx` and
`change-panels.tsx` beside the event page are the pattern). The moment a second
route renders the same piece, it moves to `src/components/` and both routes
import it. Nothing is defined twice, and nothing is promoted speculatively: a
kit member with one caller is a sibling that wandered.

A `page.tsx` is a data read plus a layout of imported parts. It keeps the
service calls and the top-level arrangement; every local component it used to
define at the bottom is a sibling or a kit member.

## Members

| File                     | Exports                                                                                     | Role                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `page-header.tsx`        | `PageHeader`, `BackLink`                                                                    | The one heading per page; the parent as a back link; actions top right   |
| `section.tsx`            | `Section`, `FieldGroup`, `Band`, `BAND_COLOURS`                                             | A card with a heading; `plain`, `banded` or `collapsible`                |
| `controlled-section.tsx` | `ControlledSection`                                                                         | A `Section` whose open state the page owns                               |
| `surface.tsx`            | `Surface`                                                                                   | The bare card every panel sits on                                        |
| `fact.tsx`               | `Fact`, `FactGrid`, `FactList`, `NotRecorded`, `NOT_RECORDED`                               | A labelled value; absent renders _not recorded_                          |
| `record-field.tsx`       | `RecordField`, `RecordRow`                                                                  | A fact that can be edited in place on a record                           |
| `metric.tsx`             | `Metric`, `MetricRow`                                                                       | A headline number or state                                               |
| `status-chip.tsx`        | `StatusChip`, `STATUS_VOCABULARY`, `statusStyle`, `StatusDomain`, `StatusStyle`             | Any status; the one status-to-colour table                               |
| `notice.tsx`             | `Notice`, `REFUSAL_TITLE`, `NoticeSeverity`                                                 | An outcome, a refusal, or a condition the reader must know now           |
| `outcome-slot.tsx`       | `OutcomeSlotProvider`, `useOutcomeSlot`, `Outcome`, `ArrivalNotice`, `EMPTY_OUTCOME`        | One result at a time on a screen with several actions (standards rule 1) |
| `refusal.tsx`            | `Refusal`                                                                                   | A guard that fired correctly (standards rule 6)                          |
| `empty-state.tsx`        | `EmptyState`                                                                                | A list with nothing to list, and the link that resolves it (rule 5)      |
| `field.tsx`              | `Field`, `SelectField`, `ChoiceField`, `CheckField`, `DateField`, `TimeField`, `FieldProps` | Every form control, one size, full width                                 |
| `multi-select-field.tsx` | `MultiSelectField`, `GroupedMultiSelectField`                                               | A control that takes several values                                      |
| `phone-field.tsx`        | `PhoneField`, `PHONE_FIELD_HINT`, `PhoneFieldProps`                                         | The one phone control (LAN-275)                                          |
| `value-choice.tsx`       | `ValueChoice`                                                                               | A short exclusive choice rendered as buttons                             |
| `action-bar.tsx`         | `ActionBar`                                                                                 | A form's foot: primary, secondary, cancel; sticky on a phone (rule 4)    |
| `row-card.tsx`           | `RowCard`, `RowCardList`, `DesktopOnly`                                                     | The phone half of every table                                            |
| `sortable-header.tsx`    | `SortableHeader`, `TableFrame`                                                              | A sortable column heading and the frame every desktop table sits in      |
| `candidate-row.tsx`      | `CandidateRow`                                                                              | A duplicate-person match with one resolving action                       |
| `step-trail.tsx`         | `StepTrail`, `TrailStep`                                                                    | Where the reader is in a sequence; a map, not a control                  |
| `public-shell.tsx`       | `PublicShell`                                                                               | Every page reached without a session                                     |
| `brand-mark.tsx`         | `BrandMark`                                                                                 | The crest and the club's name                                            |
| `link-opened-beacon.tsx` | `LinkOpenedBeacon`                                                                          | Records that a shared link was opened (LAN-277)                          |

Each member has a colocated `*.test.tsx`. A change to a member is a change to
every page that renders it, so its test is the contract and the visual review
for a kit change samples the pages that use it.

## What stays out

The roster and recruitment boards (`operate/roster/roster-board.tsx`,
`operate/recruitment/recruitment-board-view.tsx`, `board-filter-controls.tsx`)
are out of the kit by design: they take the tokens and the band colours and keep
their own layout and inline editing. Their structure is still split into
siblings like any other page; only the pieces stay local.

MUI primitives are not re-wrapped for their own sake. `Alert` is reached only
through `Notice`; `Chip` only through `StatusChip` unless the chip is not a
status (the boards' inline editing chips, the design preview kit page).

## Styling

MUI in `sx` and the theme; Tailwind for layout only; never both on one element
([ADR 0004](../adr/0004-styling-baseline.md)). `docs/ux/standards.md` rules 1–7
hold on every page that renders a member.
