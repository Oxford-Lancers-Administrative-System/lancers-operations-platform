# Frozen workflow inventory — M-RECRUITMENT

Definition: one primary actor's end-to-end journey from trigger and entry point to
one user-visible result.

Thirteen workflows. The order is the execution order: `Wn` completes before
`Wn+1` is approved, so the numbering is a decision in itself and not a listing
convenience.

**Why this order.** The board comes first because it is the spine — its columns
decide which recruit facts and which signals exist, and every other workflow puts
something on it or takes something off it. Designing a door before the board is
settled invites rework in the door. The board and the recruit's record are also
the two surfaces with a real photograph available: `/operate/roster` and
`/operate/people/[personId]` are running code at `main@e669331`, so the first two
comps are current-versus-proposed rather than drawn. The doors follow, then the
ask, then the messages, then the events, then the exits. **The flip is last, by
Brian's instruction**, because it is the hand-off out of the mission and its
shape depends on what everything before it became.

1. `W1` — **The recruit board**: an operator opens recruitment's own board → one
   line per recruit, person details then recruitment details, event columns
   appended at the right end, findable and filterable, actions from the row.
2. `W2` — **One recruit's record**: an operator clicks a row → that recruit's own
   working page, their details, their signals, their notes, correctable there.
3. `W3` — **Capture a walk-up as a recruit**: an operator or coach taking
   attendance writes somebody down → that person is a recruit on the board.
4. `W4` — **Add a recruit by hand**: an operator sources somebody and enters them
   → the recruit exists, deduped, welcomed.
5. `W5` — **Sign yourself in**: a recruit scans the QR at Freshers' Fair or a
   taster → they have entered themselves into the club's own page and are on the
   board.
6. `W6` — **Resolve a possible duplicate**: an operator opens the review queue →
   the parked capture is either the existing person or a new one, and nothing was
   silently created, merged, or messaged.
7. `W7` — **Answer the recruit-stage ask**: a recruit opens their signed link →
   they tell the club the recruit-stage field set about themselves.
8. `W8` — **Follow up with a recruit**: an operator decides to reach out → a
   polite, good message leaves the app and is visible against that recruit.
9. `W9` — **Administer recruitment's messages and its QR**: an operator changes a
   template, the group link, the timing, or mints and revokes a QR → the change
   takes effect and who changed it is recorded.
10. `W10` — **Run a recruitment event**: an operator schedules one and invites the
    Recruits audience → the event is approved knowing exactly what it sends and to
    whom.
11. `W11` — **Take attendance at a recruitment event**: an operator or coach works
    the sheet → recruits at the top, everyone else below, walk-ups captured into
    the flow, and turnout is the sum of the records.
12. `W12` — **Take a recruit off the board**: an operator records that a recruit
    declined, went quiet, or was never real → they leave the board without leaving
    the record, and the history stays intact.
13. `W13` — **Flip a recruit to joined**: one of the core four decides a recruit is
    in → a confirmation interrupts, the season membership exists, the roster shows
    them joined this season, and onboarding opens.

## Excluded stages and invariants

These are real parts of the subject that are deliberately **not** workflows,
because a workflow is one actor's journey and these are properties, corrections,
or other missions' work.

- **Never harsh** is a system property, not a workflow. It is swept for across
  every surface and evidenced once, and it constrains W8, W10 and W11 rather than
  being a journey of its own.
- **The capacity suppression and the `countByCapacity` fix** are corrections to
  Mission 4's shipped machinery, verified inside W10 and W11. At `main@e669331`
  `scheduleEventLadder` inserts a reminder job for every invitation on an event
  with no capacity filter, so a recruit invited today receives the player
  escalation ladder; the fix narrows that ladder to players and leaves W8's polite
  reminder as recruitment's own.
- **The recruit-stage field set** is enumerated as an artifact of this stage and
  approved with W7, not as a workflow.
- **The signal set** is enumerated from the 2026-08-28 observability research and
  approved with W1's columns, not as a workflow.
- **Everything after the flip** is Mission 7's; **consent wording, retention and
  erasure** are Mission 8's; **event and calendar machinery** is Mission 2's;
  **transport, scheduler and templates** are Mission 4's and are used verbatim.

## Open questions carried into the freeze

1. **W9 is two objects in one workflow** — the message templates, group link and
   timing on one side, minting and revoking a QR on the other. They are one
   operator's administration of recruitment's machinery, so they are drawn
   together; if Brian wants the QR administered on its own, W9 splits and the
   count becomes fourteen.
2. **W8 versus the 2026-08-18 owner direction.** The Authority Manifest §5 records
   an operator-facing direct message-and-flag capability on the roster/member
   surface, with Mission 7 named as its candidate home and Mission 7's portfolio
   row repeating that. The 2026-08-31 never-harsh amendment gives Mission 6 an
   operator follow-up surface for recruits. These are the same idea pointed at two
   different populations. W8 is drawn as recruitment's own, for recruits only, and
   the general member-facing version stays Mission 7's — but that seam is Brian's
   to confirm, not intake's to assume.

## Inventory amendments

None.

## Brian approval

- Exact approved list/count:
- Exact words:
- Date:
