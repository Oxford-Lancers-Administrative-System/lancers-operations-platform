# LAN-218 - The chase: the missing-data queue and its nudge, the configured cadence, and exhaustion to a human

Status: implemented, as built. This is the contract the shipped surfaces were
built against, not a plan — see `../slice-ux.md` for the shared vocabulary,
authorization and responsive rules this ticket does not restate, and `LAN-184`
for the missing-data queue's own pre-existing contract (`W7`), which this
package extends rather than replaces.

> **Synthetic scenario data:** all displayed people, contact details, dates
> and delivery outcomes are synthetic and do not correspond to real members.

Authority: LAN-218 in Linear, `missions/packets/M-ONBOARDING-AND-INFORMATION-COMPLETION/packet.json`
(`requirements`, `escalation_rules`), the specifications at
`missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION/workflows/W8-work-the-queue-and-nudge.md`,
`W9-pick-up-a-chase-that-ran-out.md`, `W11-set-onboardings-chase.md`, their
approvals at `.../acceptance/W8.md`, `W9.md`, `W11.md`, and the approved
photographs at `.../mockups/index.html` (screens `W8-01`…`W8-03`, `W9-01`,
`W9-02`, `W11-01`, desktop and 375px — `W11-01` shot at `main@0a04be7`, the
rest at `main@332bc6b`).

## Owned screens and routes

| Screen                   | Route/surface                                    | Audience                                                                                |
| ------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `W11-01`                 | `/operate/admin/messaging` (LAN-171, unchanged as a route) | `delivery_administration`                                                          |
| `W8-01`…`W8-03`, `W9-01` | `/operate/people/missing` (LAN-184, unchanged as a route)  | `person_record_authority`: President, Vice-President, Secretary, General Manager, IT Officer |
| `W9-02`                  | `/operate/roster/[membershipId]` (LAN-186/187, unchanged) | Whoever already opens that record — a concurrently shipped package's own surface, not touched here |

`W9`'s escalation message itself draws no screen anywhere — it is a message,
over WhatsApp or email, to whoever currently holds the configured office; its
exact content is fixed in `W9`'s own specification and reproduced verbatim in
`src/lib/delivery/templates.ts`.

## What renders

### `W11` — the Onboarding section

`/operate/admin/messaging` already carried three sections: Recruitment,
Event messaging, and Onboarding, the last rendering a heading over "Not built
yet." This package fills it with one row (`OnboardingChaseRow`, cloned from
the recruitment cycle's own `CycleStepRow` idiom) carrying exactly three
fields — **First chase after joining** (hours), **Ask this many times**
(a plain count), **Every** (days) — and one **SAVE ONBOARDING** button.
Moved to sit directly below Recruitment and above Event messaging, per
Brian's own correction recorded in `acceptance/W11.md`. No give-up value, no
quiet hours, no per-item owner and no escalation-office field are offered —
`OD7-cadence-is-the-config`'s own boundary, nothing here invents a fourth
control. A `chase_count` of zero saves and is legal, meaning no automated
chase at all.

### `W8` — the queue's two new columns and its nudge

`/operate/people/missing` (LAN-184's own shipped table) gains, per row:
**Last contact** — when, and what kind (the welcome, a numbered follow-up, or
a named operator's nudge) — and **Next** — a scheduled date, or one of three
distinct statements: `Chase exhausted`, `Unmessageable · no consent` /
`Unmessageable · under 18`, `Delivery failed · needs a person`, `No automated
chase` (when `chase_count` is zero). A checkbox column and a **Nudge** action
(per row, and a bulk "Nudge N people" bar once anything is selected) let an
operator select one person or several and send each their own compiled ask on
their own link in one action; the checkbox and Nudge button are withheld
only for `Unmessageable` rows — every other state, including `Chase exhausted`
and `Delivery failed`, still offers a nudge, because the queue **warns**, it
never refuses.

The queue defaults to **onboarding players only** (`onlyOnboardingPlayers` on
`listMissingDataQueue`), with Mission 5's full, unrestricted scope one click
away via **See everybody with missing data** — locked at the packet's own
recommendation. On first open of the onboarding-only view, rows sort
longest-waiting-first (never-contacted at the top, then oldest last-contact
ascending, ties alphabetical); the shipped Name/Missing sort headers still
work exactly as LAN-184 built them and override this default the moment an
operator picks one.

### `W9` — exhaustion and its escalation

No new screen: `W9-01` is the same `/operate/people/missing` table, scoped by
following the escalation's own link (no server-side filtering is added — a
membership reading `Chase exhausted` on the queue **is** what an office
holder finds after clicking through). `W9-02` is `/operate/roster/[membershipId]`'s
own activity log, extended with the rows this package writes
(`recordOnboardingActivityIn`): one `ask` entry per automated attempt, per
nudge, and one system entry recording that a chase exhausted and escalated.
That page's own rendering of the activity log is LAN-217's surface, running
concurrently in its own worktree; this package writes the rows and does not
touch the file that renders them.

The escalation message's own text is fixed, verbatim, by the packet:
_"The automated chase has finished for {count} players who still have
onboarding details outstanding. {link}"_ — a count and a link, never a name,
sent to whoever currently holds the configured office (`roles`/
`role_assignments`, initial value President). With no office holder, the
escalation is retained and marked held rather than sent to a stale name or
dropped, per the locked recommendation.

## What already exists, and is not rebuilt

- The missing-data queue itself — its table, its existing columns, its search
  and status/fact filters, its `Correct` action — is LAN-184's, untouched
  beyond the additions above.
- The messaging schedule page, its Recruitment and Event messaging sections,
  and the recruitment cycle's own rows — LAN-171/LAN-203's, untouched.
- The compiled ask, the durable per-person link, and the one-open-ask-per-
  person invariant — LAN-214/LAN-216's, read here, never re-derived.
- `/operate/roster/[membershipId]`'s own rendering, including the activity
  log's presentation — a concurrently shipped, separate package's surface.

## No new state, no migration

Every fact this package shows is derived from `notification_jobs` and its own
idempotency-key shape (`onboarding-chase:`, `onboarding-nudge:`,
`onboarding-chase-exhausted:`, `onboarding-chase-escalation:`), on
`emitOnboardingOpenedWelcomeIn`'s own idiom. "Exhausted" is `deliveredCount
>= chaseCount`, never a stored flag; "terminal delivery failure" is a chase
attempt whose own retry ceiling is reached with no delivered outcome; "next
automated contact" is computed from the configured cadence and the last
delivered attempt (or joining, for the first). Nothing here adds a column, a
table, or a new domain concept.

## Explicitly not in this ticket

- The checklist itself, its items, or per-item resolution — frozen, and
  earlier packages'.
- The compiled ask's own content and the durable link's minting — LAN-214/
  LAN-216's.
- `/operate/roster/[membershipId]`'s own layout and its activity-log
  rendering — LAN-217's, running concurrently.
- WhatsApp template submission to Meta for `onboarding_chase` and
  `onboarding_chase_escalation` — a future, separate owner action (LAN-220);
  both dispatch against the local/dev provider only today, on the identical
  posture the onboarding welcome's own template already carries.
- An automatic WhatsApp→email fallback for a terminally failed escalation —
  the event ladder's own escalation has one; this package's chase escalation
  does not, recorded as a deliberate scope trim rather than a silent gap.
- Any weakening of one-open-ask-per-person, any system-generated one-fact
  ask, or any change to the required set — the packet's own boundary,
  untouched.

## Safety boundary

A person without granted messaging consent, or flagged under 18, is never
messaged by any path — the automated chase or an operator's own nudge —
checked at declare time and re-checked at claim time immediately before
anything is sent. Date of birth itself reaches no list, board or queue; only
the derived under-18 flag does. Every send rides the shared delivery
pipeline, template-only; nothing here is sent by hand, and no environment
this package touches performs a real send (LAN-86, LAN-101).

## Acceptance criteria

The twelve numbered criteria in `WP-chase-and-queue`'s brief, and the
acceptance evidence sections of `acceptance/W8.md`, `W9.md` and `W11.md`, are
binding verbatim. This document does not restate them.
