# LAN-217 — The operator's view: one player's onboarding record, settling a disputed fact, and activation

**Workflows:** `W6 — One player's onboarding record`, `W7 — Settle a disputed fact` (**retired — see below**), `W10 — Activate a player`
**Routes:** `/operate/roster/[membershipId]` (LAN-187's shipped record, deepened), `/operate/people/[personId]` (LAN-184's shipped record — no longer deepened by this package; see W7 below) — no new route
**Shared contract:** [`../slice-ux.md`](../slice-ux.md) · [`../standards.md`](../standards.md) · [`LAN-187-player-record.md`](./LAN-187-player-record.md) (the record this package's W6 and W10 deepen)

## Why this contract exists

`missions/packets/M-ONBOARDING-AND-INFORMATION-COMPLETION/packet.json`,
`missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION/workflows/W6-*.md`,
`W7-*.md` and `W10-*.md`, and their `acceptance/W6.md`, `W7.md` and `W10.md`
records are the approved design — the packet, not Linear, is the durable
record of the decision, and Linear is not a durable repository contract. This
records what was actually built from them, at LAN-217's own head — **W6 and
W10 as approved; W7 as originally approved and then retired**, per the
mission's owner-question `Q-9` (Brian, 2026-09-04), before this package's
own draft PR left review. Two of the three workflows deepen a shipped
surface; W7 draws nothing at all any more.

## W6 — the Onboarding section, `/operate/roster/[membershipId]`

Nothing new is drawn. `OnboardingRow` (in `record-view.tsx`) keeps its own
`Select`, its own `Required`/`Never blocks activation` chips, and its own
underlined-`body2` status text; three things change inside that same shape.

**`Reopen` joins the row's own `Select`** (`OPERATOR_ITEM_RESOLUTIONS` in
`membership.ts` already accepted it; only the UI's own three-item list was
narrower). Offered unconditionally, exactly as the approved `W6-02` screen
shows the menu — the service itself refuses a `reopen` on an item that is
not already resolved (`onboarding_item_reopen_requires_a_resolved_item`),
surfaced through the row's own error slot rather than a disabled option.

**The waive reason is gone, not merely optional.** `W6-02`'s approved screen
shows the menu with no reason field anywhere in it. `REQ-reason-free-waive`
only ever made the reason _optional_ on the service side (the substrate,
LAN-214, already unwound `onboarding_items_waiver_is_justified`); this
package reads the mockup's silence on the field as the instruction to remove
it, so Waived now commits the moment it is chosen, exactly like Complete and
Not applicable. The author is still the verified four-role operator this
page's own gate resolves.

**`claimed` renders in the row's existing idiom** — the same underlined
`body2`, the state name changed, no chip and no colour of its own — matching
"item status renders as the record already renders it" (locked in
`acceptance/W6.md`).

**The provenance note is rebuilt from the item's own append-only history**
(`onboarding_item_history`, LAN-214) rather than the current row's four
columns alone. It states who and when for every state (not only
`completed_on`), a compact trail of earlier transitions when there are any
("Reopened by Caspian Hallowfield, 4 Sept · waived 4 Sept"), and — the
literal text of `R2-V` — attributes a **confirmed** trust-class item to the
player who actually claimed it, found by walking back through the item's own
history for the `claimed` transition, rather than to whichever operator
later clicked Complete. Never a narrative sentence: every clause is an actor
and a date, or a state word and a date (the acceptance correction that
struck "nothing here blocks anything, ever" from the draft).

**A new Activity section renders the sectioned ask/answer log**
(`onboarding_activity_log`, LAN-214) using the record's own `StatusHistory`
markup — a bordered entry, a bold label, a line, a caption — with the bold
label carrying the section name and the entries themselves grouped by
section, newest first, one row per ask and one per answer, individually,
never a count (`OD7-log-by-section`, and Brian's own correction of the first
counted draft, both quoted in `acceptance/W6.md`). The caption states when,
how (the channel) and who, which is `REQ-activity-log`'s own wording.

Placement: Person → Onboarding → **Activity** → Season → Attendance → Their
other seasons → Status history, a naming/placement choice within the
freedom the brief grants (the mockup's own screenshot tooling borrowed the
Status History section for its demonstration, since only one history-shaped
section existed on the page before this package; the two are semantically
distinct and both now exist).

## W7 — retired before this package's own draft PR left review

W7 as approved built a disputed-fact raise-and-resolve surface on
`/operate/people/[personId]`: a player's contested answer sat beside the
club's own value with a four-role Keep/Take control, both values kept,
`REQ-no-silent-overwrite` naming the whole mechanism. It shipped once, in
this package's own first commit, and was walked once at that head.

**Brian withdrew it on sight**, recorded verbatim as `Q-9` in the mission
journal (2026-09-04): "I don't think the disputed fact mechanism survives
at all. I think that gets gone." His reasoning: where the club holds no
value the player's answer is obviously the value, and where the player
names a different value for their own fact the player's answer should win
outright, with the audit history — which the person record already
renders — carrying what changed. `REQ-no-silent-overwrite` is superseded;
last-write-wins is the rule now, for exactly the seven person facts W7 once
contested.

**What ships instead, on the same person record:** nothing new at all. A
player's answer overwrites the operator-recorded value directly, through
the same ordinary `updatePersonField` write and the same `person_<field>_
updated` audit row every other correction on this page already produces.
No disputed state, no second contested value anywhere in the UI, no
resolve control, no note field. The record's own shipped audit history is
the entire answer to "what changed and who said so" — nothing this package
had to add.

**What is still true, and is not this section's concern:** `person_fact_
disputes` remains in the schema, unused going forward — no migration
retired it, since a live table with no active writer is not a schema
problem, and this package's own owner-question record (`Q-3`/`Q-4`/`Q-5`)
separately assigned closing its _merge_-time re-point gap (a colliding pair
of open disputes on a merge, from before Q-9) to this same package; that
merge-time handling is real, tested, and described under "BPS,
T07-merge-precedence, and closing two merge exclusions" below. It is
about historical rows a merge might still encounter, not about anything a
player or operator can raise today.

## W10 — activation

No code change. The shipped Season section's Status field
(`setMembershipStatus`, unchanged since `Q-12` removed the transition table)
already flips through every status with no confirmation step, and the
Onboarding section already sits directly above it on the same page as
context — exactly what `acceptance/W10.md` records as settled, with no
decision left open. This package's own contribution is proof rather than
code: a test that activates a membership with an outstanding required item
present and asserts no dialog appears and the outstanding alert is
unchanged, alongside the existing, untouched `membership.test.ts` coverage
of the same rule at the service layer.

## BPS, T07-merge-precedence, and closing two merge exclusions

Three items the mission's owner-question Q-2/Q-3/Q-4/Q-5 assigned to this
package, added to the same branch and PR after the packages above were
already drafted. None of the three draws an approved screen — all three are
governed entirely by application convention, per the same questions that
assigned them.

**BPS — a plain yes/no roster attribute (`roster-board.ts`, `board-columns.ts`,
`board-actions.ts`, `roster-board.tsx`).** Item 5 of the item-and-ask
inventory deliberately left the onboarding checklist to become a roster
attribute (Brian, 2026-09-01: "We are going to add it here into the roster
for the BPS column"). It has no approved mockup, so it mirrors — column
placement, `select` edit kind, four-role `requires`, the commit-on-choice
server action — exactly how the sibling seasonal attributes `blues_awards`
and `formalwear_records` already work on the same board. It is a `bps`
column on the roster board only, never an onboarding item: it does not touch
`onboarding_item_types`, `generateOnboardingItems`, or any checklist count.

**The roster board's seven onboarding columns, and their per-item words
(`onboarding-item-shapes.ts`, `board-columns.ts`, `board-data.ts`,
`record-view.tsx`).** Correction round 2 cloned the seven operator-ticked
items (Subscription invoiced, Subscription paid, Kit Distributed, BUCS Play,
Hudl access, Squad photo, Comms group) onto the board as columns, each
committing through `resolveOnboardingItem` exactly as the record page's own
row does. Brian's second walkthrough (`Q-14`, correction round 3) found the
column offering and displaying statuses its own item could never actually
occupy ("Invited" on Sub invoiced, Sub paid and Squad photo) and named the
word each item should show instead — settled in this correction round
(round 5): `itemStatusLabel`/`itemResolutionLabel` in
`onboarding-item-shapes.ts` are the one place both the board and the record
page read a status's word from, per item — "Invoiced"/"Not invoiced" for
Subscription invoiced (never the generic "Complete" the board showed
before), "Paid"/"Not paid" for Subscription paid, "Yes"/"No" for Kit
Distributed and Squad photo, "Not assigned"/"Assigned and invited"/"In the
group" for Comms group, "Not invited"/"Invited"/"Claimed"/"Confirmed" for
BUCS Play and Hudl access, and "Not signed"/"Signed" for Code of Conduct and
Photo release (record page only — the two are player-signed, not
operator-ticked, so they are not board columns). `Waived`/`Not applicable`
stay the shared escape-hatch words on every item but Kit Distributed, which
alone has none; `Reopen` reads as the generic word everywhere except Kit
Distributed's own two-state control, which reads it as "No" rather than a
third word for what its own "No" already says.

**Column order (Brian, 2026-09-05).** BPS sits immediately before
Availability, and Availability is the last column on the board.

**T07-merge-precedence (`person-merge.ts`, `merge-comparison.tsx`).**
`season_messaging_consents` is unique on `(person_id, season_id)`; merging
two people who both hold a consent row for the same season must choose one,
and the locked recommendation is that the survivor takes the **most
restrictive** of the two states — if either side says `refused` or
`withdrawn`, the survivor is `refused` or `withdrawn`, never the more
recent, permissive one. Consent is permission to contact somebody, and a
merge is record-keeping, not a fresh ask. Between two equally restrictive
states, the more recent decision governs (the same rule a person's own
re-answer already follows). Surfaced as one more read-only row in the
merge comparison's existing field-by-field list — no new component.

**Closing two more per-tuple-unique re-point exclusions
(`person-merge.ts`).** `onboarding_agreements` (`person_id, season_id,
agreement_type`) and `person_fact_disputes` (at most one OPEN row per
`person_id, field`) were both documented, tracked gaps in the merge's own
blind re-point list. Neither carries a restrictive/permissive axis the way
consent does, so each closes on its own nearest precedent already in this
module: a colliding agreement keeps the earlier `agreed_at` (the same
"earliest date is the real one" rule the prospect combination already
applies to a first-contact date); a colliding pair of open disputes on the
same field keeps the more recently raised one in place, superseding the
older exactly the way a single person's own repeated answer already
supersedes itself (`raisePersonFactDisputeIn`'s own upsert) — never
auto-resolved, since resolving a dispute is a four-role decision this merge
does not make on anybody's behalf. Neither gets a comparison-screen line:
the mission owner-question asked only that the exclusion close, not that a
screen be added.

## What is deliberately not here

- **No new component, anywhere.** Reopen is one option on a shipped
  `Select`; the Activity section reuses the shipped `StatusHistory` markup.
  W7 once extended the shipped `Fact`/`By` with a disputed-fact row and a
  resolve control; both are gone (see W7 above) — a player's answer now
  overwrites the same `Fact` row through the record's own existing write
  path, nothing drawn for it at all.
- **No reason field, anywhere in this package.** Not on the item `Select`
  (waived commits immediately). W7's own resolve control, which also drew
  none, no longer exists to name here.
- **No confirmation step on activation.** `Q-12` settled this on Mission 5's
  own walkthrough; re-litigating it here was named as out of bounds.
- **No change to `src/app/operate/roster/membership-actions.tsx`.** The
  board's own inline resolve editor (`OnboardingItemForm`) still requires a
  waiver reason and offers three resolutions; it is dead code today
  (imported nowhere outside one code comment) and out of this package's
  named scope, which is the record page's own row, not the board's cell
  editor.
- **No dispute-resolution comparison line, and no new merge component.**
  `T07-merge-precedence` gets exactly the one read-only comparison row named
  above; the two closed re-point exclusions (agreements, disputes) get none
  at all, per the owner-question's own instruction that only the consent
  precedent needed surfacing.

## Visual evidence

This package's first commit ran `npm run visual:preflight` against an
already-seeded onboarding membership ("Merrick Thornbury") with states
arranged through the real service layer (no new person or contact value
created): Kit sorted complete, Subscription paid reopened after a waiver,
BUCS Play confirmed complete after a genuine player claim, Hudl access left
`claimed` awaiting confirmation, and a real sectioned activity log, on
`/operate/roster/[membershipId]`; the same person's disputed College fact
on `/operate/people/[personId]`, captured once open and once resolved —
**that second capture describes W7 as it stood before `Q-9` retired it,
not current behaviour**; there is no disputed-fact state left to walk. All
of the above at desktop (1440px) and a Playwright-measured 375px.

Every later correction round re-ran the preflight at its own final head
against whichever routes that round's own changes touched, each re-stamped
in `.lancers-runtime/visual-review.json` and described in the PR body's own
"Visual acceptance" section at that point in its history — the PR body,
not this ticket contract, is the running ledger of which exact routes and
states were walked at which head; this section records only the first.
