# LAN-205 — Walk-up capture sends the form, and recruits first on the sheet

**Workflows:** `W5 — Capture a walk-up as a recruit`, `W12 — Take attendance at a recruitment event`
**Route:** `/operate/events/[id]/attendance` (unchanged)
**Shared contract:** [`../slice-ux.md`](../slice-ux.md) · [`../standards.md`](../standards.md) · [`LAN-80-attendance.md`](./LAN-80-attendance.md) (the surface this package edits) · [`LAN-202-signup-consent-gate.md`](./LAN-202-signup-consent-gate.md) (the form the door's send links to) · [`LAN-203-recruit-ladders-and-cycle.md`](./LAN-203-recruit-ladders-and-cycle.md) (the cycle this door declares into)

## Why this contract exists

LAN-205's own Linear body, its packet amendment 1 (the consent model) and its
2026-09-01 amendment ("this package builds its own send machinery") are the
approved design; Linear is not a durable repository contract. This records
what was built from them.

Sources, in the authority order `slice-ux.md` §1 sets:

- `LAN-205` in Linear, both amendments, and packet amendment 1 (season-scoped
  consent), approved by Brian 2026-08-31 and 2026-09-01.
- `chore/recruitment-fidelity-mockup` (LAN-200) —
  `src/app/recruitment-preview/attendance-sheet.tsx`, read directly from the
  branch rather than from its screenshots, which is the copy and structure
  authority below.
- `missions/intake/M-RECRUITMENT/mockups/shots/` — `W5-01`–`W5-03`,
  `W12-01`–`W12-02`.
- `missions/intake/M-RECRUITMENT/workflows/W5-capture-a-walk-up-as-a-recruit.md`
  and `W12-take-attendance-at-a-recruitment-event.md`. The 2026-09-01
  amendment supersedes `W5` where they disagree, and the fidelity mockup's own
  2026-09-01 commit supersedes `W12`'s "appears on the sheet from their
  invitation" — see below.

## The word is "walk-up", never "walk-on"

Brian, 2026-08-31, locked it. `WALK_UP_HEADLINE`, `WALK_UP_SUBMIT` and
`WALK_UP_CHIP` in `presentation.ts` all say "walk-up" now. The recorded
confirmation is the short `WALK_UP_ADDED` — "Walk-up added" — replacing the
sheet's former one-sentence paragraph: `docs/ux/standards.md`'s no-narrative
rule applies to a confirmation exactly as it does to everything else on this
surface.

## The door's own send

The walk-up's opt-in is the verbal read-back at the touchline, and it
authorises exactly one message on capture: `recruit_welcome`, the signed,
prefilled link to the LAN-202 sign-up form — never a second template, never a
composer, never free text.

1. **Mobile is mandatory**, validated and normalised to E.164 with the same
   shared validator LAN-202's form uses
   (`person-validation.ts`'s `validatePhoneNumber`, LAN-183) — reused rather
   than re-derived, so a malformed number is refused at the door rather than
   failing a send later. `raw_value` stays exactly as typed;
   `normalised_value` carries the E.164 digits.
2. **Consent is granted from the read-back**, source `walk_up_read_back`,
   season-scoped `(person, season)` — `season_messaging_consents.source`'s
   own three-value vocabulary (LAN-201), written here because
   `messaging-consent.ts` deliberately never writes this source itself (see
   that module's own note).
3. **The recruitment cycle is declared** — `declareRecruitmentCycleJobsIn`
   (LAN-203), called once consent is granted, in the same transaction.
   Nothing here schedules or sends a message directly; declaring only writes
   `notification_jobs` rows, and the existing scheduler sweep dispatches them
   on their own offsets. The welcome step's own offset is zero hours, so it is
   the one message due immediately; the details reminder and the
   Questionnaire B ask/reminder are the standard cycle every consented
   recruit receives afterwards, on their own schedule, not a second send this
   door itself makes.
4. **If the number does not work, the recruit is still created and receives
   nothing** — proved by test: an undeliverable recipient fails the dispatch
   terminally and changes nothing about the person, the prospect, the
   attendance record or the granted consent.

Proved end to end against the real local delivery sink (no injected
transport): the job created by capture is claimed and dispatched, and the
sink accepts a real `recruit_welcome`-shaped payload built from the captured
recruit's own name and number.

### A shared-file correction this door's requirement uncovered

`declareRecruitmentCycleJobsIn`'s completion check
(`readRecruitmentCycleCompletionIn`) read "first name, last name and a
current phone on file" as "the recruit already supplied the completing set."
That is only true for the QR and tokenised doors, where those fields exist
_because_ the recruit filled the form in. This door's own mandatory-mobile
requirement writes the identical three fields in the same transaction that
captures the recruit, so every walk-up would have taken the already-complete
branch before its own declaration was ever attempted, and the cycle would
have sent `recruit_interest_ask` — a football-background questionnaire —
instead of the one template the read-back authorises. Corrected in
`recruitment-cycle.ts` to read `season_messaging_consents.source =
'qr_self_entry'` instead: the durable fact of having reached the form
themselves, which a walk-up capture never produces. See that file's own
module note for the full account and every caller checked.

## Recruits first, on a recruitment event's sheet

`groupParticipants` (`presentation.ts`) draws a fourth group, **Recruits**, at
the top of a `recruitment`-typed event's sheet only — cloning the sheet's own
shipped group markup (chevron, heading, detail line, count chip) rather than
authoring a replacement, per the mockup's own build note.

**Every recruit on the board this season appears, invited to this specific
event or not** — Brian, 2026-09-01, on the running fidelity mockup: "if a
recruit is already in our system and we're at a recruitment event, all
recruits should already be on the page for the event... If they happen to
show up, I'll mark them as present, even if they didn't RSVP." This
supersedes the older `W12` workflow text ("appears on the sheet from their
invitation"), which predates that instruction.

- `readAttendanceBoard` fills the gap with `RECRUIT_ROSTER_QUERY`, scoped to
  recruitment events, excluding a recruit already produced by the board's own
  invitation/attendance join (never a duplicate row).
- Excludes `joined` — a converted prospect is a player now, tracked by their
  own membership — and `void` — the schema's own comment on `prospect_status`
  names this as a display rule for a later package to decide, and a void
  record says the record itself is wrong, never a fact about a person.
- Keeps `declined` and `disengaged` — an exit status is not a gate on this
  door; the recruit can still turn up, and the club records that they did.
- A walk-up (an attendance row with no invitation) is never duplicated into
  Recruits — it stays in its own Walk-ups group.
- `resolveParticipant` gained the matching write-side fallback: recording
  attendance for a recruit shown this way, who has neither an invitation nor
  a prior attendance row at this specific event, resolves against the same
  season roster the board read from, so an operator can mark them present
  without an invitation ever being created.
- **Walk-ups sits directly below Recruits on a recruitment event, not at the
  bottom** — OWNER-WALKUP-GROUP-ORDER, Brian, 2026-09-02, from his
  walkthrough: "Walk Up should not be at the bottom. Walk Up should be right
  below Recruits. Because they're very likely to recruit, I want to see the
  same thing there." A walk-up captured at a recruitment event is, in
  practice, a recruit, so it sits with the other recruits rather than filed
  under everyone else. Every other event type's group order (Attending,
  Everyone else, Walk-ups) is unchanged — this reordering is scoped to
  `eventType === "recruitment"` alone.

### Departure from the mockup's own copy — decidable, not escalated

The fidelity mockup's row detail for an invited-but-unanswered recruit reads
"Invited · no answer yet"; this ships the sheet's own existing
`describeRsvp(null, false)` — "RSVP: No response" — instead. Structure (a
Recruits group, at the top, holding every season recruit) is what the mockup
and the workflow bind; this one row-level string is the sheet's own idiom,
already used for every other unanswered invitee, and inventing a second
"no answer" phrasing for one row shape only would be the inconsistency
`docs/ux/standards.md` asks this surface to avoid.

## What is deliberately not here

- **No duplicate check on this door.** Packet amendment 1: "the three
  operator-facing doors hold three deliberate postures, and the touchline
  checks nothing." A walk-up always mints a new person; a duplicate is
  reconciliation's problem.
- **No real Meta send.** The local sink proof is the acceptance bar; real
  template approval and credentials remain LAN-168, LAN-199 and LAN-210,
  Brian's.
- **No change to `declareRecruitmentCycleJobsIn`'s signature or the template
  registry.** Both are called, unchanged in shape; only the completion
  predicate's own correctness bug was fixed.

## Visual evidence

Both the sheet (with its Recruits group populated from the seeded
"Freshers' Fair — stand" recruitment event) and the walk-up form were proved
at desktop (1440px) and a Playwright-measured 375px —
`npm run visual:preflight` against the real login. See the package receipt
for the exact routes and the ignored evidence path.

Re-proved, at the head carrying the OWNER-WALKUP-GROUP-ORDER correction,
against the same seeded event with a real recruit and a real walk-up both
present, confirming Recruits, then Walk-ups, then Attending, at both
viewports.

## Decision history relocated from source (LAN-300)

### src/lib/services/attendance.ts — `RECRUIT_ROSTER_QUERY`

> Every recruit on the board this season, for a recruitment event's sheet
> only — Brian, 2026-09-01, on the running fidelity mockup (LAN-200):
> "if a recruit is already in our system and we're at a recruitment event,
> all recruits should already be on the page for the event. If they happen
> to show up, I'll mark them as present, even if they didn't RSVP." — W12's
> own "recruits first" is therefore not an invitation filter the way a
> player's row is; a recruit belongs on the sheet by virtue of being an open
> or recently-exited prospect for this season, invited to this particular
> event or not.
>
> `joined` is excluded — a converted prospect is a player now, tracked by
> their season membership like anybody else, and would otherwise show twice.
> `void` is excluded on the schema's own steer (`prospect_status`'s comment:
> "whether a void record shows on the board is a display rule … decided by a
> later package" — this one): a void row says the record itself is wrong,
> never a fact about the person, so it names nobody to put on a sheet.
> Every other status stays, `declined` and `disengaged` included — "an exit
> status is not a gate on the door: somebody who declined can still turn up,
> and the club records that they did."

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/attendance.ts — `recordWalkUpAttendance`

> ## What changed, and who decided it
>
> Brian, 14 August 2026, reviewing the built screen. The first version captured
> a single name and an optional contact and wrote nothing but a `people` row,
> on his 12 August decision that the recruitment workflow must not be launched
> at the side of a pitch. Looking at it, he changed his mind about where the
> person lands: "add walk-on attendance should go in like a new person is being
> added, not in the roster, not in the season roster, but in the person in the
> recruitment… they're not on the team yet. That's how they're a walk-on."
>
> LAN-85 still owns everything after this point — following the prospect up,
> converting them, and what the club does with them across future events. What
> this owes that work is a person with a number and a record saying where they
> came from, which is what it now leaves behind.
>
> ## Which capacity, and why it moved
>
> `recruit`, anchored to the person. It used to be `guest`, and the reason
> given was that "`recruit` asserts the club is recruiting them, which is a
> judgement nobody made at the moment somebody wrote a name on a phone". That
> judgement is now exactly what the form makes: the same act creates the
> prospect record. `guest` would leave the attendance row disagreeing with the
> recruitment row about what this person is.
>
> There is no longer a roster-match path. It offered to anchor the row to an
> existing membership at `player` capacity, and Brian removed it — "they know
> who's on their roster, there are only 40 people". A walk-on is now always a
> new person; a duplicate is reconciliation's problem, which is what the
> prospect record exists for.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/attendance.ts — `authoriseWalkUpMessagingIn`

> Two acts, both inside the walk-up's own transaction so the recruit,
> their consent and the cycle's jobs are one atomic write:
>
> 1. **Records the opt-in.** The verbal read-back at the touchline is this
>    door's whole consent model — `messaging-consent.ts`'s own module note
>    names `walk_up_read_back` as a source that module deliberately never
>    writes, "a different package's own write". This is that write: granted,
>    dated now, attributed to the operator who took the read-back.
> 2. **Declares the cycle's jobs.** `declareRecruitmentCycleJobsIn`
>    (LAN-203) turns the now-granted consent into `notification_jobs` rows
>    for whichever tracks are still incomplete — never a second template
>    registry, never a second send loop, per the amendment's own words. A
>    brand new walk-up recruit has just been granted consent via
>    `walk_up_read_back`, so `readRecruitmentCycleCompletionIn`'s
>    `welcomeStepComplete` reads false for them (LAN-205's own fix to that
>    function) and the welcome track is declared — the one template this
>    door's read-back authorises. Nothing else is ever declared here: a
>    recruit already through the sign-up form is not created by this
>    function, and the questionnaire track waits on Questionnaire B, which
>    this door does not ask.
>
> Nothing here calls a provider, so a walk-up capture never blocks on a
> network round trip, and a recruit whose number cannot be delivered to is
> still fully captured — the job simply fails at dispatch time, terminally,
> exactly as `dispatchRecruitmentCycleJob` already handles for every other
> unreachable recipient.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.
