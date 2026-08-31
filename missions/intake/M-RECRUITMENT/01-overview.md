# Overview — M-RECRUITMENT

## Designed outcome

The club can run a recruitment season out of the application instead of out of
Stewart's head and a WhatsApp group.

Concretely, when this mission closes an operator can: capture a recruit at any
of the four doors without creating a duplicate; see every recruit on one board
as one line, with the signals the platform can honestly observe laid out
alongside them; read and write notes on a recruit and see who wrote them;
schedule a recruitment event, invite the recruits to it, and take attendance on
the day exactly as at any other event; watch a recruit accumulate evidence of
being interested without the system ever chasing them; and — when leadership
decides somebody is in — flip them onto the roster with one audited action that
creates the membership and opens onboarding.

Mission 5 gives recruitment the person; Mission 7 takes the member. Everything
between the first contact and the flip is this mission's, including the
administration of it.

## Why now

Four reasons, in order of force.

**The recruiting moment does not wait.** Freshers' Fair and the tasters land at
the start of Michaelmas, weeks from now. Task 09's own decision log flagged this
at approval — D12 recorded that the build sequence would have to be re-thought
because "Freshers' Fair and tasters land at the start of Michaelmas, before
Stage 4 would deliver the funnel". A recruitment system that arrives after the
recruiting is a record-keeping exercise.

**The club's model of recruitment exists in the database and nowhere a human can
reach.** `recruitment_prospects` and the six-value `prospect_status` ladder have
been on `main` since the first domain migration; the `recruits` audience group,
the `recruit` invitation capacity and the recruitment event type all shipped with
Mission 2. And there is no route in the entire application that creates a
prospect, reads the pipeline, or performs the flip. The only path that mints a
prospect today is the walk-up attendance form, as a side effect of recording that
somebody turned up.

**A live defect belongs to this mission by owner decision.** Mission 4's shipped
reminder ladder inserts a rung for every invitation on an event with no capacity
filter (`messaging-scheduler.ts:156`), and the approval confirmation counts only
players, coaches and committee (`event-approval.ts:757`). Invite recruits to a
taster today and the system would chase them and misreport the audience. Brian
routed both fixes here on 2026-08-26 rather than to a bounded ticket. LAN-86
keeps real recruits unreachable meanwhile, so this is due before the first real
send, not after it.

**Mission 5 is being built right now.** Recruitment is a layer on its surfaces by
construction. Specifying the layer while the base is still in flight is the point
at which the two can still be made to fit.

## In scope

The approved boundary is the recruitment **subject**, not the portfolio row's
bullet list — Brian's direction of 2026-08-28, read under portfolio rule 1. The
43-item inventory in `00-boundary.md` governs; grouped, it is:

- **The four doors** (Task 09 §1.1, D2), each capturing first name, last name and
  mobile with email optional, each running dedup-before-create:
  1. **QR / link self-entry** — the recruit fills it in themselves at Freshers'
     Fair, a taster, or any recruiting moment. The QR points at **our own page on
     our own domain** — they are signing in to the club's application, not into a
     form somewhere else — and their information is captured there.
  2. **Walk-up capture** — an operator or coach writes somebody down at an event
     because they turned up. This is the only door that exists on `main` today.
     **It stays available on every event type, to anyone taking attendance**
     (Brian, 2026-08-28): collecting walk-ups is part of attendance everywhere,
     not a recruitment-only affordance, so nothing about its placement changes.
     A **unique link** an operator can open to record a sign-up, rather than
     going through the attendance screen, is an open design idea for this door.
  3. **Operator manual add** — the club sources somebody it wants, reaches out,
     and enters them.
  4. **WhatsApp community join** — somebody arrives through the community group.
     **The mechanism is genuinely open**: the club needs a way for a person who
     joins the group to be collected into the system, and Brian has not settled
     how. The honest constraint is that the platform very probably cannot read
     group membership or group messages at all, which would make this door a
     posted link back to door 1 rather than an observed join. Settled by the
     Stage 2 observability research, then designed.
     Plus the administration of the doors themselves: who mints and revokes a QR,
     which roles may capture at which door, the operator-review queue that catches a
     possible duplicate, and what the walk-up path at the touchline really does.
- **The board** — recruitment's own page, built **like the Roster board** and
  copying it where copying works, because a surface the club already reads is
  worth more than a new idea. Its columns differ: **person details** first, then
  **recruitment details** for the person going through the process. One line per
  recruit, notes attached, findable and filterable, and actions available from
  the row.
  **Event columns append.** Every recruitment event adds a column at the right
  end, headed by a compact handle carrying the event name, showing whether that
  recruit was invited, **whether they answered and what they said**, and whether
  they attended — scrolled left to right through the term, read as signals rather
  than as a register.
- **The recruit's own page** — clicking a row opens that recruit, the way clicking
  a player opens their record. Personal details, the recruitment details for that
  recruit **for that season**, every signal, and the notes. It is a working page,
  not a read-out: data can be corrected and added from there, using Mission 5's
  correction machinery for the person facts and this mission's for the
  recruitment facts.
- **Signals** — everything the platform can honestly observe about a recruit,
  each a dated fact with a source. Never a score, never a ranking, never
  something that moves a stage on its own. The set is enumerated at Stage 2 and
  approved with the board at Stage 3 (see "Where the open definitions get
  fixed").
- **Messages** — the recruit's whole message inventory, each with its own timing
  and its own structure:
  1. the **welcome** — "Welcome to the Lancers";
  2. the **community-group invite** to the big group, and the acceptance of it;
  3. the **recruit-stage ask** — the signed link asking about them;
  4. the **event invitation**, and the polite follow-ups around it. A player
     invited to an event gets the reminder-and-escalation sequence, because a
     player owes the club an answer. A recruit is courted instead. Brian,
     2026-08-31: _"We chase players; recruits sit in some other place… it should
     never be harsh… We should send polite reminders, nudges, things like
     that."_ The machinery still branches on capacity, and the board still shows
     that they were invited and what came back.
     **Operator-sent messages are first-class here**, not something that happens
     outside the system. Brian, 2026-08-31: _"The app should be very open to
     allowing the person — the first interface we're going to be building for
     this, for the owners — to send polite messages, follow-ups, things like
     that, and the messages should be good. It should be easy."_ Recruitment
     owns the templates, the triggers, the timing, who may change any of it, and
     the operator surface that makes a good follow-up quick to send.
- **Never harsh** — as a property of the whole system, swept for and evidenced,
  including the two Mission 4 fixes. The sweep looks for obligation language and
  player-grade escalation reaching a recruit. It does not look for the existence
  of a second message, because a second polite message is now expected.
- **Recruitment events** — scheduling one, inviting the Recruits audience,
  approving it knowing what it sends, the recruits-on-top attendance sheet, and
  what a recruit sees of an event.
- **The flip** — one audited action by President, Vice President, Secretary or
  GM that converts the prospect, creates the membership, puts the person on the
  roster and opens onboarding. On the team is not the same as active.
- **The off-ramps** — Brian's framing, 2026-08-28: _"Recruits can get in 3 or 4
  ways, but they can get off in several ways."_ Getting off the board is a
  first-class part of the subject, not an afterthought, because a board that only
  ever grows stops being readable by November. The ramps:
  1. **Converted** — the flip into onboarding. The only way up, and once taken
     there is no pathway back off except a leadership reversal.
  2. **Declined** — they said no.
  3. **Didn't show** — invited, never came.
  4. **Went quiet** — lapsed. Recoverable by design; people resurface in Hilary.
  5. **Erroneously added** — the record should not exist. A mistyped walk-up, a
     name written twice, somebody entered who was never a recruit.
  6. **Duplicate** — the same human on the board twice, resolved through Mission
     5's merge with recruitment reconciling the resulting prospect pair.
  7. **Season end** — the unconverted recruit at a boundary.
- **Recruitment as data** — pipeline visibility for leadership, how a recruit's
  standing shows on Mission 5's People surface, and recruitment audit.

## Out of scope

Everything after the flip is Mission 7's — the onboarding checklist, activation,
the chase, the collection request, CSV import and carry-forward, and the whole
LAN-85 intake-at-scale composition that the 2026-08-25/26 amendment moved there.
The person record and the People and Roster surfaces themselves are Mission 5's;
this mission layers onto them and invents none of them. Consent policy, wording,
lawful basis and retention rules are Mission 8's — recruitment records the
evidence, Mission 8 says what it must mean. The transport, scheduler and template
machinery are Mission 4's and are used verbatim. The Monday report and the export
machinery are Mission 10's. Season creation and rollover are Mission 11's. The
event and calendar machinery is Mission 2's. Club roles and the capability
catalogue are Mission 1's.

No real recruit data and no real sends: LAN-86 and LAN-101 remain gates outside
this mission. No Mission Lead DAG, work packages or sequencing in this packet,
and no execution before Brian merges a ready packet version.

## Cross-cutting invariants

- **Privacy and capability boundary:** recruitment is operated by **the core four
  roles only** — President, Vice President, Secretary and General Manager
  (Brian's decision, 2026-08-28). The board, the recruit's page, the notes, the
  doors and the flip are all theirs. This **narrows** Task 09 D9, which said
  prospect records were visible to the operator group at large; recruitment is
  now a four-role subject, and bringing coaches or anyone else in is a later
  decision, not a Release One one.
  The one carve-out is the coach at the touchline: recording a walk-up is
  **attendance**, not recruitment, and it mints a prospect as a side effect. That
  coach keeps their narrow attendance surface and never sees the board.
  Prospect records, their signals and their notes are never player-visible.
  `recruitment_prospects` already enables RLS and revokes everything from
  `anon`, `authenticated` and `service_role` before granting the narrow server
  need; every table this mission adds does the same in its creating migration.
  **No new capability is introduced** — recruitment rides the existing four-role
  group, so Mission 1's frozen role catalogue is untouched.
- **State vocabulary — rebuilt by owner decision, 2026-08-28.** There is **one
  recruitment status** on the prospect record. It is not tiered, and it is not
  split into on-board and off-board sets — whether a recruit appears on the board
  is a display rule read off this one field, not a second structure. Brian's
  reading of the values, in his terms: `joined` is a hard yes, `declined` is a
  hard no, `disengaged` is a soft no, and `void` is neither.

  | Status       | What it says                                                                  |
  | ------------ | ----------------------------------------------------------------------------- |
  | `identified` | We have identified them and put them in. Nothing much has happened yet.       |
  | `engaged`    | They are actively involved — answering, showing up, joining in.               |
  | `committed`  | They are committed to the team, and have not been handed to onboarding yet.   |
  | `joined`     | **Hard yes.** They are in; onboarding takes them from here.                   |
  | `declined`   | **Hard no.** They are taken off the process.                                  |
  | `disengaged` | **Soft no.** They stopped engaging. Recoverable — people resurface in Hilary. |
  | `void`       | The record was a mistake and should never have existed.                       |

  The stored enum on `main` is `identified, engaged, committed, converted,
lapsed, declined`. Three changes: `converted` becomes `joined`, `lapsed`
  becomes `disengaged`, and `void` is added. "Did not show up" is deliberately
  **not** a value — the board's event columns already say invited, answered and
  did not attend on that recruit's own row.

  **`joined` is not a value anybody types.** The schema already binds it to a real
  membership for the same person and the same season through composite foreign
  keys, so reaching it requires the process. Brian's thinking on what that process
  is, recorded and still open: _"It might be the status interrupts you to say,
  'Should this person be added to onboarding? Yes, no,' and then the onboarding
  kicks off."_ Designed at Stage 3.

  **`void` may not belong in this field at all**, and that is Brian's own doubt:
  every other value is a statement about the person's relationship with the club,
  while `void` is a statement about the _record being wrong_. Two ways to hold it,
  for Stage 3:
  1. **A seventh status value.** One field, one filter, one place to look. Cost:
     the column answers two different questions, and every consumer has to know
     `void` is not a stage.
  2. **A separate marker** — voided, by whom, when, and why — leaving six values
     that are all about the person. Cost: two things to check instead of one.
     Gain: the record keeps the status it had, so "this was marked committed and
     it was a mistake" stays visible, voiding carries an actor and a reason, and
     un-voiding a wrongly voided row is trivial.
     **Recommendation: this one**, because Brian's instinct is right — void is
     not a claim about the recruit.

  This is a **frozen-model vocabulary change**, on the same pattern Mission 5
  accepted for `membership_status` on 2026-08-26: Postgres cannot drop enum
  values, so it is a new type and a data migration. The known blast radius is
  small and named — the Recruits audience derivation filters on the live stages
  (`event-audience.ts`), and two check constraints name `committed` and
  `converted` (`domain_membership.sql`).

  Mission 5's approved packet settles the other half: **`Recruit` is a displayed
  status derived from the prospect record, not a stored membership value**;
  membership stores five values (Onboarding, Active, Inactive, Departed,
  Archived). Recruitment's status lives on the prospect record and never on a
  membership, and the flip is the only bridge between them.

- **Audit posture:** every stage change, flip, reversal, duplicate resolution and
  opt-in evidence record is written to the existing `audit_events` substrate with
  the actor named. Notes stay prose and commitment signals are never scored
  fields — the schema comment on `recruitment_prospects.notes` already carries
  that decision from 8/5, and this mission keeps it. A signal is a fact with a
  date and a source; the judgement stays with the human reading the board.
- **Safety, consent and recovery:** the welcome never fires from a door without
  recorded opt-in evidence for that door. A failed message never blocks a
  capture. A possible duplicate is never silently created and never silently
  merged — it parks for a human. Consent wording and lawful basis are Clint's
  through Mission 8; recruitment stores the evidence and enforces the gate. No
  real contact data in any environment before LAN-86, and no real sends before
  LAN-101.
- **Rollout constraints:** execution waits on Mission 5's implementation landing.
  Recruitment uses Mission 4's scheduler and transport verbatim — one machine,
  more than one stream — and builds no second scheduler and no second token
  system. Migrations are forward-only, local Supabase only, and every schema
  change updates the data-model map and regenerates types with it.

### Invariants the Mission Lead may not reinterpret

1. A recruit is never treated harshly: no player-grade escalation rung, no
   collection cadence, and no message telling a recruit they are required to be
   at a particular place at a particular time. Polite reminders, nudges and
   operator follow-ups are expected, and making one easy and good to send is
   work this mission owns.
2. Dedup runs before create, at every door, and never at the flip.
3. The flip is the four roles only, is one audited action, and never produces an
   active member.
4. Missing information never blocks a capture and never blocks the flip.
5. Nothing about a recruit is scored, ranked, or advanced automatically by a
   computed value.
6. Recruitment writes its states to the prospect record and never invents a
   membership status.
7. Recruitment is the core four roles only, and no new capability is minted
   for it.

## Sources

Pinned in `sources.md`. The controlling brief is Task 09 as amended
2026-08-25/26; the commissioned boundary is portfolio row 6 of Portfolio v2; the
base this mission layers onto is the approved `M-PEOPLE-AND-ROSTER` packet; and
implemented reality is `main@c69d544`.

## Where the open definitions get fixed

Two things this mission needs are not written down anywhere yet, by anyone. Both
have a stage:

- **The signal set.** Brian asked when this gets fleshed out. At **Stage 2** I
  run the observability research he suggested — a bounded read of the delivery,
  RSVP, attendance, token and webhook records on `main` — and produce the list of
  what recruitment can honestly observe versus what it cannot. Where a signal is
  not established as readable, the mission assumes it is not. The resulting set
  is then approved at **Stage 3** as part of the board's specification and its
  mockup, so Brian approves actual columns rather than an abstraction.
- **The recruit-stage field set.** Referenced by Task 08 §4, never enumerated,
  and recorded as an open unknown in Mission 5's approved packet. Enumerated at
  **Stage 2** and approved at **Stage 3** with the ask's own workflow.

And on Brian's question of where the doors themselves get decided: they are
**named here**, **counted at Stage 2**, and **designed at Stage 3**. Stage 2 is
where the numbered workflow inventory is frozen — that is the moment Brian
decides whether each door is its own workflow, since one workflow is one actor's
journey and the QR door is the recruit's journey while the other three are an
operator's. Stage 3 then specifies and draws each one, and nothing is settled
about a door until Brian has seen it drawn.

## Open owner decisions carried into Stage 2

Recorded here so none is lost, and none blocks this stage:

1. **The recruit-stage ask's timing** — the record says it rides the welcome or
   the capture door (amendment 3, 2026-08-26); Brian described it a day later as
   its own message. Recommendation: a day later, as its own message.
2. **The two Notion wording corrections** in `notion-corrections.md`. They were
   drafted to align the portfolio row and Task 09 amendment 2 with the
   never-chased rule, and the 2026-08-31 amendment makes that drafted text
   **stale**. They need redrafting against the never-harsh rule before Brian is
   asked to approve any Notion edit.
3. ~~Whether recruitment needs its own capability.~~ **Settled 2026-08-28:**
   _"It should just be the core four that you operate this with right now. If we
   bring coaches or someone else in later, that's later."_ No new capability;
   recruitment rides the existing four-role group.
4. **The unconverted recruit at a season boundary** — a recruitment-lifecycle
   fact whose mechanism is Mission 11's.
5. **How flexible the recruitment cycle is** — what an operator may change about
   timing, content and whether a step runs at all.
6. ~~Whether a human touch is recorded at all.~~ **Largely settled 2026-08-31**
   by the never-harsh amendment: the operator's follow-up is sent **from the
   app**, so the system observes it as a matter of course and the board can show
   what was said and when. The residue is narrow and stays open — whether an
   operator can also log a touch that happened elsewhere, such as the President's
   own WhatsApp message, which the platform still cannot observe. Recommendation:
   yes, as a note, because it costs nothing once the note exists.
7. **How a recruit leaves the board** when they are not going to onboarding.
8. **How the WhatsApp community-join door actually works**, given the platform
   most likely cannot observe a group join at all.
9. ~~Whether every walk-up becomes a recruit.~~ **Settled 2026-08-28:** _"Every
   walk-up is a recruit, and we just need to know there's a way to handle
   them."_ Walk-up capture stays on every event type and every walk-up enters
   the funnel — which is what makes the off-ramps load-bearing rather than
   tidy-up work.
10. ~~How an erroneous record leaves the board.~~ **Settled 2026-08-28:** `void`,
    within a rebuilt seven-value ladder — `lapsed` becomes `disengaged`,
    `converted` becomes `joined`, and "did not show up" is deliberately not a
    status. Recorded under State vocabulary.
11. **How the flip is actually performed.** Its **shape is now settled**, Brian
    2026-08-31: _"When it flips to 'Join,' there should be a pop-up that comes
    up… 'Join' means these people are being officially added to some season…
    something should happen on the roster page so we can see that they're now
    joined, they joined this season, and they're moved on to Onboard and they're
    now in the next steps."_ So: the status change to `joined` interrupts with a
    confirmation rather than committing silently; `joined` **means** a season
    membership exists; the roster reflects it; and onboarding opens. The exact
    wording, what the pop-up asks, what it writes, and what the roster shows are
    **designed at Stage 3** in the flip's own workflow, late in the order, on his
    instruction.
12. **Where deletion stops being recruitment's.** Removing a _person_ is erasure
    and belongs to Mission 8 by the 2026-08-25 owner decision. Removing a
    _prospect from the board_ is recruitment's. The line between "this recruit
    is off my board" and "this human is deleted from the club's records" has to
    be drawn explicitly, because the second is a privacy act with its own
    authority.
13. **The unique sign-up link** for recording a walk-up outside the attendance
    screen — what it is, who holds it, and whether it is a door of its own.
14. **What the QR code actually does.** Brian, 2026-08-31: _"I don't know what
    the QR code should do yet. We'll deal with that in the workflow."_ The
    2026-08-28 constraint stands — it points at **our own page on our own
    domain** — but what that page asks, shows and writes is open and is designed
    at **Stage 3** in the QR door's own workflow.

## Brian approval

- Exact words: "Close stage one."
- Date: 2026-08-28

## Owner amendments after approval

The overview was approved on 2026-08-28. Amendments below carry Brian's own
words, are applied in place above, and do not reopen anything he has not named.

### 2026-08-31 — the never-harsh rule replaces the never-chased rule

Brian, in full: _"The rule for recruits is never 'chased.' It's getting the wrong
signal. Look, it's taking the wrong rule. We chase players; recruits sit in some
other place. Let me put it this way: it should never be harsh. That's the better
rule. We should never have a harsh recruit. We should send polite reminders,
nudges, things like that. The app should be very open to allowing the person (the
first interface we're going to be building for this, for the owners, whoever) to
send polite messages, follow-ups, things like that, and the messages should be
good. It should be easy, right? As we follow up with people, again, these are
sales. This is sales prospecting. You don't tell a client, you don't tell a
potential person who's going to give you money that they need to show up at a
particular place and time. No, we need them to like our team."_

What it changes:

- **Invariant 1** is rewritten. The prohibition is on harshness — player-grade
  escalation, collection cadence, and obligation language — not on contacting a
  recruit more than once.
- **The message inventory** is no longer capped at one touch per event, and
  operator-sent follow-ups move from outside the system to first-class inside it.
  The mission owns an operator surface for composing and sending them well.
- **The "never chased" system property** becomes "never harsh", and its sweep
  changes accordingly: it hunts obligation language and escalation reaching a
  recruit, not the existence of a second message.
- **Open decision 2** is stale — the drafted Notion corrections argue the old
  rule and must be redrafted before Brian approves any Notion edit.
- **Open decision 6** is largely settled, since follow-ups now leave from the app.
- The framing is Brian's: recruitment is **sales prospecting**, and the standard
  for a message is that a prospective member likes the team more for having read
  it.

### 2026-08-31 — confirmations that changed nothing

- **The core four roles** stand.
- **Every walk-up is a recruit**, handled onward in the pipeline.
- **The board** is recruitment's own board, modelled on the Roster board — which
  is what the In scope section already said.
- **`identified` → `engaged` → `committed` → `joined`** confirmed as the spine of
  the ladder.

### 2026-08-31 — the sign-on flow, and nine decisions from the inventory review

Brian reviewed the drafted thirteen-workflow inventory and returned the
following. They are applied to the inventory in `02-workflows.md` and recorded
here as the authority for it.

1. **Channel registration is this mission's, and it is a flow.** _"The initial
   WhatsApp registration, I think, needs to be handled here… Even though it's
   rather small, it will define this for other steps in this process. Recruits are
   the easiest place to handle this."_ It becomes its own workflow rather than a
   line inside the doors, because Missions 7 and 8 inherit its shape.
2. **The sign-on ladder has a named sequence**, described by analogy to how an
   event goes out: _"First notification goes out today to invite them in. If they
   sign in, they get asked. If they accept, they get asked to fill out some
   details immediately. They get a polite reminder or something like that. There's
   a flow that asks for W-7."_ And: _"if they accept the WhatsApp communication,
   they have to answer that first immediately. Then they get the polite ask: 'Hey,
   fill out some information about yourself.' They get a form, and it's up to
   them."_ So the recruit's entry is **two journeys**: saying yes and answering the
   standard ask on the spot, then the fuller form asked politely and reminded once.
   What the standard ask is, and what the form's fields are, are both open: _"We
   need to figure out what those look like."_
3. **Two ladders, not one suppressed ladder.** On a recruitment event carrying
   both: _"If a player is invited to that as well, they get the normal chase…
   Recruits get a recruit chase, and that's an entirely separate thing where they
   get set the invite once and maybe a polite follow-up… it needs to be a totally
   separate thing. We need to look at it separately. But we should be able to
   invite players and recruits, but recruits get treated differently."_ This
   sharpens the Mission 4 correction: recruitment does not switch the player
   ladder off for recruits, it runs a ladder of its own beside it.
4. **The board and the record stay consistent with what shipped.** _"W1 and W2 are
   very similar to how the current board is set up on main right now, with similar
   structures. That's all really good, and similar colors, if we can keep them
   consistent."_ Structure, grouping and colour language are carried from
   `/operate/roster`, not reinvented.
5. **The walk-up flow is reworked, not tidied.** _"We need to go through that
   entire flow, and there's probably going to be some significant rework from how
   we did this before, just for clarity purposes."_ Clarity is the goal, and
   departure from the shipped screen is expected rather than needing justification.
6. **The QR's flow is named, its detail still open.** _"If they sign the QR code,
   we're going to want them to go to a form. And then, once they submit the form,
   they should get a login, basically an invite to the WhatsApp group. And that's
   the flow, but I think I want to talk more about how that works there."_ Scan →
   form → submit → the group invite. Open decision 14 narrows to the detail.
7. **A recruit resolves their own duplicate first.** _"If they don't resolve their
   own duplication (like when they sign themselves in), they should see if they're
   already in the list. If their name is already there, they go, 'Oh, you've
   already done this.'"_ The self-serve door tells the recruit; the operator queue
   catches what it cannot.
8. **The ask is a minted, person-linked form.** _"The recruit stage ask needs to
   come within a form that gets minted and sent to them, that is linked to their
   person."_ The follow-up surface's normal job is chasing what a recruit has not
   filled in: _"somebody can go and say, 'Hey, go and ask them anything that they
   haven't filled out with this thing.'"_
9. **Leaving the board is a status change.** _"When a recruit leaves the board,
   that's a status change, right? A moves statuses, and then the board resorts,
   more or less."_ No separate removal mechanism; the one flat field does it, and
   the board's ordering answers.

**Still open after this review**, and named as such by Brian: the boundary in the
administration workflow — _"W9 is important. I'm most confused about this one. I
think we need to go through the workflow and find the boundary there."_ It is
settled by walking that workflow, not before it.
