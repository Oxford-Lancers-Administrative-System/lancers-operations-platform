# W2 — Add one player by hand

- Purpose/intended outcome: One person turns up who was not in the file. An
  operator enters them and they arrive exactly where an imported player arrives
  — on this season's roster in onboarding, with the same checklist and the same
  welcome. No second door, no second shape.
- Primary actor: An operator (any linked, active operator who is not a coaching
  assignment) — see the decisions.
- Trigger: A player the club does not yet hold this season needs to be on the
  roster, and there is no file to import.
- Entry point: The roster board's **Add players** menu, **Add one player**.
- Route/placement: `/operate/roster/new` — **it already exists**, built by
  LAN-74 as the returner intake. This workflow does not create a surface.
- Controlling source: subject area `S2`; `M2` (onboarding-opened fires the
  welcome carrying the sign-up ask); `OD7-season-inherit`; the approved
  item-and-ask inventory.
- User-visible result: The person is on the roster at `onboarding`, their
  checklist generated, their welcome queued, and the operator is on their
  record.

## What already works, and must not be rebuilt

This is the shortest workflow in the mission, because `main` already does most
of it. `enterReturningPlayer` in `src/lib/services/roster.ts`, in one
transaction, already:

- mints the person and records their contact points, or reuses the person the
  operator picked;
- creates the season membership **at `onboarding`** — the status is not the
  operator's to choose (`roster.ts`: "A membership now begins at `onboarding`");
- writes the `null → onboarding` transition into `season_membership_status_events`;
- **generates the season's onboarding items** — `generateOnboardingItems`, in
  the same transaction, idempotent, so a season with no configured types is a
  no-op rather than a failure; and
- records `person_created` and `returner_membership_confirmed` audit rows.

The three-step screen is shipped too: **details**, then **candidates** — the
duplicate check, which never writes — then a **membership refused** step when
the person the operator picked already holds a membership this season.

**So the checklist is not this mission's to build here.** Subject area `S2` says
`/operate/roster/new` "exists but opens nothing", and read against the code that
means one precise thing: **nothing is sent.** There is no welcome, no signed
link, and therefore no way for the person to answer. That is the whole of what
W2 adds.

## Current `main` grounding

- Locally rendered route: **`/operate/roster/new`**, photographed as it runs.
  Unlike W1, this workflow's route exists, so both sides are the same page.
- Reused component, language, interaction, and permission patterns: all of them.
  The form, its field order, its error sentences, the candidate cards, the
  already-a-member refusal and the redirect to
  `/operate/roster/[membershipId]?created=1` are kept exactly as shipped.
- Desktop and 375px evidence: both sides photographed at a measured 1280 and 375.
- Reason for any departure: two, and only two — the required set, and the
  welcome. Both are below.
- **No new UX element.** Brian, 2026-09-01: "So long as we're not inventing new
  UX elements here." Two were removed on that instruction. What the form does on
  confirming is said in the page's own subtitle rather than a new banner
  underneath it; and the record's confirmation is the shipped `created-summary`
  sentence rewritten, not a new card. An earlier draft added a "What the club
  has said" card, which was wrong twice over: it invented an element, and the
  per-player activity log is **W6's** — `S32`, `T10-activity-log`,
  `PR7-activity-log` and `OD7-log-by-section` all name W6 as its owner. Where a
  queued welcome shows on the record is W6's question, not this workflow's.

## Required actions

1. **Open the form** from **Add players → Add one player**.
2. **Enter first name, last name and mobile.** All three are required; personal
   email is optional here and is one of the things the welcome link collects.
3. **Check for matches.** The shipped step, unchanged: it never writes, and an
   empty candidate list is still the operator's call rather than an automatic
   create.
4. **Choose** — use the person the club already holds, or confirm this is
   somebody new.
5. **Read what happened.** The person's record, with their generated checklist
   and their welcome shown as queued.

## State transitions

| From                          | To                                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| No membership this season     | `onboarding`, checklist generated, welcome queued. One transaction; the welcome enqueues in it. |
| Already holds a membership    | Nothing. The shipped refusal names the person and their season and offers their record instead. |
| Operator abandons at any step | Nothing is written. `check` never writes.                                                       |

## Handoffs

| To        | What is handed over                                                                               |
| --------- | ------------------------------------------------------------------------------------------------- |
| `W4`      | The welcome and its signed link — identical to the one an imported player receives.               |
| `W6`      | The generated checklist, on the record the operator lands on.                                     |
| `W8`      | The new person joins the outstanding population the Monday queue ranks.                           |
| Mission 4 | The queued welcome. This workflow never dispatches.                                               |
| Mission 5 | The person, the contact points, the membership, the duplicate check and the record — all shipped. |

## Dependencies and mission boundaries

| Seam                        | This mission's side                                 | The other side                                 | Blocking?                                  |
| --------------------------- | --------------------------------------------------- | ---------------------------------------------- | ------------------------------------------ |
| Mission 5 · returner intake | Requiring last name and mobile; queuing the welcome | The whole surface and its transaction, shipped | **Independently walkable**                 |
| Mission 5 · duplicate check | Nothing — it is consumed unchanged                  | `findPersonCandidates`, shipped                | **Independently walkable**                 |
| Mission 4 · dispatch        | Enqueuing `onboarding-opened`                       | Scheduler, transport, delivery states          | **Independently walkable**                 |
| Mission 11 · seasons        | Inheriting the roster's current season              | Creating one                                   | Not blocking; a walk needs a seeded season |

## Exceptions and recovery

| What goes wrong                                   | What the operator sees                                                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| First name, last name or mobile missing           | The field's own sentence, in the shipped style. **Last name and mobile are new refusals** — see the decisions. |
| The mobile is not a phone number                  | The shipped `PHONE_SHAPE` sentence.                                                                            |
| The email is not an email                         | The shipped `EMAIL_SHAPE` sentence. Optional, so blank is fine.                                                |
| The person already holds a membership this season | The shipped `membership_refused` step, naming them and their season, with a link to their record.              |
| Nothing matched                                   | Still the operator's call. There is deliberately no path where an empty candidate list creates a person.       |
| The welcome cannot be queued                      | The whole transaction rolls back. A person on the roster who was never told is the failure this avoids.        |
| No season exists                                  | The shipped unavailable screen. Season creation is Mission 11's.                                               |

## Safety, privacy, consent, and authority boundaries

- **The welcome is the one message the club may send without consent**, and its
  purpose is to obtain it. Queued, never sent by hand.
- **One transaction.** The membership, the checklist and the queued welcome
  commit together or not at all.
- **No date of birth here.** It is restricted, and it is asked of the player at
  onboarding through their own link.
- **Every arrival is audited** — the shipped `person_created` and
  `returner_membership_confirmed` rows, unchanged.
- **Nothing gates.** The player is a full member of the squad from the moment
  they land.

## Acceptance evidence

- A walk on a fresh local stack: entering a new person creates them at
  `onboarding` with the full checklist and one queued welcome; the operator
  lands on their record and can see both.
- Submitting without a last name, and without a mobile, is refused with the
  field's own sentence.
- Entering somebody who already holds a membership this season reaches the
  shipped refusal and writes nothing.
- The welcome is the same template an imported player receives — proven by
  importing one and adding one and comparing the queued rows.
- Desktop and 375px screens for the three states, both sides.
- `grounding: application-walked`.

## Core decisions

| Decision                                                                                                 | Classification              | Governing evidence or recommended default                                                                                                                                                                                                                                 | Status |
| -------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| The route, the three steps, the duplicate flow, the refusal and the redirect are kept exactly as shipped | locked                      | `S2` — the surface exists; this mission brings it onto the one path rather than replacing it                                                                                                                                                                              | open   |
| The membership begins at `onboarding` and the checklist generates in the same transaction                | locked                      | Already true on `main`; `roster.ts` and `generateOnboardingItems`                                                                                                                                                                                                         | open   |
| The welcome is queued on confirmation — the same template, and the only thing this workflow adds         | locked                      | `M2`, boundary §2, and W1's approved decision that confirming queues rather than sends                                                                                                                                                                                    | open   |
| **Last name and mobile become required, joining first name**                                             | locked                      | The approved item-and-ask inventory (Brian, 2026-09-01), and `person-required.ts`, which already requires last name at every tier. The form is behind the required set it feeds; today only first name is enforced                                                        | open   |
| **Authority stays at the shipped general-operator floor, rather than the four-role W1 uses**             | proposed for owner approval | W1 narrowed because it writes dozens of people at once. This is the everyday single-record path, already open to any linked active operator who is not a coach, and narrowing it would take a surface away from people who use it today. Recommended: leave it as shipped | open   |
| Whether personal email stays optional here                                                               | proposed for owner approval | Recommended: yes. The welcome travels by mobile, and email is one of the things the player's own link collects. Requiring it here would block an operator who genuinely does not have it                                                                                  | open   |
| Field order, the exact new error sentences, and where the "welcome queued" line sits on the record       | delegated to Mission Lead   | Mechanical; the shipped sentences are the precedent                                                                                                                                                                                                                       | open   |

## Brian approval

- Exact words: "Last name and mobile are absolutely required. That's what I'm
  telling all my bots at this point, and W2 is fucking approved. So long as
  we're not inventing new UX elements here"
- Date: 2026-09-01
- Condition, and how it was met: the approval is conditional on inventing no new
  UX element. Two were found and removed before it was recorded — the info
  banner on the form, and the "What the club has said" card on the record. Both
  are now shipped elements with rewritten text.
- The two open decisions resolved as recommended, and both mean _leave it as
  shipped_: authority stays at the general-operator floor, and personal email
  stays optional.
