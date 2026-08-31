# Frozen workflow inventory — M-RECRUITMENT

Definition: one primary actor's end-to-end journey from trigger and entry point to
one user-visible result.

**Fourteen workflows, frozen by Brian on 2026-08-31.** The order is the execution
order: `Wn` completes before `Wn+1` is approved, so the numbering is a decision in
itself and not a listing convenience.

**Why this order.** The board and the recruit's record lead. They are the spine —
the board's columns decide which recruit facts and which signals exist, and every
other workflow puts something on one of them or takes something off. They are also
the two surfaces with a real photograph available: `/operate/roster` and
`/operate/people/[personId]` are running code at `main@e669331`, so the first two
comps are current-versus-proposed rather than drawn, and they carry the shipped
board's structure, grouping and colour language forward on Brian's instruction.

The sign-on flow follows them, by Brian's decision at the freeze. It is the
smallest thing in the mission and the most load-bearing outside it — Missions 7
and 8 inherit whatever shape it takes, and every door in this mission ends by
firing it — but what it produces lands on the board, so the board is drawn first
and the flow is drawn into it.

Then the recruit's own form, then the doors, then the follow-up surface, then the
administration that configures all of it, then the events, then the exits. **The
flip is last, by Brian's instruction**, because it is the hand-off out of the
mission and its shape depends on what everything before it became.

1. `W1` — **The recruit board**: an operator opens recruitment's own board → one
   line per recruit, person details then recruitment details, event columns
   appended at the right end, findable and filterable, actions from the row.
2. `W2` — **One recruit's record**: an operator clicks a row → that recruit's own
   working page, their details, their signals, their notes, correctable there.
3. `W3` — **Say yes to the club**: a newly captured recruit receives the club's
   first message → they accept WhatsApp communication and answer the standard
   recruit ask on the spot, and the club knows it can reach them.
4. `W4` — **Fill in your details**: a recruit opens the form minted for them and
   linked to their person → they tell the club as much about themselves as they
   choose, and one polite reminder follows if they do not.
5. `W5` — **Capture a walk-up as a recruit**: an operator or coach taking
   attendance writes somebody down → that person is a recruit on the board and
   `W3` has begun.
6. `W6` — **Add a recruit by hand**: an operator sources somebody and enters them
   → the recruit exists, deduped, and `W3` has begun.
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
    sends to each audience, each audience is chased on its own terms, and a
    recruit sees only the event's public details.
12. `W12` — **Take attendance at a recruitment event**: an operator or coach works
    the sheet → recruits at the top, everyone else below, walk-ups captured into
    the flow, and who showed up reads back onto the recruit's row.
13. `W13` — **Take a recruit off the board**: an operator changes a recruit's
    status to an exit value → the recruit leaves the board, the board resorts, the
    record and its history stay intact, and nothing further is sent.
14. `W14` — **Flip a recruit to joined**: one of the core four decides a recruit is
    in → a confirmation interrupts, the season membership exists, the roster shows
    them joined this season, and onboarding opens.

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
- **A recruit sees only an event's public details** — invariant 8 in
  `01-overview.md`, an access boundary rather than a screen decision.
- **The recruit-stage field set** is enumerated as an artifact of Stage 2 and
  approved with `W4`; the standard recruit ask is approved with `W3`.
- **The signal set** is enumerated from the 2026-08-28 observability research and
  approved with `W1`'s columns.
- **Everything after the flip** is Mission 7's; **consent wording, retention and
  erasure** are Mission 8's; **event and calendar machinery** is Mission 2's;
  **transport, scheduler and templates** are Mission 4's and are used verbatim.

## Questions that stood against this inventory — all settled 2026-08-31

1. **The follow-up surface versus the 2026-08-18 owner direction — settled.** The
   Authority Manifest §5 named Mission 7 as the candidate home for an operator
   message-and-flag capability, and never promoted it into a brief. Brian: _"Yes,
   recruits need a follow-up surface. That is not Mission 7. That is Mission 6.
   Mission 7 can inherit from Mission 6 if it wants to."_ `W9` is this mission's.
2. **What a recruit sees of an event — settled, and it stays inside `W11`.**
   Brian: _"The recruit should just see the public details of the event. It
   shouldn't see attendance or anything like that."_ There is not enough in the
   recruit's view to justify a fifteenth workflow.
3. **Whether channel registration is its own workflow — settled, yes**, and then
   placed third rather than first at the freeze.

## Inventory amendments

None. Any change to these fourteen ids, names, order or count requires another
explicit approval from Brian and is recorded here.

## Brian approval

- Exact approved list/count: the fourteen workflows above, `W1`–`W14`, in this
  order. Approved as the thirteen-then-fourteen list of 2026-08-31 with one
  ordering change in Brian's words: _"W1 should be moved after the recruits'
  records"_ — the sign-on flow moves from first to third, behind the board and the
  record, and nothing else moves.
- Exact words: "I approve of everything else. Let's move on to the next stage."
- Date: 2026-08-31
