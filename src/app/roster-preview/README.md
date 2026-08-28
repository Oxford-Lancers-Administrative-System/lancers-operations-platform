# Roster fidelity mockup — read this before you build W5 or W6

**Branch:** `chore/roster-fidelity-mockup`, cut from `origin/main` at `8484c28`
(LAN-182, the person substrate). **Never merged, and never to be merged.**

**Run it:** `npx next dev -p 3210`, then open
<http://localhost:3210/roster-preview>. No login, no Supabase, no database
lease — which matters, because the mission's own packages hold theirs.

---

## What this is

A **running** mockup of `W5` (the roster board) and `W6` (one player's record),
built so the interaction model can be driven rather than inferred.

It exists because the approved W5 review was photographed at two scroll
positions. Three Season columns — Status, Entry, Positions — appear in **no
frame at all**, and the single biggest change in the workflow, that this surface
now *writes*, in the cell, with no save button, has **no picture anywhere**.
`W5-05`'s deltas say "Positions is shown open"; the photograph shows dashed
placeholders. So the behaviour was specified in prose and never seen.

Now you can click it.

## What this is **not**

- **Not the implementation.** Do not copy it wholesale into
  `src/app/operate/roster/`. It is a reference for *how it should feel*, not a
  source of code.
- **Not an authority.** Where it disagrees with
  `missions/intake/M-PEOPLE-AND-ROSTER/workflows/W5-work-this-seasons-roster.md`,
  `…/W6-open-one-players-record.md`, or `…/field-inventory.md`, **those win.**
- **Not authorized.** It sits outside `/operate` because that prefix is
  protected in `src/proxy.ts` and its layout resolves a real operator against a
  real session. A mockup needing a login and a database lease is a mockup nobody
  opens. The consequence is stated plainly: **this page has no authorization and
  must never carry a real record.** That is fine on a branch that is never
  merged, and it is the reason this branch is never merged.
- **Not a complete column set.** Illustrative. Twenty columns where W5 approved
  eighteen (see below).

---

## What's on the board (`W5`)

**Twenty columns in three labelled, tinted bands**, wide, scrolling sideways,
Player column pinned so a row stays identifiable at column sixteen.

| Band | Columns |
| --- | --- |
| **Person** (slate) | College · Matric · Grad · Degree · Contactable · Missing |
| **Onboarding** (amber) | Onboarding — one column, deliberately lonely; Mission 7 adds the rest |
| **Season** (blue) | Status · Entry · Offence · Defence · Special teams · Blue # · White # · Coach group · Formalwear · Blues · Eligibility · Availability |

Bands are **labelled**, so colour never carries the meaning alone — the
condition Brian attached when he asked for the grouping.

**It writes.** Season cells edit in the cell: one click opens, the change commits
on its own, no save button, no confirmation, a dropdown only where the value set
is fixed. Every commit writes an audit event — actor, timestamp, field, before,
after — **and asks no reason**. Person cells render, carry `edit on the record`
under the header, and route to the person record where `W2`'s rules apply.

**Filtering is three cooperating parts**: a pinned set (Status, Availability,
Missing onboarding data); a funnel in every other column header; and a
`Filtered by` chip bar with `Clear all`. A pinned control and its column header
are **one filter with two controls**, each reflecting the other.

The board **opens already filtered**, with `Coach group: Offense` set on a column
far off to the right. That is deliberate — it is the case the chip bar exists
for. Without the bar the board looks mysteriously short with nothing to say why.

## What's on the record (`W6`)

Clicking a player name opens one season's membership in full: **Person ·
Onboarding · Season**, banded in the board's own three colours so the two
surfaces read as one product and a field's group is never a guess.

The page's whole job is telling a **durable person fact from a seasonal one**. A
dotted underline means *changed elsewhere*; a solid one means *changed here*.
A durable fact is editable in **exactly one place** in this mission, because
three edit paths writing one field would mean `W2`'s reason-and-supersede rule
either followed them everywhere or quietly did not apply. You can see the
difference in the history section: the `Personal email superseded` row carries a
reason, the season changes do not.

Also honoured, because each was a recorded decision rather than a guess:

- **Date of birth and emergency contact render here and on no list** (Task 08 §6).
- **Blues total and constitutional membership are derived** across seasons, not
  stored. Half and Full Blue are seasonal awards.
- **Formalwear is seasonal**, reasked each season, never carried forward.
- **Onboarding items edit like any other value.** The per-item `Resolve … ▾` /
  `SAVE` pair was retired 2026-08-27. Per-item provenance is shown, not just the
  state.
- **A departed or archived membership renders complete and read-only**, with the
  activation control **absent rather than disabled** — a disabled control invites
  the question of how to enable it; an absent one answers it.
- **A membership with no onboarding items says so in its own words**, rather
  than reading as incomplete.

---

## Three things worth stealing outright

**1. The column model is data, not markup.** `columns.ts` drives banding,
pinning, sorting, filtering, widths, which cells edit in place, and which
capability gates a column. Adding a twenty-first column should be one entry in
`COLUMNS`, never a new `<TableCell>` in four places.

**2. Grant-driven column visibility is real, not theoretical.** Toggle
`availability_read` off in the preview strip and the Availability column and its
pinned control are **gone from the DOM**, not greyed. That is the LAN-75
contract: what a viewer's grants do not cover is absent from the DOM *and the
payload*, never hidden in it. Build it that way and widening access later drops
restricted columns automatically instead of needing a special case.

**3. The jersey picker is the interesting one.** See below.

---

## Jersey numbers — the part that took the most thought

`jersey_assignments` has existed since the domain baseline. The seed writes rows.
**Nothing in `src/` reads or writes it** — no service, no route handler, no UI.
There was no behaviour to copy, so this is new.

The rules the mockup enforces, all of them read off the schema:

- **A picker over all 99 numbers, never free text.**
  `jersey_assignments_number_range` allows 1–99 and nothing else, so free entry
  can only ever produce a value the database refuses. And a text field can tell
  you a number is taken only *after* you type it. A list says so before.
- **Multi-value per kit.** Uniqueness is on `(season, kit, number)`, **never** on
  `(membership, kit)`. Holding several numbers in one kit is the designed case —
  about 8% of the club's records do it — not an exception to code around.
- **A number held by another player is ticked, named, and cannot be clicked.**
  There is deliberately no take-it-from-them gesture. To free a number you go to
  the player holding it and untick it there, so a swap is two deliberate acts by
  an operator who has seen both sides, rather than one click that strips a number
  off somebody who is not on screen. The holder's name is on the row precisely so
  the operator knows where to go.
- **The holder map is built from every row, never the filtered view.** A number
  worn by a Departed player, or by somebody the current filter has hidden, is
  still issued.

This is the surface form of **invariant S2** — the GiST exclusion constraint over
`(season, kit, number)` among concurrent assignments. The database refuses the
collision either way; it refuses it with a Postgres exclusion violation, which is
not something a person can act on. Three layers, and only one exists today:

| Layer | Status | What it does |
| --- | --- | --- |
| Database | **built** | Refuses the insert, unreadably |
| Service | **not built** | Should check first and return an error naming the holder |
| UI | **not built** | Should not offer a taken number at all |

---

## What the mockup deliberately gets wrong

Do not read these as design. They are simplifications, and each one is a real
decision you will have to make.

**Effective dating.** This is the big one. `jersey_assignments` and
`position_assignments` are **effective-dated**: unticking a number should mean
`effective_to = <date>`, and ticking should open a **new** assignment, so last
month's number stays answerable (invariant S4, history preserved rather than
overwritten). **The mockup just drops the row.** Real unassignment preserves
history; this does not.

**`is_predominant`.** Absent. One number per kit is the one the club reports
against, enforced by a partial unique index. Choosing it belongs on player detail
with the fuller editor, not in a grid cell.

**A view switch, not a route.** Clicking a name swaps the view; it does not
navigate. The real page is `/operate/roster/[membershipId]` and **should be** —
but both surfaces here share one set of rows, one jersey holder map and one audit
stream, and navigating away would need a store to keep that true. The shared
state is the thing worth demonstrating: a number taken on the record is taken on
the board, and every edit lands in the same audit panel.

**The audit panel is scaffolding, not a screen.** The real event goes onto the
person's change history so a season change made on the board is answerable in the
same place as a correction made anywhere else. The dashed panel exists because
"every commit writes an audit event" is otherwise an invisible claim.

**The position lists are hardcoded.** `position_vocabularies` is a **table**, and
invariant S3 makes a position's vocabulary a foreign key to the season's own. In
the real implementation these come from the database per season. The mockup
hardcodes `VOCAB_2026`; you should not.

**Fixtures are not the seed.** Fifty invented players, deterministic, in
`fixtures.ts`. Not real club data — LAN-86 keeps that out of every environment.
Seven carry a first name only, which is a real case in this club's data and the
reason the Player column has to stay readable when the name is one word.

---

## Deviations from the approved W5/W6, and why

| Change | Reason |
| --- | --- |
| **Twenty columns, not eighteen** | Brian split `Positions` into Offence / Defence / Special teams on 2026-08-28, each multi-tick, so a side is ticked without opening a combined list |
| **Blue # / White # are pickers, not free text** | Brian, 2026-08-28. W5 had them as free entry; see the jersey section above |
| **The column filter is a funnel in a bordered button** | The caret read as punctuation and competed with the sort arrow. Brian chose this shape 2026-08-28 from four options |
| **Band labels are sticky** | `W5-05-proposed-desktop.png` shows the Season group as an unlabelled blue strip because the label had scrolled off — colour then carries the meaning alone, which is the one condition Brian attached to approving the grouping |
| **Person-first column order kept** | Approved as drawn. The cost is recorded in `acceptance/W5.md`: Status and Entry are what an operator scans and now sit furthest from the name. Kept so the cost stays visible rather than quietly fixed |

**The club's real position vocabulary**, used here and not invented — `VOCAB_2026`
in `scripts/seed-local.mjs`, the OULAFC list of the term-card era adopted
2026-08-01:

- **Offence (8):** WR · TE · WB · T · G · C · QB · RB
- **Defence (5):** CB · NT · LB · E · S
- **Special teams (4):** KO · KR · PUNT · FG

Note `scripts/production/showcase/plan.mjs` carries a slightly different set — it
adds `FB` Full Back and writes Nose Tackle as `N/T`. That is the production
showcase's reference data, **not this season's vocabulary**.

---

## Open questions this mockup surfaces but does not answer

1. **What date does a commit stamp?** Editing a season fact has to close one
   effective-dated row and open another. Today? Season start? Nobody has decided.
2. **What happens when a number is taken?** The mockup refuses. Refusing, offering
   to take it, and flagging a conflict the way imports do are all defensible; only
   the first is drawn.
3. **The field inventory names a jersey notes field that does not exist** on
   `jersey_assignments`. Reconcile before building against the wrong one.
4. **Invariant S1 versus multi-tick positions.** The schema comment says at most
   one *current* assignment per slot, so one offence and one defence position.
   The mockup allows several per side because Brian asked for multi-tick on all
   three (2026-08-28). Worth settling deliberately.
5. **`Onboarding → Onboarding` in the status history** — carried, not settled, in
   `acceptance/W6.md`. The enum migration maps `carried_forward` and `confirmed`
   onto the same rung.

---

## File map

| File | What it holds |
| --- | --- |
| `columns.ts` | The column model — bands, widths, edit kinds, value sets, grants, jersey numbers, the position vocabulary. **Start here.** |
| `fixtures.ts` | Fifty deterministic players, onboarding items, past seasons, status history. Stands in for the service layer. |
| `roster-board.tsx` | `W5` — the board, filtering, sorting, in-cell editing, the audit stream, the phone cards |
| `player-record.tsx` | `W6` — the record, banded sections, in-place editing |
| `jersey-picker.tsx` | The 1–99 picker, shared by both surfaces so one rule is enforced once |
| `preview-shell.tsx` | Preview scaffolding — the grant and empty-season switches |
| `page.tsx` | The route, reusing the real `ShellNav`, theme and header |

## Commits

```
fe49333  Give the record the board's multi-select, not a lesser one
6ebaa54  Add the player record behind a name on the board
34466ec  Issue jersey numbers from a list, never free text
2b67706  Break positions into one column per side
18e5716  Make the per-column filter read as a control
2a5c159  Add a runnable fidelity mockup of the W5 roster board
```

Each message carries the reasoning for its change. `npx tsc --noEmit` is clean
for this directory, and the browser console is clean on both surfaces.
