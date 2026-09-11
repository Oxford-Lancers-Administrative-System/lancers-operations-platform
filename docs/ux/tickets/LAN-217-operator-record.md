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

**The row's own `Select` offers that item's own states, and nothing else.**
Each of the operator-ticked items carries one closed list —
`ITEM_STATE_LISTS` in `onboarding-item-shapes.ts` — and the set a cell may
_display_ and the set its control may _choose from_ are the same array, so
no second list can drift from the first. **There is no `Reopen` verb and no
`Not applicable`**: a state is changed by picking a different entry from the
same list, and moving back to `Not invoiced` or `No` is that same ordinary
pick rather than a separate verb.

This is D-002, correction round 6 (Brian, on sight). Round 3 (`Q-14`) fixed
the words but kept two concepts — a status the cell displayed and a
"resolution" the control offered, which was the old four operator verbs
(`complete`/`waived`/`not_applicable`/`reopen`) with new words painted on.
That split is why BUCS Play offered "Confirmed · Waived · Not applicable ·
Reopen" instead of its own four states, and why Subscription invoiced
offered four options for a yes/no fact. The brief that told round 3 "Waived
and Not applicable stay available on every item as the operator's escape
hatch, and reopen from any terminal state is unchanged" was never Brian's
decision — the Mission Lead invented it. There is no escape hatch.

**The waive reason is gone, not merely optional.** `W6-02`'s approved screen
shows the menu with no reason field anywhere in it. `REQ-reason-free-waive`
only ever made the reason _optional_ on the service side (the substrate,
LAN-214, already unwound `onboarding_items_waiver_is_justified`); this
package reads the mockup's silence on the field as the instruction to remove
it, so Waived commits the moment it is chosen, exactly like every other entry
on Subscription paid's own list — the one item that has it. The author is
still the verified four-role operator this page's own gate resolves.

**`claimed` renders in the row's existing idiom** — the same underlined
`body2`, the state name changed, no chip and no colour of its own — matching
"item status renders as the record already renders it" (locked in
`acceptance/W6.md`).

**The provenance note is rebuilt from the item's own append-only history**
(`onboarding_item_history`, LAN-214) rather than the current row's four
columns alone. It states who and when for every state (not only
`completed_on`), a compact trail of earlier transitions when there are any
("Not paid by Caspian Hallowfield, 4 Sept · waived 4 Sept"), and — the
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

### Reopening an agreement item reaches the player (LAN-240)

Setting **Photo release** or **Code of Conduct** back to `No` is the shipped
reopen mechanism — there is no separate reopen verb, by D-002. Until LAN-240
it moved only `onboarding_items.status`, leaving the season's
`onboarding_agreements` row in place, so the player's own link went on
reading "Already agreed" beneath a navigator that said "Outstanding", and a
bare load of the link resumed at "There is nothing left to fill in". The
player could never see or act on the reopened item.

That row is now removed in the same transaction as the state change, and the
player-facing steps read the item's status rather than the row's existence.
Nothing is lost: `onboarding_item_history` holds both transitions with their
actor and moment, and an `onboarding_agreement_reopened` audit row records
the removal (including a count of zero, for an item set back to `No` for a
player who never agreed through the link at all). No schema change.

### Send onboarding questionnaire — the record's own manual ask (LAN-266)

Added on Brian's decision of 2026-09-09, with the recruit record as the
stated model: "onboarding gets the same thing, on the player's record,
working the way the recruitment one works." Until then the record carried no
send or nudge control at all, so an operator looking at one player had to
leave it for the missing-data queue, and the record itself never said
whether the player's link had ever been sent.

A **SEND ONBOARDING QUESTIONNAIRE** button sits at the foot of the Onboarding
section, below the items and the outstanding banner, in the same position and
style as `/operate/recruitment/[prospectId]`'s own two send buttons: the same
component with the same props, content-width and left-aligned inside the card,
with the status lines beneath it. It reads **RESEND …** once an ask has been
queued. The same treatment at both 1440 and 375.

Brian corrected this on 2026-09-09 after seeing it: the button first shipped
full width, which made it the only send control in the product that stretched
its card. There is one style for this control, the recruit record's, and not a
second one for onboarding.

Beneath it, two caption lines:

1. `Not sent`, or `Sent <date, time> · <delivered | queued | failed>`.
2. The chase, in the queue's own words: `Chase 2 of 4 sent · next 12 Sept`
   when one is scheduled, and otherwise whichever of `Chase exhausted`,
   `No phone number on file`, `Unmessageable · under 18`,
   `Delivery failed · <reason>` or `No automated chase` the queue's Next
   column would show. Those five phrases are `formatChaseNext`'s, imported
   from the queue rather than reproduced, so the record and the queue can
   never describe the same player two different ways.

Pressing it opens the LAN-237 confirm dialog and follows its rules: the
dialog reports **Sent** only on provider acceptance and a named refusal
otherwise, never a silent failure. The button is not natively disabled for a
gate the dialog can explain — `W2-04`'s reasoning, unchanged: a disabled HTML
button fires no `onClick`, so a control that cannot be pressed cannot explain
itself. The two absolute refusals (no reachable number, under 18) are named
on the status line before the button is ever pressed and again in the dialog,
which withholds the confirm. A membership that is no longer onboarding is the
one natively disabled case — there is nothing left to chase and the status
line already says so.

The send is `sendOnboardingNudges` with one membership: the identical
function the queue's own Nudge calls. One job type, one idempotency-key
prefix, one activity-log entry, so a nudge from either place appears
identically in this record's Activity section and in the queue's Last contact
and Next columns. It counts toward the configured chase count and re-spaces
the next automatic chase from it — see `LAN-218-chase-and-queue.md`.

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
(round 5): one place in `onboarding-item-shapes.ts`, per item, is where both
the board and the record page read a status's word from. Round 6 (D-002) then
collapsed the round-5 pair of lookups into the single `itemStateLabel` — there
is no separate resolution vocabulary left to have its own — and closed each
item's list. These are the lists in full:

| Item                  | Its own states, and nothing else                   |
| --------------------- | -------------------------------------------------- |
| Subscription invoiced | Not invoiced · Invoiced                            |
| Subscription paid     | Not paid · Paid · Waived                           |
| Kit Distributed       | No · Yes                                           |
| Squad photo           | No · Yes                                           |
| Comms groups          | Not assigned · Assigned and invited · In the group |
| Hudl access           | Not invited · Invited · Claimed                    |
| BUCS Play             | Not invited · Invited · Claimed · Confirmed        |
| Code of Conduct       | No · Yes (record page only)                        |
| Photo release         | No · Yes (record page only)                        |

Code of Conduct and Photo release are player-signed rather than
operator-ticked, so they are not board columns; their words are "No"/"Yes"
like every other binary here, not the "Not signed"/"Signed" round 5 used.
Hudl access has **three** states, not four — its list ends at Claimed, and
the fourth, Confirmed, belongs to BUCS Play alone. That is the one place the
two trust-class items genuinely differ, and it is Brian's own table that
draws the line, not a shared abstraction. `Waived` appears exactly once, on
Subscription paid, where he named it; `Not applicable` appears nowhere, and
`itemStateLabel` throws on a state an item cannot occupy rather than
rendering it.

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

- **No new component, anywhere.** The row's states are options on a shipped
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

## Decision history relocated from source (LAN-300)

### src/app/operate/roster/board-columns.ts — onboarding columns comment

> Correction round 2, item 5 — the seven operator-ticked items, cloning
> the record page's own Onboarding section into the board an operator
> already works from. The two derived items
> (`contact_academic_details`, `season_welcome_consent`) are not columns
> of their own here — nothing an operator ticks — and stay covered by
> the summary column above; see the package receipt.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/app/operate/people/[personId]/merge/merge-comparison.tsx — consentRows (B-003)

> B-003 (correction round 2, Q-10, Brian: "If it is a merge, they obviously
> get to choose") — `WP-operator-record` (LAN-217). Operator-choosable like
> any other row above, and under LAN-256 that now means unanswered as well
> as unimposed. Supersedes `T07-merge-precedence`, which was locked at a
> recommendation rather than an owner decision.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/audience-selection.ts — AudienceCandidate.isBps

> `WP-operator-record` (LAN-217) correction round 2, item 7 — the BPS
> audience group. `bps_selections.is_selected` for this season, `false`
> for every non-player candidate. Not a fifth `AudienceCapacity`: the BPS
> group is still a `player`-capacity row (the same
> `event_audience_members.capacity` value every other player already
> writes), narrowed by this one extra flag instead — nothing about BPS
> gates anything else, so it must not touch the closed capacity
> vocabulary a real approved event already persists.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/audience-selection.ts — AudienceGroup.templateEligible

> `false` excludes this group from a template's own default-audience
> picker (`templateGroupsForEventType`) even though the single-event
> builder still offers it (`groupsForEventType`). Absent means eligible —
> every existing group's own behaviour, unchanged.
>
> D-003 (correction round 3, Q-14, `WP-operator-record`, LAN-217): BPS was
> the one exception, excluded because `public.audience_group` — the closed
> enum a template default actually persists to — carried no `bps` value.
> Brian: the BPS audience appears in an event's own picker but not in
> event templates, so it cannot be pre-chosen. That migration is now
> authorised (`supabase/migrations/20260904120000_bps_event_template_audience.sql`),
> so BPS is template-eligible like every other group below it.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/audience-selection.ts — AUDIENCE_GROUPS bps entry

> Correction round 2, item 7 (`WP-operator-record`, LAN-217): the roster's
> own BPS column, offered here too. Every event type, like every group
> above except Recruits. Includes onboarding memberships, not only active
> ones — `REQ-nothing-gates` in the packet states that onboarding
> memberships count as players for event audiences from the moment they
> are on the team, even though "active players" and "everyone active"
> above stay active-only.
>
> D-004 (correction round 3, Q-14): the label reads "All Active BPS", not
> "BPS" — Brian's exact words. D-003, same round: now template-eligible
> (`supabase/migrations/20260904120000_bps_event_template_audience.sql`
> adds `bps` to `public.audience_group`), so it is pre-choosable on an
> event template exactly as it already is on the event's own picker, and
> carries through to events created from that template the same way every
> other group already does — `readTemplateInheritanceIn` and
> `templateAudienceKeys` in `event-templates.ts` resolve any stored group
> generically, with no group-specific code of their own.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/membership/write-items.ts — resolveOnboardingItem header

> Sets one onboarding item to one of its own states — D-002 (correction
> round 6, `WP-operator-record`, LAN-217): an operator names the item's own
> target state directly, the same list `allowedItemStates` names as both
> displayable and offerable. There is no separate "resolution" verb any
> more, and no `reopen` — an operator corrects a mistake by naming a
> different one of the item's own states, from any current state, not only
> from a terminal one.
>
> `public.onboarding_item_history` (LAN-214, `onboarding-item-history.ts`) is
> the typed home `REQ-item-history` asks for, and this writes it in the same
> transaction as the state change — Register D9's "where a typed home
> exists, that table is the record" applied to the table this package built.
> The `audit_events` row alongside it is unchanged from LAN-75: this
> codebase's own precedent (`setMembershipStatus`) keeps a typed table's
> write and an `audit_events` row together rather than choosing one.
>
> `REQ-reason-free-waive` (LAN-214) unwound the schema's
> `onboarding_items_waiver_is_justified` constraint: the author stays
> mandatory — `actorPersonId` always is one — and the reason stops being. A
> waiver with no reason is accepted, exactly as one with one always was.
> `waived` itself is now offered by exactly one item's own list (Subscription
> paid) rather than by every item as a shared escape hatch.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/onboarding-item-shapes.ts — module header

> D-002 (correction round 6, `WP-operator-record`, LAN-217) — **one state
> list per onboarding item.** Round 3 (Q-14) fixed the words but kept two
> separate concepts: a _status_ the cell displayed, and a _resolution_ — the
> old four operator verbs (`complete`/`waived`/`not_applicable`/`reopen`)
> with new words painted on — that the cell's own control offered. That
> split is why BUCS Play still offered "Confirmed · Waived · Not applicable ·
> Reopen" instead of its own four states, and why Subscription invoiced
> offered four options for a yes/no fact. Brian caught it immediately.
>
> The Q-14 brief that told the previous round "Waived and Not applicable
> stay available on every item as the operator's escape hatch, and reopen
> from any terminal state is unchanged" was never Brian's decision — the
> Mission Lead invented it. There is no escape hatch and no reopen verb.
> Every item's own list, below, is Brian's exact words and nothing else:
> the set a cell may show and the set its own control may choose from are
> now, structurally, the same array — there is no second list anywhere
> that could say something different, because there is no second list.
>
> Kept here, in code, keyed by `onboarding_item_types.code` — not as a new
> column on the type; see the module's original correction-round-3 note for
> why (`REQ-checklist-fixed`). A module of its own, deliberately without
> `server-only`: `membership.ts` (the write path) and `board-columns.ts` /
> `board-data.ts` / `record-view.tsx` (client components) all need the
> identical answer to "what can this item be, and what can its own control
> choose", and a client component may not import a `server-only` module even
> for one pure function.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/person-merge/preview.ts — consent section note

> Consent at a merge — `WP-operator-record` (LAN-217), mission
> owner-question Q-3/Q-4. B-003 (correction round 2, Q-10, Brian: "If it is
> a merge, they obviously get to choose") supersedes `T07-merge-precedence`,
> which locked the survivor to the most-restrictive state automatically —
> a recommendation, never an owner decision. `season_messaging_consents` is
> still unique on `(person_id, season_id)`, so a merge of two people who
> both hold a consent row for the same season still cannot keep both; which
> one survives is now the operator's own choice, like any other field or
> contact row on this same screen, defaulting to the survivor's own value
> when the operator makes no explicit choice — nothing is imposed.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/roster-board/write-misc.ts — commitBps

> `WP-operator-record` (LAN-217), mission owner-question Q-2/Q-3. Item 5 of
> the item-and-ask inventory left the onboarding checklist on Brian's
> explicit instruction (2026-09-01): "it's not a fucking mission change. We
> are going to add it here into the roster for the BPS column."

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.
