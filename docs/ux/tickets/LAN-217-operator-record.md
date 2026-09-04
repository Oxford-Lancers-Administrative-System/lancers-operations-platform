# LAN-217 — The operator's view: one player's onboarding record, settling a disputed fact, and activation

**Workflows:** `W6 — One player's onboarding record`, `W7 — Settle a disputed fact`, `W10 — Activate a player`
**Routes:** `/operate/roster/[membershipId]` (LAN-187's shipped record, deepened), `/operate/people/[personId]` (LAN-184's shipped record, deepened) — no new route
**Shared contract:** [`../slice-ux.md`](../slice-ux.md) · [`../standards.md`](../standards.md) · [`LAN-187-player-record.md`](./LAN-187-player-record.md) (the record this package's W6 and W10 deepen) · [`LAN-184-people-and-missing-queue.md`](./LAN-184-people-and-missing-queue.md) (the person record this package's W7 deepens)

## Why this contract exists

`missions/packets/M-ONBOARDING-AND-INFORMATION-COMPLETION/packet.json`,
`missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION/workflows/W6-*.md`,
`W7-*.md` and `W10-*.md`, and their `acceptance/W6.md`, `W7.md` and `W10.md`
records are the approved design — the packet, not Linear, is the durable
record of the decision, and Linear is not a durable repository contract. This
records what was actually built from them, at LAN-217's own head. All three
workflows deepen a shipped surface; none draws a new one.

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

## W7 — a disputed fact, `/operate/people/[personId]`

The surface is the person record, not the roster record — the seven
contestable facts (`given_name`, `family_name`, `college`,
`matriculation_year`, `expected_graduation_year`, `degree_field`,
`date_of_birth`) are person facts. No new component: the existing `Fact` row
and its shipped `By`/`DerivedBy` attribution badge are extended in place.

**While a dispute is open**, the club's value renders exactly as it always
has (unchanged badge), and the player's contested answer appears on a second
line with its own badge naming who raised it and when
(`person_fact_disputes.raised_by_person_id`/`raised_at`), plus a four-role
resolve control — two buttons, "Keep the club's value" / "Take the player's
answer" — drawing no note field (`resolvePersonFactDisputeIn`'s optional
`note` stays unused by this UI, `W7`'s own delegated decision).

**Once resolved**, the losing value stays visible on a dated second line —
"the losing value is retained, never deleted" is something the record shows,
not only something the database keeps. Taking the player's answer is
attributed through the record's own shipped, audit-derived `Q-13` provenance
once the field is re-read (`updatePersonField` already writes the
`person_<field>_updated` row this derives from — nothing new was needed);
keeping the club's value is attributed from the dispute row's own
`resolved_by_person_id`/`resolved_at`, since nothing on `people` changes to
carry it any other way. Flag, correction and confirmation are the three
things `W7`'s own inventory wording asks to stay separately attributable,
and each now has its own source: the flag from the dispute row itself, the
correction from the shipped audit trail, the confirmation from the dispute
row's resolution.

Resolution is four-role only (`person_record_authority`, the same gate this
page's own read and its other actions use). A disputed fact gates nothing —
no code path added by this package reads `person_fact_disputes` outside this
rendering and the dispute service itself.

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

## What is deliberately not here

- **No new component, anywhere.** Reopen is one option on a shipped
  `Select`; the disputed-fact rows extend the shipped `Fact`/`By`; the
  Activity section reuses the shipped `StatusHistory` markup.
- **No reason field, anywhere in this package.** Not on the item `Select`
  (waived commits immediately), not on the dispute resolve control.
- **No confirmation step on activation.** `Q-12` settled this on Mission 5's
  own walkthrough; re-litigating it here was named as out of bounds.
- **No change to `src/app/operate/roster/membership-actions.tsx`.** The
  board's own inline resolve editor (`OnboardingItemForm`) still requires a
  waiver reason and offers three resolutions; it is dead code today
  (imported nowhere outside one code comment) and out of this package's
  named scope, which is the record page's own row, not the board's cell
  editor.
- **No change to `person-merge.ts` or the merge comparison screen.** `W7`'s
  own spec states `T07-merge-precedence` "has no surface of its own... one
  more line in Mission 5's existing merge comparison" — this package's brief
  does not name a requirement id for it or the merge screen, so it was not
  built here. Recorded as a limitation in the package receipt for the
  Mission Lead to route.
- **No `bps_selections` roster-board column.** An earlier mission
  owner-question assigned it to this package; the dispatched brief's own
  scope section never names it, and it touches `roster-board.ts`/
  `roster-board.tsx`, files outside everything this brief describes.
  Recorded as a limitation in the package receipt for the Mission Lead to
  route.

## Visual evidence

`npm run visual:preflight` against an already-seeded onboarding membership
("Merrick Thornbury") with states arranged through the real service layer
(no new person or contact value created): Kit sorted complete, Subscription
paid reopened after a waiver, BUCS Play confirmed complete after a genuine
player claim, Hudl access left `claimed` awaiting confirmation, and a real
sectioned activity log, on `/operate/roster/[membershipId]`; the same
person's disputed College fact on `/operate/people/[personId]`, captured
once open (both values, both attributions, the resolve control) and once
resolved (the settled value, the retained losing value, dated). All of the
above at desktop (1440px) and a Playwright-measured 375px. See the package
receipt for the exact routes and the evidence path.
