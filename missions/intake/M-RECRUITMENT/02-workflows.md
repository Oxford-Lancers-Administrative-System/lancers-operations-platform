# Frozen workflow inventory — M-RECRUITMENT

Definition: one primary actor's end-to-end journey from trigger and entry point to
one user-visible result.

Fourteen workflows. The order is the execution order: `Wn` completes before
`Wn+1` is approved, so the numbering is a decision in itself and not a listing
convenience.

**Why this order — revised at Brian's 2026-08-31 inventory review.** The first
draft led with the board. It now leads with the sign-on flow, on his direction:
_"The initial WhatsApp registration… Even though it's rather small, it will define
this for other steps in this process. Recruits are the easiest place to handle
this."_ Channel registration is the smallest thing in the mission and the most
load-bearing outside it — Missions 7 and 8 inherit whatever shape it takes, and
every door in this mission ends by firing it. Settling what the club says and when
it says it also settles what a recruit signal actually is, which is what the board
then shows.

The board and the record follow immediately, because they are the spine and
because they are the two surfaces with a real photograph available:
`/operate/roster` and `/operate/people/[personId]` are running code at
`main@e669331`. Then the doors, then the follow-up surface, then the events, then
the exits. **The flip is last, by Brian's instruction.**

1. `W1` — **Say yes to the club**: a newly captured recruit receives the club's
   first message → they accept WhatsApp communication and answer the standard
   recruit ask on the spot, and the club knows it can reach them.
2. `W2` — **The recruit board**: an operator opens recruitment's own board → one
   line per recruit, person details then recruitment details, event columns
   appended at the right end, findable and filterable, actions from the row.
3. `W3` — **One recruit's record**: an operator clicks a row → that recruit's own
   working page, their details, their signals, their notes, correctable there.
4. `W4` — **Fill in your details**: a recruit opens the form minted for them and
   linked to their person → they tell the club as much about themselves as they
   choose, and one polite reminder follows if they do not.
5. `W5` — **Capture a walk-up as a recruit**: an operator or coach taking
   attendance writes somebody down → that person is a recruit on the board and W1
   has begun.
6. `W6` — **Add a recruit by hand**: an operator sources somebody and enters them
   → the recruit exists, deduped, and W1 has begun.
7. `W7` — **Sign yourself in**: a recruit scans the QR at Freshers' Fair or a
   taster → they fill the club's own form on the club's own domain, and submitting
   it lands them in the community group.
8. `W8` — **Resolve a possible duplicate**: an operator opens the review queue →
   the parked capture is either the existing person or a new one, and nothing was
   silently created, merged, or messaged.
9. `W9` — **Follow up with a recruit**: an operator decides to reach out, usually
   about something the recruit has not filled in → a polite, good message leaves
   the app and is visible against that recruit.
10. `W10` — **Administer recruitment's messages, cycles and QR**: an operator
    changes a template, the group link, the timing, whether a step runs at all, or
    mints and revokes a QR → the change takes effect and who made it is recorded.
11. `W11` — **Run a recruitment event**: an operator schedules one and invites
    recruits, players, or both → the event is approved knowing exactly what it
    sends to each audience, and each audience is chased on its own terms.
12. `W12` — **Take attendance at a recruitment event**: an operator or coach works
    the sheet → recruits at the top, everyone else below, walk-ups captured into
    the flow, and who showed up reads back onto the recruit's row.
13. `W13` — **Take a recruit off the board**: an operator changes a recruit's
    status to an exit value → the recruit leaves the board, the board resorts, the
    record and its history stay intact, and nothing further is sent.
14. `W14` — **Flip a recruit to joined**: one of the core four decides a recruit is
    in → a confirmation interrupts, the season membership exists, the roster shows
    them joined this season, and onboarding opens.

## What changed from the first draft, and why

- **`W1` is new.** Channel registration was a line inside the doors; it is now its
  own journey, on Brian's direction, because it defines the pattern other missions
  inherit.
- **The recruit's entry splits into `W1` and `W4`**, matching Brian's own
  description: accept and answer the standard ask immediately, then the fuller
  form asked politely with one reminder. What the standard ask is, and what the
  form collects, are open and are decided against drawings.
- **The board moved from first to second.** Its columns are still the spine; they
  are now drawn knowing what `W1` actually produces.
- **The QR keeps its own workflow** and gains Brian's named flow — scan, form,
  submit, group invite — with the detail still open.
- **Administration moved later, to `W10`.** It is the workflow Brian named as the
  one he is least sure of: _"W9 is important. I'm most confused about this one. I
  think we need to go through the workflow and find the boundary there."_ Walking
  it after the flows it configures means the boundary is found against real
  screens rather than guessed in the abstract. `W1` still settles which side of
  the Mission 4 line each piece of the ladder sits on, because it cannot be drawn
  without doing so.
- **Count is fourteen, not thirteen** — one added, none removed.

## Excluded stages and invariants

These are real parts of the subject that are deliberately **not** workflows,
because a workflow is one actor's journey and these are properties, corrections,
or other missions' work.

- **Never harsh** is a system property, not a workflow. It is swept for across
  every surface and evidenced once.
- **The two ladders.** At `main@e669331` `scheduleEventLadder` inserts a reminder
  job for every invitation on an event with no capacity filter, so a recruit
  invited today receives the player escalation, and `countByCapacity` omits
  recruits from the approval audit. The fix is not suppression: the player ladder
  stops reaching recruits, and recruitment's own ladder — one invitation and at
  most a polite follow-up — is built beside it. Verified inside `W11` and `W12`.
- **The recruit-stage field set** is enumerated as an artifact of this stage and
  approved with `W4`; the standard recruit ask is approved with `W1`.
- **The signal set** is enumerated from the 2026-08-28 observability research and
  approved with `W2`'s columns.
- **Everything after the flip** is Mission 7's; **consent wording, retention and
  erasure** are Mission 8's; **event and calendar machinery** is Mission 2's;
  **transport, scheduler and templates** are Mission 4's and are used verbatim.

## Open questions carried into the freeze

1. **`W9` versus the 2026-08-18 owner direction.** The Authority Manifest §5
   records an operator-facing direct message-and-flag capability on the
   roster/member surface, with Mission 7 named as its candidate home and Mission
   7's portfolio row repeating that. The never-harsh amendment gives Mission 6 an
   operator follow-up surface. These are the same idea pointed at two different
   populations. `W9` is drawn as recruitment's own, for recruits only, and the
   general member-facing version stays Mission 7's — but that seam is Brian's to
   confirm, not intake's to assume.
2. **What a recruit sees of an event** is currently the recruit-facing half of
   `W11`. It could be the recruit's own journey instead, which would make fifteen.
   Recommendation: leave it inside `W11`; `W1`, `W4` and `W7` already carry the
   recruit's real journeys, and an invitation they receive is thin beside them.

## Inventory amendments

None.

## Brian approval

- Exact approved list/count:
- Exact words:
- Date:
