# UX standards — the rules that bind every user-facing change

Status: **derived from defects already found on screen**, LAN-141
Applies to: **new and changed** user-facing code, in every slice, from now on
Conformance today: **Administration surfaces only** — see [Where this holds today](#where-this-holds-today)

[`slice-ux.md`](slice-ux.md) is the approved **workflow direction** for the first
operational vertical slice: which routes exist, what each one is for, what the
club calls things, and what is out of scope. It answers "what should this screen
do?".

This document answers a different question — "what must be true of any screen,
whatever it does?" — and that is why it is separate. Its rules are not scoped to
the slice, they do not expire when the slice ships, and none of them was
invented. Every one below was written down because a screen in this repository
broke it, a human found it, and the same shape then turned up somewhere else.
That is the bar for adding an eighth: a rule earns its place by having already
cost something.

> Nothing here supersedes anything. The authority order in
> [`slice-ux.md` §1](slice-ux.md#1-authority-and-governance) is unchanged: live
> Linear and recorded owner decisions first, then binding repository
> instructions and architecture documentation, then the UX contract, then the
> owning ticket contract, then the named SVG. These are constraints inside that
> order, not a new source above it.

## How to use this

Read it with the ticket contract, before writing the screen. Six of the seven
are cheap while the component is being written and expensive afterwards, because
each of them is a shape rather than a string: they are about what the screen
does when something is missing, stale, refused, or already on the page.

Each rule below carries **what it cost**, which is the part worth reading. A
rule with no story behind it is a style preference, and this file is not for
those.

## Where this holds today

These are standards for what gets written next. They are **not** a statement
that the existing codebase already conforms, and the difference matters: a page
claiming conformance the repository does not have is worse than no page, because
it stops people looking.

An earlier version of this document said it applied to "every screen in this
repository, in every slice". That was not true when it was written. Independent
review found the counter-example immediately, in the rule with the sharpest
story attached:

- **Rule 3, `src/app/operate/roster/presentation.ts:145`.** `formatDay()`
  returns its input **raw** when the value will not parse — precisely what rule
  3's own story calls the wrong first repair.
- **Rules 3 and 6, `formatWhen()` at the same file, `:134-140`.** No `NaN`
  guard, so an invalid `Date` throws `RangeError` out of `Intl.DateTimeFormat`
  and takes the server-rendered page down. That is the exact crash shape both
  rules exist to prevent.

Neither is reachable in practice today, because both values arrive from `date`
and `timestamptz` columns that cannot hold an unparseable value. They are
recorded here rather than fixed because fixing them is a change to the roster
surface, which is not this package's, and because an honest gap is more useful
than a quiet one.

The Administration surfaces conform, and every row of the table at the foot of
this page was verified by deliberately breaking the rule and watching a named
test fail. Bringing another surface under these rules means doing the same for
it — not extending this sentence.

---

## 1. One action's result at a time

Starting an action clears the previous action's result. Two outcome messages are
never on screen together, and a result never outlives the thing it describes.

**What it cost.** The role detail screen runs two actions on one panel: a search
that _asks_ something and a submit that _changes_ something. Only the second was
registered in the outcome slot, so a failed search sat directly above a fresh
confirmation and both read as current. An administrator could see "nobody
matches" and "role assigned" at the same time, about the same panel, and neither
was wrong — they were just from different moments.

**In practice.** Every action that produces a message claims the slot when it
starts, not when it finishes. A panel with two actions has two registrations,
because the rule is per action, not per panel.

## 2. Current state is the headline; scheduled information is context

What is true **today** is always first and is never replaced. What is recorded to
happen later goes beside it, never instead of it. This applies to holders,
states and dates alike.

**What it cost.** A seat nobody holds today, whose successor starts in September,
read as though the successor already held it. The other direction was just as
wrong: the club's Head Coach vanished from the Roles index because the code that
drew the cell consulted the operating cycle _before_ it consulted the holders,
and the cycle had closed while the appointment continued.

Brian's ruling, 20 August 2026, was both directions at once: "I like showing the
successors and also showing people when they go." The point is not that future
information is decoration — it is that he does not want to discover a seat is
uncovered on the day it empties, and does not want to discover somebody has left
after they have gone. Both complaints are about being surprised by a date the
club already knew.

**In practice.** A cell that has a current answer prints it, then appends the
scheduled one. A cell with no current answer says so in its own words —
**Not assigned** — and then names who arrives and when. Absence of a container,
a cycle or a parent record is the _last_ thing consulted, never the first.

## 3. Never show a raw ISO date

Rendered dates read `27 Aug 2026`. A recorded moment reads `27 Aug 2026, 14:22`,
on club time. A value that cannot be parsed says so in words; it is never
printed raw and never printed as `Invalid Date`.

**What it cost.** Three shapes reach these screens and they are not
interchangeable: a stored calendar date (`2026-08-18`, no time and no zone), an
ISO instant, and a `Date`. Reading an instant as a calendar date built
`new Date("2026-08-20T00:39:14.123Z" + "T00:00:00Z")`, which is an invalid date,
which threw out of `Intl.DateTimeFormat` and took the whole server-rendered page
down. The first repair — print the raw value instead — was wrong in both
directions: `"2026-13-45"` reached the screen unchanged, and an invalid `Date`
reached it as the string `"Invalid Date"`, on pages where every other date read
`27 Aug 2026`.

**In practice.** Formatting goes through the shared formatters, which decide the
zone from the shape. One unreadable row must not take the other twenty with it.

## 4. A disabled control says what would enable it

A control the screen has disabled carries one sentence naming the step that
enables it. A disabled button with no explanation is a dead end, and reads as a
broken page rather than as a rule.

**What it cost.** The assign panel's submit button was disabled until a person
was chosen, which is correct. Nothing said so. On the path where the search
returned nobody, the button could never enable at all, and the screen offered no
hint that this was a rule being enforced rather than a page that had failed.

**In practice.** The sentence names the step, and changes with the state: "find
the person above and choose them to enable this" before a search, "choose the
person above to enable this" once there are candidates to choose from.

## 5. A failed search offers a way forward

An empty result names what was searched for and links to the action that
resolves it. It never states a constraint and stops.

**What it cost.** "Nobody in the club's records matches" was a true and complete
statement of a real rule — a seat goes to somebody the club already holds a
record for — delivered on a screen with no route to create that record and a
submit button that could never enable. Worse, the search form reset itself after
running, so the result appeared beneath three blank fields with no way to tell
what had been searched for, and refining a near miss meant retyping all of it.

**In practice.** Hold search terms in state so they survive the form reset, echo
them in the empty result, and carry the link to the flow that creates what is
missing. Say why the near miss found nothing when the matching rule explains it
— here, that the search matches whole names and whole addresses.

## 6. Refusals are messages, never stack traces

A guard firing correctly is not an error page. An expected refusal — no
permission, no operating year, a record that does not exist — renders as a
sentence on the screen the person was already on.

**What it cost.** `committee_years.ends_on` is exclusive, so a club that closes
one committee year the day before the next opens has a gap. That gap is an
ordinary Monday. It took every Administration screen down.

The same rule applies below the screen: a script that refuses a destructive
action should print its reason and exit, not throw a stack trace at somebody who
is about to retype the command.

**In practice.** Distinguish "this cannot be shown" from "this failed". The
first is content and belongs in the panel; the second is an error boundary. A
missing parent record, an empty cycle, a `null` the schema permits — all of
these are content.

## 7. Every fact shown on more than one surface says the same thing

When two screens answer the same question, they answer it identically, and a
test pins them to each other. Two readers deriving one fact is a design
decision, not an accident, and it is exactly the kind of duplication that goes
quietly wrong.

**What it cost.** "Who holds this seat" is answered in three places: the Roles
index, role detail, and the Operators index. Under a season marked `closing` —
an ordinary status every season reaches — the Roles index read "No season under
way", role detail named the live holder, and the Operators index printed a third
answer. All three were reading the same database at the same moment.

One predicate caused it. The catalogue asked whether an assignment _overlapped
the operating cycle_, where every screen reading it asks who holds the seat
_today_.

**In practice.** Where a fact is derived twice for a real reason — twenty
transactions to draw one page is not a design — the two derivations are pinned
to each other by test, on data staged to include the cases a naive filter gets
wrong: a holder whose access is deactivated, an assignment that ended earlier in
the year, and a successor who has not started. Pin the readers the **pages**
call. An agreement test against a reader no screen uses proves the wrong pair.

---

## What binds these

A rule that only holds by inspection is a rule that drifts, so each of the seven
is carried by a test rather than by this page:

| Rule | Bound by                                                                                  |
| ---- | ----------------------------------------------------------------------------------------- |
| 1    | `src/app/operate/admin/outcome.test.tsx` — one slot, claimed on start                     |
| 2    | `src/app/operate/admin/presentation.test.ts` — holders before cycle, in both directions   |
| 3    | `src/app/operate/admin/presentation.test.ts` — the three shapes, and the unreadable value |
| 4    | `src/app/operate/admin/screens.test.tsx` — the enabling sentence, in both its states      |
| 5    | `src/app/operate/admin/screens.test.tsx` — the empty result names its terms and its route |
| 6    | `src/app/operate/admin/screens.test.tsx` — a missing cycle renders content, not an error  |
| 7    | `src/lib/services/administration-directory.test.ts` — the readers the pages actually call |

This page is the reasoning; those files are the enforcement. If one of them is
deleted, the rule it carries is unbound however clearly it is written here.
