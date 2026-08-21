# W7 — See who is coming, and who turned up

## What this workflow is for

One table answers the question the club actually asks about an event: **who was
asked, what did they say, and did they come?** Plus one link, so the answer can
be shared with the squad without giving anybody an account.

- **Primary actors:** an operator, and anyone holding the club link — which
  includes every coach, since coaches hold no operator account.
- **Trigger:** before the event, "who is coming?"; after it, "who turned up?"
- **Entry point:** the event's own page, and the participation view behind the
  club link.
- **User-visible result:** they know.
- **Controlling source:** Events & Calendar brief D2, D3, D62–D65, D68,
  D71–D74, D81; §4.3, §4.15; inventory amendment 1, which gave this workflow
  issuing and sharing the club link.

## The three headline numbers

**Invited · said yes · attended** (D62), at the top of the event page, large —
they are the primary operational facts and the current build renders them
nowhere.

**`Showed / Invited` reads `NA / 47` until a register has been saved** (D74).
Once one has been saved it reads a real pair — including `0 / 47`, which means
somebody took the register and nobody came. An event nobody has got round to
must not read like an event nobody attended.

The application does not explain the difference in words. The two values carry
it, and explanatory text about washouts belongs in a review artifact, not in the
product. (Brian, 2026-08-21.)

## The table

One row per person. This is what Brian asked for on 2026-08-21, and it is the
centre of the workflow.

| Column                  | Notes                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------ |
| Name                    |                                                                                      |
| Capacity                | Player · Coach · Committee · Recruit — what they are here as (`invitation_capacity`) |
| Invitation sent         | When it went, or that it has not                                                     |
| Delivery                | Whether it reached them — **operator tier only** (D3, D65)                           |
| Answer                  | Yes · No · No answer                                                                 |
| Reason                  | Their words, when they said no                                                       |
| Attendance              | Present · Late · Excused · Absent · not recorded                                     |
| One column per question | The answers `W4` now authors (D68)                                                   |

**Sortable on every column** (§4.5), and **filterable** — by name, by capacity,
by answer, by attendance, and by delivery at the operator tier. The filters
combine and apply as you type, exactly as `W1`'s do. Brian, 2026-08-21: _"I also
should have filters to only players, a filter to only yes, a filter to only no
… I can see only the nos."_

**A discrepancy marker** where RSVP and attendance disagree (D64) — somebody said yes and did not come, or came without
saying anything.

## The tiers, and the shareable link

**D2's middle tier survives.** Brian, 2026-08-21: _"The event ID shared with
anyone should be openable by anyone … Here's the list of everyone here, kind of
a name-and-shame sort of thing."_ That is the club link, and it is why it
exists.

| Tier          | Sees                                                                  |
| ------------- | --------------------------------------------------------------------- |
| Public        | The event's own facts. **No people, ever**                            |
| **Club link** | The three numbers, the table, the answers, attendance                 |
| Operator      | Adds the delivery column, the private reason detail, and every action |

- **Delivery is the only operator-locked element** (D3). A club-link reader sees
  the same table without the delivery column.
- **The link is issued and shared by an operator** (§4.15), and issuing it is
  this workflow's (inventory amendment 1). **Copy the link, and nothing else** —
  there is no send-to-WhatsApp, because the club cannot message groups
  (Brian, 2026-08-21).
- **It is not privacy-blocking** (D81). The participation data is ordinary team
  information; a squad list is not a secret from the squad. Brian's own framing
  when D81 was taken: _"if they share it outside of it, that's their own
  prerogative."_
- **Q2 — expiry, rotation, revocation — remains open by the owner's choice**,
  to be settled by testing rather than on paper. It does not block this
  workflow: a link that cannot yet be revoked is still a link, and revocation is
  additive.

## Attendance, and the panel that goes

**The "Confirm what happened" panel is removed.** On `main` today an approved
event carries _Occurrence: Not yet asserted_, _Attendance: Unavailable — opens
only after Mark occurred_, and the buttons **Mark occurred** and **Mark not
held**; an occurred event carries **Correct this to not held**.

D30 retires occurrence assertion entirely — an event is assumed to have happened
unless somebody cancels it — and the brief states that screens UX-70 and UX-75
cease to exist. `not_held` is one of the four statuses D28 removes.

**What replaces it** (D71–D74):

- **The attendance sheet opens on a buffer before the event**, approximately six
  hours. The realistic moment is standing at the pitch as people arrive.
- **It never closes.** A forgotten session is filled in days later; a mistake is
  corrected at any time.
- **An untouched sheet means "not recorded". A saved sheet means recorded,
  whatever it says.** The save is the signal.

**Attendance capture itself remains Task 04's**, and the existing board is kept:
search, RSVP and attendance filters, walk-ups, and the four states. What changes
is when it opens, and that nobody asserts anything first.

## What this workflow does not do

- **It does not capture attendance.** Task 04 owns the board; this workflow owns
  when it becomes available and how what it collected is read.
- **It does not show delivery detail.** A problem flag and a link out, both
  operator-tier (D65); the delivery page is Mission 4's.
- **It does not chase anybody.** Seeing that eight people have not answered is
  not the same as doing something about it, and the doing is Mission 4's.
- **It is not the Monday report.** That is an immutable stored snapshot and
  belongs to Mission 9.

## State transitions

**None.** Reading changes nothing. Saving an attendance sheet is Task 04's
write, on Task 04's surface.

## Exceptions and recovery

| Situation                       | Behaviour                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| Nothing has been recorded       | `Showed / Invited` reads "—", never `0 / 37` (D74)                                    |
| Everyone was marked absent      | Reads `0 / 37`. A real zero, distinguishable at a glance                              |
| The event has not happened yet  | The attendance column reads "not recorded"; the sheet is unavailable until the buffer |
| An event was cancelled          | The table survives with its answers; nobody is chased                                 |
| RSVP and attendance disagree    | Marked, never auto-reconciled                                                         |
| A walk-up attended              | Appears in the table without an invitation or an answer                               |
| A club-link reader opens it     | Same table, no delivery column                                                        |
| A public reader opens the event | Facts only. The table is not on the page and its data is not in the payload           |

## Safety, privacy, consent, and authority boundaries

- **This is the mission's most sensitive surface.** It names people, records
  what they said, and says whether they turned up.
- **The public tier never receives any of it** — not hidden in the page, not
  present in the payload behind it.
- **A private decline reason is operator-tier**, and does not reach the coach
  attendance surface merely because it exists elsewhere.
- **The club link is a signed link, not a public URL**, even though it is not
  privacy-blocking.
- **Nothing here is a judgment.** The discrepancy marker records that two facts
  differ; it does not accuse anybody.

## Repository reconciliation

Substantial parts exist and are kept:

- **The attendance board** — `[id]/attendance` — with search, RSVP and
  attendance filters, walk-up capture, four attendance states, and the counts
  Invited · Recorded · Walk-ups · Mismatches. Retained; **when it opens**
  changes.
- **The event page's audience list**, currently name and membership state.
  Becomes the full table.
- **The delivery view** — `[id]/delivery` — Mission 4's, linked from here.

Removed or changed:

- **"Confirm what happened"**, _Mark occurred_, _Mark not held_, _Correct this
  to not held_ — all retired by D30/D28.
- **"Response solicited / Response requested"** — removed by D23, through `W4`.
- **The three headline numbers do not exist** anywhere today.

**One current defect worth naming**, found in the capture: the attendance board
reports **"0 Recorded" and "30 Mismatches" simultaneously**. A mismatch against
nothing recorded is the same class of error D74 exists to prevent — an
unrecorded event reading as a bad one. Whether it is a display fault or a
counting fault is the Mission Lead's to determine; that it must not survive is
this workflow's.

## Acceptance evidence

- The three headline numbers appear on the event page, and `Showed / Invited`
  reads "—" before any sheet is saved and `0 / 37` after one is saved with
  everyone absent.
- One row per invited person, carrying capacity, invitation time, answer,
  reason, attendance and one column per question, sortable on every column.
- A club-link reader sees the table without the delivery column; an operator
  sees it with.
- An anonymous request for the event returns no person, no answer, no attendance
  and no question response, in the page or in any payload behind it.
- A private decline reason is absent from the coach attendance surface.
- The attendance sheet is unavailable before the buffer, available after it, and
  never closes.
- Nothing asserts occurrence anywhere; no surface offers _Mark occurred_ or
  _Mark not held_.
- A discrepancy between RSVP and attendance is marked and never auto-reconciled.
- A walk-up appears without an invitation or an answer.
- The mismatch count cannot be non-zero while nothing is recorded.

## Core decisions

| Decision                                                                                                        | Classification              | Governing evidence                                                                                                                            | Status                       |
| --------------------------------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Three headline numbers — invited, said yes, attended                                                            | `locked`                    | D62                                                                                                                                           | Settled                      |
| `Showed / Invited` reads "—" until a sheet is saved                                                             | `locked`                    | D73, D74                                                                                                                                      | Settled                      |
| One row per person, with capacity, invitation, answer, reason, attendance and one column per question           | `locked`                    | D68, §4.3; Brian, 2026-08-21                                                                                                                  | Settled                      |
| Every column sorts                                                                                              | `locked`                    | §4.5                                                                                                                                          | Settled                      |
| A discrepancy marker where RSVP and attendance disagree                                                         | `locked`                    | D64. Exact shape is Q4, still open with Brian and non-blocking                                                                                | Settled                      |
| **The club-link tier survives as D2 approved it** — the link carries the table; delivery stays operator-only    | `locked`                    | Brian, 2026-08-21: a shared link should open the list of everyone. Closes the question deferred from `W1`                                     | Settled                      |
| Issuing and sharing the club link belongs to this workflow                                                      | `locked`                    | Inventory amendment 1, §4.15                                                                                                                  | Settled                      |
| The club link is not privacy-blocking, but is still a signed link                                               | `locked`                    | D81                                                                                                                                           | Settled                      |
| **"Confirm what happened", Mark occurred and Mark not held are removed**                                        | `locked`                    | D30, D28; the brief retires UX-70 and UX-75                                                                                                   | Settled                      |
| The attendance sheet opens on a buffer before the event, never closes, and saved-versus-untouched is the record | `locked`                    | D71–D74                                                                                                                                       | Settled                      |
| Attendance capture stays Task 04's; the existing board is retained                                              | `locked`                    | Brief §1's scope boundary                                                                                                                     | Settled                      |
| The exact buffer length                                                                                         | `delegated to Mission Lead` | D71 calls it a tuning value, "approximately six hours", not a policy                                                                          | Delegated                    |
| Q2 — club-link expiry, rotation and revocation                                                                  | `nonblocking unknown`       | The owner chose to settle it by testing. **Handling rule:** the link ships without revocation; adding it later is additive and breaks nothing | Deferred — Brian, by testing |
| Q4 — whether the discrepancy is a column, a flag, or derived                                                    | `nonblocking unknown`       | Open with Brian since 2026-08-14. **Handling rule:** any of the three satisfies D64; the Mission Lead picks one and it can change             | Deferred — Brian             |
| Q5 — players and coaches as separate sublists on the participation view                                         | `nonblocking unknown`       | Owned by the club, not by Brian. **Handling rule:** one list, with capacity as a sortable column, until the club asks otherwise               | Deferred — the club          |

## Brian approval

- Exact words:
- Date:
