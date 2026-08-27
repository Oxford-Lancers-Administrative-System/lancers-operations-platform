# LAN-173 — Who is coming, who has not answered, repairing delivery, and the honest queue

Status: implemented. This is the **as-built** contract, written as part of delivery because the
mission packet supplied the design authority (workflows, acceptance evidence and mockups) rather
than a pre-implementation wireframe ticket. The current live LAN-173 issue and the mission
workflows W4, W5, W6 and W8 remain authoritative; this file records what was actually shipped and
does not restate `docs/ux/slice-ux.md`, `docs/ux/tickets/LAN-157-participation-and-club-link.md`,
`LAN-78-delivery.md` or `LAN-156-amend-and-cancel.md`.

> **Synthetic scenario data:** every displayed people, date and count in this mission's mockups is
> synthetic and does not correspond to real members.

## Purpose

Four workflows, none of which share files with each other:

- **W4** — the participation table's Delivery column reports the real state of each person's
  most recent job, and an unanswered person shows where the chase has got to.
- **W5** — a cross-event Follow-ups queue so nobody compiles a list of who has not answered, and
  the escalation to the President's office.
- **W6** — the delivery page's repair affordances become real, and a new diagnostics page gives
  per-attempt evidence.
- **W8** — a held job resumes when the amendment that held it resolves, and a reschedule
  recomputes the response deadline and the ladder counted from it.

## Controlling sources

- Workflows: `missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/workflows/W4-*.md`,
  `W5-*.md`, `W6-*.md`, `W8-*.md`.
- Acceptance: `.../acceptance/W4.md`, `W5.md`, `W6.md`, `W8.md`.
- Mockups: `missions/packets/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/mockups/W4.html`,
  `W5.html`, `W6.html`, `W8.html`, and every `W4-*`, `W5-*`, `W6-*`, `W8-*` screenshot pair
  (desktop and 375px). The W4 and W6 `-current` captures predate LAN-156 and show only the five
  provider-neutral states; `presentation.ts` carries the real, extended vocabulary.

## Owned screens and routes

| Screen                                                  | Route                                            | Audience                    |
| ------------------------------------------------------- | ------------------------------------------------ | --------------------------- |
| W4-01 Delivery column and chase position                | `/operate/events/[id]` (participation table)     | Operator-tier reader        |
| W5-01 Follow-ups queue                                  | `/operate/admin/follow-ups`                      | Any linked, active operator |
| W6-01 Delivery overview, with Needs attention           | `/operate/events/[id]/delivery`                  | `delivery_administration`   |
| W6-02 Delivery diagnostics, per-invitee and per-attempt | `/operate/events/[id]/delivery?view=diagnostics` | `delivery_administration`   |
| W8-01 Amendment hold-and-resume, reschedule note        | `/operate/events/[id]/amend`                     | `event_approval`            |

## This ticket builds

### W4 — the Delivery column becomes true, and carries a chase position

- The Delivery column already read the real provider-neutral state per LAN-157/LAN-169's own
  wiring (`DELIVERY_LATERAL` in `participation.ts`); this package adds the two named exceptions to
  that vocabulary and the chase position line beneath it.
- **Not dispatched — no channel** (`REQ-no-channel-backstop`) replaces a generic Failed chip when
  the job's own failure reason is the roster's own "no usable mobile/email" refusal. Counted,
  visible, offers no chase position (there is nothing to chase somebody the club has never
  reached).
- **WhatsApp unresponsive** (`REQ-whatsapp-outage-visible`) replaces a generic Failed chip when a
  WhatsApp-channel job's failure was carried by the automatic email fallback this package adds
  (below). Still counted, still shows a chase position — the person was reached.
- **Chase position** (`src/lib/services/chase-position.ts`, shared by W4 and W5): the rung already
  sent and the next one due — "Invitation delivered · WhatsApp 2 Thu 18:00" — for an unanswered
  person; **Chase stopped** for an answered person whose chase was actually running; **Escalated to
  the President** for an escalated person, with no further rung named. `null` (no line at all) for
  a walk-up, an ordinary answered row, or a no-channel person.
- The Delivery filter gains **Needs attention**, matching exactly the failed and retryable people
  — the same predicate `delivery/presentation.ts`'s own filter of the same name uses, so the two
  screens' filter agrees.
- A club-link holder's payload carries neither field — `buildClubLinkParticipationIn`'s
  field-by-field reassembly (LAN-157's own boundary) was not touched, and the new fields are
  computed only at the operator tier.

### W5 — the Follow-ups queue

- New page, `/operate/admin/follow-ups`, under Administration, above Operators — the mockup's own
  placement. `capability: null`: the workflow's primary actor is "the President, and any operator
  working follow-ups", the same floor Roster and Events already use, not the `role_management`
  seats Operators and Roles are narrowed to.
- Reads `nonresponse_queue`, the view LAN-169 already shipped and nothing rendered — one flat
  table, sorted soonest event first, with the event name repeated down the rows (the mockup's
  `W5-01` draws one continuous table, not a heading per event).
- Columns: Person, Event, When, Deadline, Where the chase has got to, Status. Status is one of
  **Chasing**, **Delivery problem**, **Escalated**, or **Escalation held: no President in post** —
  the last taken verbatim from `messaging-scheduler.ts`'s own comment naming what the queue must
  say for a vacant office.
- **One list, two streams** (`REQ-one-list-two-streams`): an undeliverable person (no usable
  route) is labelled `Delivery problem` rather than folded into the chase position, ahead of
  escalation — the club cannot chase somebody it has never reached.
- The escalation itself — raising the flag, resolving the office by its current holder, the
  no-personal-data template — is entirely LAN-169's (`messaging-scheduler.ts`,
  `src/lib/delivery/templates.ts`). This package only reads what that already writes.
- A search box (name only) filters the flat table; no Status/Entry dropdown filters are offered —
  a deliberate scope trim from the mockup's three-control filter bar, recorded under Known
  deviations below.

### W6 — repair affordances become real, and diagnostics is a page

- **Needs attention**, a new section on the delivery Overview, lists every failed/retryable person
  with the state chip and, per acceptance, what — if anything — an operator does:
  **Open their record** (linking to `/operate/roster/[membershipId]`) only for **Not dispatched —
  no channel**; **No action needed** for every other state, including **WhatsApp unresponsive** and
  an ordinary retrying failure, which additionally names the attempt count and the next attempt's
  own time (or "used", once none is scheduled).
- **The automatic email fallback** (`REQ-fallback-is-automatic`): when a WhatsApp-channel job
  becomes terminally failed — no usable route, or the provider's own refusal exhausts the attempt
  ceiling — `delivery.ts` creates and dispatches, inline, a same-content job over email, keyed by
  an idempotency-key suffix (`EMAIL_FALLBACK_SUFFIX`) rather than a new column, so it is excluded
  from every per-invitee listing (`readEventDelivery`, `participation.ts`'s own delivery lateral)
  and included in the new per-attempt diagnostics. A fallback that itself fails is a delivery
  failure like any other and is never retried a second time.
- **Not dispatched — no channel** stays **retryable** up to the attempt ceiling — this file's own
  settled answer (`delivery.test.ts`'s "records a terminal refusal as Failed even with attempts
  remaining"): a human may have corrected the roster since, and the repair for this state really is
  "fix the record, then press Retry".
- **Diagnostics** is now a real second table on the existing `?view=diagnostics` route — the
  original per-invitee table (LAN-78's own UX-51) is unchanged, and a new **Every attempt** table
  beneath it shows one row per attempt per channel — person, channel, attempt number, when,
  outcome, provider reference — across every job type for the event, including the fallback's own
  attempts. No message content on either table. This is additive, not a replacement: see Known
  deviations.

### W8 — a held job resumes, and a reschedule recomputes

- **`resumeHeldMessagesIn`**: `amendApprovedEvent` now releases every job it holds in the same
  transaction that holds it — held is transient, never an externally observable resting state.
  The notify choice decides only whether a `schedule_change_notice` is additionally owed; it never
  decides whether the held jobs themselves come back.
- **`recomputeScheduleOnRescheduleIn`**: when the amendment moves `scheduledOn` or `startsAt`, the
  response deadline and the whole ladder are recomputed via `resolveMessagingPlanIn` — the
  identical arithmetic approval runs — resolved "as of" the amendment's own moment. A rung the
  shortened runway no longer schedules is cancelled (never as a failure); the frozen
  `event_messaging_plans` row is re-written so the escalation threshold moves too.
- The amend form's review step now states, when the date or start changed: "You changed the date
  or start, so the RSVP deadline and every reminder are recalculated from the new one. The app
  will say a reschedule is happening" — the mockup's own sentence, per acceptance #7.
- `queuedMessagesDetail`'s sentence changed from "Saving holds N queued messages." to "Saving holds
  N queued messages, then resumes them." — the one line on this screen that ever asserted the old,
  now-corrected behaviour.

## Explicitly not in this ticket

- Sending `schedule_change_notice` and `cancellation_notice` jobs. **Investigated and deliberately
  not built**: giving these a channel and letting the sweep claim them runs the same `claimJobIn`
  path every other job takes, and that path unconditionally mints an RSVP token — which
  `issueTokenIn` refuses for a **cancelled** event exactly as it refuses a started one. A
  `cancellation_notice`'s event is cancelled by definition, so every claim would throw, roll back
  before `attempt_count` increments, and be reclaimed by the very next sweep tick forever — the
  identical unbounded-retry failure `messaging-scheduler.ts`'s own `readDueJobs` comment documents
  for a started event's player rungs, reached here by a different door. A notice needs a send path
  that mints no token, on the model of the escalation's own `dispatchEscalationJob`; building one
  is real, undone work. **This needs Brian's or the Lead's decision before anyone builds it** — see
  the note left in `event-amendment.ts`'s `recordNoticesOwedIn`.
- `/operate/admin/messaging` (LAN-171) and the player-facing surfaces under `src/app/a/` and
  `src/app/me/` (LAN-172) — both merged onto this branch, both explicitly out of this package's
  boundary, and neither was refactored toward a shared component with this package's surfaces.
- Any migration. `nonresponse_flags`, `event_messaging_plans`, `messaging_schedules` and every
  column this package reads or writes were created by LAN-169 and merged; `supabase/migrations/`
  on this branch is unchanged from `main`.
- A Status or Entry filter on the Follow-ups queue. Recorded under Known deviations.
- The Monday exception report's own rendering — Mission 9's surface, fed by the same
  `nonresponse_flags` history this package reads.

## Ticket interaction contract

- Reading the Delivery column, the chase position, the Follow-ups queue and the diagnostics pages
  writes nothing and dispatches nothing.
- The automatic email fallback is the one write path this package adds outside an explicit
  operator action; it is triggered only by a WhatsApp job's own terminal failure, never by an
  operator pressing anything, and it is itself subject to the same failure/retry accounting as
  every other job.
- No provider identifier, template id, phone number or message body appears on the participation
  table, the Follow-ups queue, or the delivery Overview. The diagnostics page's per-attempt table
  carries a provider reference and never a message body.
- Button labels carry no em dashes.
- Preserve the desktop and 375px information hierarchy the mockups show. Responsive reflow may not
  remove required information or actions; one card per row below the table breakpoint, no
  horizontal scrolling.
- Before a later change to any of these four surfaces, re-read the live LAN-173 issue, this file,
  and the four workflow/acceptance documents, and reconcile anything recorded since.

## Acceptance criteria

Restated from `acceptance/W4.md`, `W5.md`, `W6.md` and `W8.md` as what was built to satisfy them:

- Delivery reports the real state of each person's most recent job in the shipped vocabulary, plus
  the two named exceptions; the Delivery filter's **Needs attention** selects exactly the failed
  and retryable people.
- An unanswered person's chase position names the rung sent and the next due; an answered person
  shows none; an escalated person reads **Escalated to the President** and names no further rung;
  a person whose answer arrived after a real chase reads **Chase stopped**.
- Chase position and Delivery are operator-tier only, proved by the club-link payload carrying
  neither field.
- The Follow-ups queue lists every unanswered and undeliverable person across approved events,
  under one status vocabulary, reachable by any seated operator and by nobody else.
- The delivery page's counts are real; retries and the email fallback offer no operator action;
  only **Not dispatched — no channel** requires a person, and what it requires is a roster fix
  (linked) — retry stays available for exactly the reason `delivery.test.ts` already settled.
- Diagnostics shows one row per attempt per channel, including the fallback, with no message
  content.
- A cancelled or held-then-resumed job never appears as a delivery failure.
- Saving an amendment holds every unsent job and resumes every one of them in the same save; a
  reschedule recomputes the deadline and the ladder, and the application says so before the
  operator commits.
- One card per row below the table breakpoint; no horizontal scrolling; desktop and true 375px
  both conform.
- `npm run verify` passes.

## Known deviations from the mission packet's mockups

- **Diagnostics is additive, not a replacement.** `W6-02`'s mockup draws a single per-attempt
  table as the whole of the diagnostics page. The page already carried a different, working
  per-invitee table (LAN-78's UX-51, itself pinned by a security-relevant "complete inventory of
  controls" test guarding against a manual-send path). Replacing it risked that guard along with
  real, tested behaviour for a redesign the mockup alone does not clearly require dropping. The
  per-attempt table was added beneath it instead, satisfying the acceptance criterion's letter
  ("shows one row per attempt per channel… including the fallback") without removing a section an
  operator already depends on. This is a considered choice, not a silent one — flagged here rather
  than built and left unrecorded, per Q-22.
- **The Follow-ups queue's search is name-only.** `W5-01`'s mockup shows Status and Entry dropdown
  filters beside the search box. Given the package's overall scope, only the search box was built;
  the queue's grouping, sort and status vocabulary are all present and correct, and a person can
  always be found by name. Recorded as a scope trim rather than built and left undisclosed.
- **`schedule_change_notice`/`cancellation_notice` are recorded as owed and never sent** — see
  Explicitly not in this ticket. The mockups do not show this internal mechanism directly, but
  W8's own acceptance language ("informs everybody already invited of what changed") implies
  delivery; this ticket delivers the recording half honestly and names the sending half as
  undone, owner-decision-required work rather than building a send path that could strand a job in
  an unbounded retry loop.
- **A real terminal "no usable route" visual example required a local, ephemeral data correction**
  during preflight: the seeded scenario's `last_error` text and `delivery_results.outcome`
  predate this package's `recordUndeliverableIn` fix (which now writes `outcome = 'rejected'`
  rather than `'failed'`, so a permanently unroutable person is not silently miscounted as
  **Retryable**). No seed script, migration, or committed data changed — only a local database row
  on the throwaway preflight stack — and `delivery.test.ts` proves the corrected write path
  directly against a fresh dispatch.
