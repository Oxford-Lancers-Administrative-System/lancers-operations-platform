# LAN-157 — Who was asked, what they said, who turned up, and the club link

Status: workflow direction approved by Brian on 21 August 2026 — _"Sure, I think
that looks fine."_ and _"let's close this out and do the next one."_ — after one
round of six corrections. Verify against the current live Linear issue before
implementation.

> **Synthetic scenario data:** All displayed people, contact details, statuses,
> responses, and attendance records are synthetic and do not correspond to real
> members.

Work package `WP-participation-club-link` of mission
`M-EVENTS-CALENDAR-TARGET-STATE`, workflow `W7`. Controlling sources: Events &
Calendar brief D2, D3, D62–D65, D68, D71–D74, D81; §4.3, §4.5, §4.15; inventory
amendment 1;
[`missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/workflows/W7-see-who-is-coming-and-who-turned-up.md`](../../../missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/workflows/W7-see-who-is-coming-and-who-turned-up.md)
and its five-screen mockup.

## Purpose

Answer, in one table, the question the club actually asks about an event: **who
was asked, what did they say, and did they come?** Plus one link, so the answer
can be shared with the squad without giving anybody an account.

Shared vocabulary, authorization, responsive behaviour and cross-ticket states
are defined in [`../slice-ux.md`](../slice-ux.md) and
[`../standards.md`](../standards.md) and are not duplicated here.

## Owned screens and routes

| Screen  | Route                          | Audience                                     |
| ------- | ------------------------------ | -------------------------------------------- |
| `W7-01` | `/operate/events/[id]`         | Any general operator — before the event      |
| `W7-02` | `/operate/events/[id]`         | Any general operator — after it              |
| `W7-03` | `/e/[token]`                   | **Anyone holding the club link.** No account |
| `W7-04` | `/operate/events/[id]?share=1` | An operator with `event_calendar_management` |

The collapsed Questions section lives on `/operate/events/[id]` alongside the
table; it is not a screen of its own, for the reason Brian gave about question
authoring — _"it's ingrained in the process"_.

`W7-05` is the mockup's states panel and is not a screen: each of its four
states is one of the above in a particular condition.

## Wireframes

The approved artefact for this workflow is the mission mockup rather than an SVG
pair, and it carries both presentations side by side:
[`W7-see-who-is-coming-and-who-turned-up.html`](../../../missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/mockups/W7-see-who-is-coming-and-who-turned-up.html)
— desktop 1280 and 375px, current build against proposed, for all five screens.

## This ticket builds

- **The participation table.** One row per person: name, capacity, invitation
  sent, delivery (operator only), answer, reason, attendance, and **one column
  per event question** (D68).
- **A collapsed Questions section on the event page, showing counts** — D68's
  other reading place. Counted from the rows the table already holds, so the two
  cannot disagree, and honouring `applies_to_capacities`: a null from somebody a
  question does not apply to means "not applicable to this invitee", never "no
  answer", so those people are outside the denominator.
- **Sortable on every column** (§4.5), including the question columns.
- **Filterable** by name, capacity, answer, attendance, and — at the operator
  tier — delivery. The filters combine and apply as you type.
- **A discrepancy marker** where RSVP and attendance disagree (D64), never
  auto-reconciled.
- **The club link**: an operator issues it, copies it, and shares it. Signed,
  not guessable (D81); carries the table without the delivery column (D3).

## Explicitly not in this ticket

- **Taking the register.** Task 04 owns the board; this owns how what it
  collected is read.
- **The headline numbers and the register's buffer.** Those are LAN-152's and
  are reused, not rebuilt.
- **Delivery detail.** A state and a link out, both operator tier (D65); the
  delivery page is Mission 4's.
- **Chasing anybody.** Seeing that eight people have not answered is not the
  same as doing something about it.
- **Revocation, expiry or rotation of the club link.** Q2 is a nonblocking
  unknown the owner chose to settle by testing. The link ships without
  revocation; adding it is additive.

## The tiers

| Tier          | Sees                                                                   |
| ------------- | ---------------------------------------------------------------------- |
| Public        | The event's own facts. **No people, ever**                             |
| **Club link** | The three numbers, the table, the answers, the reasons, the attendance |
| Operator      | Adds the delivery column, the joining URL, and every action            |

**Delivery is the only operator-locked element of the table** (D3), and the
approved mockup gates exactly one `<th>` on the tier. The **Reason** column is
present at both tiers: `${operator ? "<th>Delivery</th>" : ""}` sits in the same
line as an ungated `<th>Reason</th>`, and REQ-three-tiers says delivery is the
only element the middle tier loses. W7's prose tier table also lists "the
private reason detail" as operator-tier; where the two disagree the live issue
and the approved mockup win, and this is recorded as a deviation worth Brian's
eye rather than resolved silently.

**Authorisation is enforced in the service layer, never by route visibility.**
`src/lib/services/participation.ts` has three entry points and each resolves its
own actor: the operator read asks `requireGeneralOperator()`, the club-link read
resolves the **token** and consults no session, and issuing asks for
`event_calendar_management`. The two payload types differ structurally — the
club-link person has no `delivery` field and the club-link event has no
`joiningUrl` key — so neither can reach that tier by a rendering mistake.

## Ticket interaction contract

- Implement every owned screen and the loading, validation, error, success,
  completed, empty, and unauthorized states that apply under the shared
  contract.
- Preserve the desktop and phone information hierarchy shown in the mockup. At
  375px the table becomes one card per person and **carries every fact the
  desktop row does** — reflow may not remove required information.
- **A filtered-empty table and an empty one say different things**
  (`slice-ux.md` § 9).
- Do not add a role, tier, column, filter or action without a recorded decision.
- The copy rule, from Brian, five times on this mission: the application says
  what a control does and what its consequence is. It never explains its own
  design, never justifies a default, and never instructs the operator to use a
  different field.
- In implementation review, provide LAN-157, the implemented screen IDs, desktop
  and 375px screenshots, acceptance-criteria results, and every deviation.

## Acceptance criteria

- One row per invited person and per walk-up, carrying capacity, invitation
  time, answer, reason, attendance and one column per question.
- Answers are read in **two** places: counts in a collapsed Questions section on
  the event page, and one column per question in the table. The counts exclude
  anyone the question does not apply to, and exclude walk-ups.
- Every column sorts, and a sort carries the current filters.
- Each of the five filters narrows the rendered rows, and they combine.
- A club-link reader sees the table **without** the delivery column; an operator
  sees it with. Asserted on the payload, not on the rendered text.
- No club-link response carries an online event's joining URL, in the page or in
  any payload behind it.
- An anonymous request for the event returns no person, no answer, no attendance
  and no question response.
- A discrepancy between RSVP and attendance is marked and never
  auto-reconciled — and the marker is present during the session, not only the
  day after.
- A walk-up appears without an invitation and without an answer.
- Sharing offers the link and nothing else. There is no send-to-WhatsApp,
  because the club cannot message groups.
- The club link is signed rather than guessable, stored only as a digest, and is
  the **same** link each time an operator opens the dialog.

## The two delegated determinations

- **Q4, the discrepancy marker's shape.** **Derived** from the two columns, and
  rendered as `≠` beside the name carrying what the two records say. The
  approved mockup derives it and marks a case the stored view does not classify;
  the stored view flags nothing until the event's date has passed, so a derived
  marker is the only one present while the register is being filled; and a
  derived marker has no row to auto-reconcile. `src/lib/services/participation-view.ts`
  carries the reasoning next to the function.
- **Q5, players and coaches as separate sublists.** **One list, with capacity as
  a sortable column and a filter**, until the club asks otherwise. Owned by the
  club, not by Brian.

## Deviations from the approved mockup

1. **The share dialog's second paragraph is not shipped.** The mockup carried
   "It is a private link, not a secret one — a squad list is not a secret from
   the squad. Share it where you would share the squad." That is D81's
   _reasoning_, and reasoning is the copy shape Brian has rejected repeatedly on
   this mission. The dialog keeps the sentence that states the consequence.
2. **`Showed / Invited` reads `— / 47`, not `NA / 47`.** LAN-152 owns that
   formatter and shipped the dash; W7 records both spellings, and the approval
   note says `NA`. Reusing LAN-152's formatter is what keeps the event page and
   the club link identical (`standards.md` rule 7), so the spelling is reported
   rather than changed here.
