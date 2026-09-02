# W6 — One player's onboarding record

- Purpose/intended outcome: An operator opens one player and sees the whole
  truth about them: every checklist item, **who said it and when**, everything
  the club has ever asked them counted by section, and one place to complete,
  waive, mark not applicable or reopen any item.
- Primary actor: A four-role operator (President, Vice President, Secretary,
  General Manager).
- Trigger: they open a player — from the roster board, the missing-data queue,
  or the Monday chase list.
- Entry point / route: **`/operate/roster/[membershipId]`**, which ships. This
  workflow adds no new surface; it deepens the Onboarding section that is
  already there.
- Controlling source: `S16`, `S17`, `S18`, `S23`, `S24`, `S32`; owned `R2-R`,
  `R2-V`, `R3-C`, `R3-G`, `T10-activity-log`, `PR7-activity-log`,
  `OD7-log-by-section`; cited `R1`, `R2`, `R2-E`, `PR7-checklist` (`W11`),
  `R4-T` (`W8`), `T07-permissions` and `OD7-oneway-tick` (`W4`).
- User-visible result: the record answers "where is this person up to, who said
  so, and how often have we chased them about it" — and any item can be resolved
  from it.

## Current `main` grounding

The record ships and is good. What it does **not** carry is this workflow.

| What ships at `/operate/roster/[membershipId]`                                | What is missing                                          |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| An **Onboarding** section, one `OnboardingRow` per item                       | —                                                          |
| `Required` and `Never blocks activation` chips                                 | —                                                          |
| A resolve control offering complete, waived, not applicable                    | **reopen**, and `claimed`                                  |
| `provenanceNote`: `Waived by X — reason`, or `Completed <day>`                 | **who** completed it; anything at all before the current state |
| An alert naming the required items still outstanding                           | —                                                          |
| `onboarding_item_status`: `pending → invited → complete \| waived \| not_applicable` | **`claimed`**                                        |

**Three things are genuinely absent and are this workflow's:**

1. **`claimed`** — "the player says done, awaiting confirmation" — is not in the
   enum. `R2-V`: a trust-class item completes on the player's word carrying
   player-claimed provenance; a verify-class item shows `claimed` until a named
   human confirms it.
2. **Per-item history.** `onboarding_items` stores current state only. The
   record can say an item is complete; it cannot say it was complete, reopened
   in November and completed again.
3. **The sectioned activity log.** `PR7-activity-log`, `T10-activity-log`,
   `OD7-log-by-section`. LAN-105, its old Post-MVP home, is Canceled, so this is
   its only home.

### The shipped constraint this workflow must unwind

`R2-R` says reopen and waive are four-role actions with **no mandatory reason**,
audited. The database currently refuses that:

```sql
constraint onboarding_items_waiver_is_justified check (
  status <> 'waived'
  or (waived_by_person_id is not null and btrim(coalesce(waived_reason, '')) <> ''))
```

A live constraint contradicting an approved owner decision. It is named here so
the Mission Lead does not discover it at implementation time; unwinding it is a
forward-only migration, and the author stays mandatory while the reason stops
being.

## What the record has to answer

Three questions, in this order. They are what the section is for.

1. **Where is this person up to?** Every item, its state, and the derived
   completeness `R3-C` defines.
2. **Who said so?** Per item: who put it in that state, when, and — for a
   `claimed` item — that it was the player who said it and nobody has confirmed.
3. **How often have we chased them about this, and what came back?** The
   activity log — **grouped by section, one entry per event**.

`OD7-log-by-section` is the whole point of the third: "how many times have we
asked him about this" is a question about a section, not about a mailbox.

**It is entries, not counts.** The first draft rendered one summary line per
section — *asked 4 times · answered twice* — and Brian rejected it on
2026-09-02: "that is just not useful… I want to see the individual items that
come underneath, when it was asked versus when it was received." So every ask
and every answer is its own dated entry, and the section is what groups them.

**It reuses the record's own history component.** `StatusHistory` already
renders exactly this shape on this page — a bordered entry carrying a bold
label, a line saying what happened, and a caption of when and who. The log is
that markup with different entries, not a new component.

## Resolution

Four resolutions, all four-role, all audited, **none of them requiring a
reason** (`R2-R`):

| Resolution       | What it means                                                      |
| ---------------- | -------------------------------------------------------------------- |
| `complete`       | Done. Dated, and attributed to whoever recorded it                  |
| `waived`         | This person does not have to. Author recorded; reason optional      |
| `not_applicable` | This item never applied to this person                              |
| `reopen`         | Back to outstanding from any terminal state. **Never automatic**    |

`R4-T`, owned by `W8`, is explicit that **reopen never auto-fires**. A human
reopens; the machine never does, and neither does a new season on its own
(`R2-E`: items reset only at the season boundary, and a lapse is a manual
reopen).

**Nothing gates.** `R3-G` is enforced here, where items are resolved: no item
blocks any action anywhere, and an active player with an unfinished checklist is
the normal case, not an exception. Derived onboarding-completeness is
**display-only and never flips membership status on its own** (`R3-C`) —
activation is a human declaration and is `W10`'s.

## Handoffs

| To / from   | What crosses                                                                |
| ----------- | ----------------------------------------------------------------------------- |
| `W4`, `W5`  | Everything a player submits or changes lands here, with player provenance    |
| `W7`        | A disputed fact is resolved there, and its resolution shows here             |
| `W8`        | The queue reads what is outstanding; every ask it sends appears in this log  |
| `W10`       | "Who is ready to activate" is derived from this and consumed there           |
| `W11`       | Which items exist, their labels and their verification class                 |
| Mission 5   | The record, the roster board, its filtering and its status colours (`S24`)   |

## Dependencies and mission boundaries

| Seam                        | This mission's side                                              | The other side                              | Blocking?             |
| --------------------------- | ------------------------------------------------------------------ | --------------------------------------------- | ----------------------- |
| Mission 5 · People & Roster | `claimed`, per-item history, the log, reason-free waive and reopen | The record and roster surfaces that show them | Not blocking; shipped |
| Mission 4 · Communications  | What the log counts                                              | The sends themselves and their delivery states | Not blocking          |
| `W11`                       | Reading the configuration                                        | Setting it                                   | Not blocking          |

## Exceptions and recovery

- **An empty item configuration** reads as "this season has no onboarding items
  configured", which ships — never as "everyone is complete".
- **An item type added mid-season** backfills as `pending` onto everybody.
- **A closed season** is read-only, which ships.
- **An active player with an unfinished checklist** is normal and is not
  flagged as an error anywhere.
- **A `claimed` item nobody ever confirms** stays `claimed`. It is visible,
  and it is the compliance owner's to close — no timeout resolves it.

## Safety, privacy, consent, and authority boundaries

- **Four-role only** for resolution. Coaches and players never see another
  person's record (`T07-permissions`).
- **Date of birth is never on this surface as a date** — only the derived
  under-18 flag, per the overview invariant.
- **Free text is restricted**: waiver reasons and refusal notes are four-role
  only and never reach a report verbatim.
- **Consent appears here as a status an operator can switch off**
  (`OD7-oneway-tick`), and nowhere else.
- **History is append-only.** A superseded value is retained, never overwritten.

## Acceptance evidence

| Screen  | What it proves                                                                  |
| ------- | --------------------------------------------------------------------------------- |
| `W6-01` | The checklist with real provenance: state, who said it, when — and `claimed`     |
| `W6-02` | Resolving one item: four resolutions, four-role, and no reason demanded          |
| `W6-03` | The activity log, counted by section rather than listed as sends                 |

Shot on `/operate/roster/[membershipId]`, a real implemented route, both sides,
measured 1280 and 375.

Grounding: **screenshots**.

## Core decisions

| Decision                                                             | Classification                  | Governing evidence or recommended default                                                                              | Status   |
| -------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------- |
| This deepens the shipped record; it is not a new surface            | locked                          | `/operate/roster/[membershipId]` ships and is the surface an operator already works from                               | settled  |
| `claimed` is added to `onboarding_item_status`                      | locked                          | `R2-V`; the enum has no such value today                                                                               | settled  |
| Trust-class items complete on the player's word, with provenance    | locked                          | `R2-V`                                                                                                                 | settled  |
| Per-item history is append-only and never overwrites                | locked                          | Overview audit posture; `S17`                                                                                          | settled  |
| Waive and reopen are four-role and demand no reason                 | locked                          | `R2-R`. **Requires unwinding `onboarding_items_waiver_is_justified`**                                                  | settled  |
| Reopen is never automatic                                           | locked                          | `R4-T`, `R2-E`                                                                                                         | settled  |
| Onboarding-completeness is derived and display-only                 | locked                          | `R3-C`; activation is `W10`'s human declaration                                                                        | settled  |
| Nothing gates, enforced here                                        | locked                          | `R3-G`                                                                                                                 | settled  |
| The activity log is counted by section                              | locked                          | `OD7-log-by-section`, Brian 2026-09-01                                                                                 | settled  |
| The log carries asks and answers alike, one entry each, grouped by section | locked                      | Owner direction, 2026-09-02: counts alone are "just not useful"                                                        | settled  |
| The log reuses the record's shipped `StatusHistory` markup           | locked                          | Owner direction, 2026-09-02, on inventing UI the app does not use elsewhere                                            | settled  |
| Item status renders as the record already renders it                 | locked                          | Plain underlined `body2`, no colour and no chip. The state name changes; its styling does not                          | settled  |
| Resolution uses the row's own `Select`, with `Reopen` added to it     | locked                          | The control ships; `R2-R` adds one option to it rather than a new control                                              | settled  |
| How far back the log reaches on first render                        | delegated to Mission Lead       | Presentation; the data is append-only either way                                                                       | settled  |
| Where `claimed` sits visually against complete                      | delegated to Mission Lead       | The state is what matters; its colour is presentation                                                                  | settled  |

## Brian approval

- Exact words:
- Date:
