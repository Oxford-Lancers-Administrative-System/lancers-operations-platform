# Boundary — M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY

- **Portfolio mission number:** 4
- **Commissioned outcome:** "**Automated Communications, Reminders & Recovery** —
  reminders, configurable nonresponse escalation, Resend Shape B email fallback,
  automated retry loop, R15 recovery runbook, template inventory,
  operator-recorded verbal RSVP"
- **Portfolio row URL and observed version:**
  [Release One Mission Portfolio, row 4](https://app.notion.com/p/3bb488886d578126a88cdd747f590a01)
  — approved by Brian Schuster 2026-08-19; page fetched 2026-08-22T14:52Z
- **Observed `main` SHA:** `c59bff174d6d17b5fa9dec4396eb3397d67e0c63`
- **Primary coverage:** R5, R6, R12, R15 · Tasks 02 + 03 · Scope 2
  ("Automated Communications, RSVP, Reminders and Recovery")
- **Deliberately shared coverage:**
  - **Task 11 transport reuse → Mission 6.** Mission 6's onboarding chase rides
    this mission's pipeline verbatim. One machine, two streams. The chase's
    behaviour, queue, caps and refused state stay with Mission 6.
  - **Consent enforcement → defined in Mission 7.** Mission 7 defines the lawful
    basis and the acceptance record; this mission refuses to dispatch without it.
  - **The event page → Mission 2 builds it; this mission adds to it.** Mission 2
    owns the event and its surfaces. This mission adds what those surfaces say
    about communication.
  - **Chase-list content ↔ Mission 9.** The Monday report is Mission 9's surface;
    this mission supplies its exception content.

## The ownership rule for this boundary

**Ownership is by subject, not by build state.** If it concerns a message the
club sends a person, or the response that comes back, it belongs to this mission
— whether it shipped months ago, is half-built, or does not exist.

This is written down because the first draft of this boundary got it wrong. It
excluded the RSVP page and the operator response-monitoring views on the grounds
that they were already built and verified. That is the wrong test: no other
mission in the portfolio touches responses, so excluding them left the response
surface with no owner at all. Brian corrected it, 2026-08-22:

> Just because it's built doesn't mean that it's out of scope. … If there is no
> other place we handle responses, this is the thing.

A shipped part being in scope does not mean it is rebuilt. It means this mission
is where its gaps are closed and where it changes when the surrounding machinery
changes.

## What this mission is

**Everything that happens between the club and a person, and everything that
comes back.**

Mission 2 decides _that_ a message is owed and to whom. This mission owns the
message, the answer, and the chase.

Release One's largest approved-but-unbuilt capability sits inside it. The
manifest's own words: R6 is "**Defined; not implemented** — no scheduler on main;
largest approved-but-untracked capability." Verified against `main` @ `c59bff1`:
the substrate exists and nothing drives it. `notification_jobs` carries
`scheduled_for`, an idempotency key and the six locked states; the `reminder` and
`escalation` job types are already in the enum; `nonresponse_queue` and
`invitation_response_state` are live views. There is no scheduler, no reminder
policy, no escalation flag and no Resend adapter anywhere in `src/`.

Clint's stated pain is the thing this mission answers: "My WhatsApp is
essentially unusable… 30 chats with players."

## In scope

### 1. Every message the club sends a person

Invitation, reminder, change notice, cancellation notice, escalation, chase, and
the onboarding acceptance message. Their content, their approved Meta templates
and their parameter contracts — Task 02's **F7** template inventory, enumerated,
created and tested.

Message structure is expected to change here. The shipped invitation template
carries four body parameters in a fixed order (invitee name, event name, when,
signed link); nothing about that is frozen by a decision, and restructuring what
goes out is this mission's to do.

### 2. When each one goes out

**The coherent schedule model is this mission's central design work, and it does
not exist today.** Three parts of it are genuinely absent rather than merely
unbuilt:

- **Sending ahead of the event.** Today approval _is_ the send — the invitation
  dispatches inside the same request. There is no "approve four weeks out, invite
  at two weeks." Introducing an anchor changes what approval means, because R4
  currently has approval atomically starting the invitations.
- **The ladder.** Today it is reminders before the deadline (0–3), then _one_
  escalation flag. Brian's 2026-08-22 sketch is longer: invite at an anchor,
  follow-up a day later, another two days after that, then escalation, then the
  President receives the list of who has not answered.
- **Compression, when there is not enough runway.** Today the only rule is that
  the _deadline_ clamps to approval time, and Task 03 §4.1 then says
  clamped-deadline events **skip reminders entirely**. So the current answer to
  "the practice is tomorrow" is that nobody is ever chased — and that is the
  commonest case, not the edge. Rules are owed for a fortnight, a few days,
  tomorrow, and approval after the deadline has already passed.

This reaches the event types. Mission 2 owns the type templates and deliberately
**removed** the chase threshold from them as this mission's; the values are here
either way. Whether an operator setting up a type sees that type's notification
schedule is a Stage 3 question, and the recommendation will be that they do.

- Invitations dispatch on approval, as today, until the schedule model replaces
  that rule.
- Reminders to unanswered invitations at configured offsets **before** the
  response deadline.
- A quiet-hours send window (proposed 08:00–21:00 Europe/London); anything
  outside it rolls to the next opening. Clamped-deadline events skip reminders
  and still receive the full grace before any flag.
- The policy that decides all of it: values in central repository config on the
  ADR 0021 pattern — one frozen table, one file, no default arm, reasoning beside
  the values — plus the operator-readable pointer saying where policy lives and
  how a change is requested.

### 3. How it goes out, and what happens when it fails

- WhatsApp first, as the primary attention channel.
- **F1** — the automated retry loop: Cloud Scheduler owns _when_, the database
  records what is due; backoff, attempt ceiling, idempotent
  `for update skip locked` claims (D6, M1).
- **F5** — the Shape B automated email + calendar fallback: Resend on the club
  domain, the same signed RSVP link, an ICS attachment, delivery and bounce
  webhooks into the same evidence tables.
- **D8** — the "Not dispatched — no channel" backstop, counted and visible.
- **F3** — the R15 recovery procedure (§5 verbatim) into the operating runbook.
- The delivery-confirmation webhook, which today is unconfigured and leaves every
  accepted message stalled at **Attempted**.

### 3b. Who a message may be sent to, and whether it can be addressed

The substrate that decides whether a person is reachable at all. All of it is
this mission's, and none of it was in the first inventory.

- **The recipient allowlist** (`src/lib/delivery/allowlist.ts`) — today the
  single control between an operator pressing Approve and forty real students
  receiving a message. Fail-closed, environment-driven. **It is replaced in this
  mission**; see the owner decisions below.
- **Telephone-number conversion** (`src/lib/delivery/phone.ts`) — the one place a
  recorded contact becomes a sendable number, and the "no usable number" refusal
  that feeds D8. **Widened to any country in this mission**; see below.
- **`contact_points`** — the deliberately unvalidated store this mission reads
  numbers and addresses from. The data is Mission 5's; every consequence of it
  being wrong is this mission's.
- **`club-time.ts`** — Europe/London. The 18:00 deadline anchor and every "N days
  before" offset resolve through it, and British Summer Time is a real edge on a
  schedule built from offsets. There is no quiet-hours send window.
- **Audit coverage** of delivery and response actions — retry, revoke-and-reissue
  and an operator-recorded response are all a person acting, and are recorded as
  such.
- **Two outbound email paths.** Supabase Auth already sends password resets and
  operator invitations over custom SMTP on `mail.oxfordlancers.com`. Adding
  Resend gives the club a second sender with a second reputation. Whether those
  are reconciled, and by whom, is an open question this mission raises rather
  than assumes.

### 4. The response surface, end to end

This mission owns how an answer is given and recorded, by every route.

- The signed no-login RSVP page. Its shipped binary Yes/No path (LAN-79, PR #28)
  stands and is not rebuilt.
- **The operator-recorded response** — a Yes or No given in person or by text,
  with actor, reason and visible provenance. Legal in the schema, deliberately
  left out of LAN-79, and named in the 2026-08-18 pilot residuals as landing
  here. Without it the escalation stream produces false positives.
- **The inbound channel reply path** — treating a reply in the channel as an
  answer. Deferred from LAN-79 pending Stuart's real-experience review, and tied
  to the deferred in-chat buttons (D9).
- The page changes with the messages that link to it.

### 5. The people who don't answer

- Nonresponse past the deadline surfacing without anyone compiling a list.
- An escalation flag **N hours past the response deadline**, N configurable per
  event type, N = 0 permitted.
- The escalation target is an **office, not a person** — initial value President,
  resolving to the current holder; a vacant office surfaces as a visible
  exception, never a silent drop.
- **No player personal data in an escalation message body** — event, count and a
  link into the operator area; names stay behind the operator login.
- An arriving RSVP cancels that person's pending reminders and clears any
  un-actioned flag.
- Flag lifecycle: one flag per invitation per threshold, idempotent under
  scheduler reruns. **Recorded provisional by Brian on 2026-08-14 and explicitly
  owed a restatement and confirmation here.**
- **F4** — undeliverable recipients joining the same chase list: one list, two
  streams — didn't receive it, didn't answer it.

### 6. What an operator or approver sees about all of it

- **The communications plan, before approval.** On the event page, before the
  irreversible action, the approver sees what approval will set off. Brian,
  2026-08-22:

  > When an event gets created and I am about to approve it and send it out, I
  > then need to see the workflow by which notifications go out — when they go
  > out, how they go out, where they do it.

  No brief specifies this today. Task 02 §4 has only a post-approval delivery
  view and a planned problem flag; Task 03 §4.2 tells the operator where policy
  lives through a documentation pointer, not a screen; and Task 02 D6 argued
  against showing a "next automated attempt" precisely because no scheduler
  existed. This mission builds that scheduler, so that reasoning inverts.

- **Response monitoring, extended.** The shipped views (LAN-77/78/81) show
  Yes / No / no-response and stay. None of them knows about a reminder, a flag or
  an escalation, because none exists yet. Everything this mission's machinery
  adds has to become visible, or the club is chasing people it cannot see.
- **Delivery health**, per event and per person, as shipped and as extended by
  the retry loop and the email route.

## Out of scope

| Excluded                                                                                                               | Where it lives, or why                                                                             |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| The event itself — creating, importing a term, the calendar, amending, cancelling, event templates, audience selection | Mission 2, packet v1, merged                                                                       |
| Whether an amendment or cancellation notifies                                                                          | Mission 2 decides (D54/D58 notify choice); this mission carries what it decides                    |
| Defining consent — lawful basis, the acceptance record, the D6 wording                                                 | Mission 7 / Task 07. This mission enforces it at dispatch                                          |
| Mission 6's onboarding chase behaviour, caps and refused state                                                         | Task 11. Reuses this transport; the behaviour is not this mission's                                |
| The Monday report surface                                                                                              | Mission 9 / Task 05. This mission supplies its exception content                                   |
| The committee-facing configuration UI                                                                                  | LAN-106, committed post-release-one. Release One is repository config                              |
| A cross-event delivery-health queue                                                                                    | Task 02 D4 — the per-event view plus the event-page flag is the operating model                    |
| Peer visibility of who else is coming, on the RSVP page                                                                | Locked out of the slice; additive later at no rework cost                                          |
| Recall of anything already sent                                                                                        | Task 02 §11, and unaffected by the D49 supersession                                                |
| Broadcast announcements                                                                                                | Owner decision 2026-08-19: they stay in WhatsApp groups. Structured communications only            |
| A third RSVP state                                                                                                     | R5 as clarified 2026-08-13: strictly binary. Any third state is new scope needing a fresh decision |
| Any manual copy, send, post or "mark as sent" path, in any state                                                       | R12/R15 as clarified; enforced by `channel <> 'manual'` and `tests/no-manual-delivery.test.ts`     |
| Production activation itself — club number, Meta verification, template approval, Stuart's review                      | Track A: LAN-101, LAN-126. Gates acceptance, not build                                             |

## Owner decisions recorded at this boundary (Brian Schuster, 2026-08-22)

Given in conversation during Stage 0 and recorded here as authority for the work.

### The hard-coded allowlist is removed, and acceptance becomes the gate

> The allow list: when we're going to production, I don't know if the allow list
> should be there anymore. Honestly, it should be switched to anyone who's gone
> through the WhatsApp approval after this point should be able to get sent
> messages. I think that hard-coded allow list doesn't make any sense here, so
> part of that is going to be removing that.

**One sequencing condition, which is a safety condition and not a preference.**
The allowlist is today the only thing standing between Approve and the real
squad, and its own recorded reasoning is that a control depending on the right
rows being present is a control one careless edit removes. So it is replaced by
the acceptance record, in that order — the record real and enforced at dispatch
first, the allowlist removed second. This makes Mission 7's consent seam
load-bearing: if that record is absent or unenforced, this mission has no gate at
all.

### Telephone numbers are international, and still refuse rather than guess

> The phone numbers need to be not just 44 area codes, but any area code should
> be sendable, right? That's part of the thing here, and validation and all that
> jazz. … it's wrong because people might come from outside of it.

This reverses a recorded engineering decision. `phone.ts` deliberately carries no
`libphonenumber`, on the stated grounds that "the club has one country, one
number format that matters." For a university club that is wrong, and the people
it silently fails are international students, who would never receive anything
and never appear as a failure anyone chases.

**What survives the change is the principle underneath it:** an unconvertible
number fails loudly and says the roster needs fixing, because a wrong guess sends
a club invitation containing a working RSVP link to a stranger. Widening the
countries must not soften that. Adding the dependency is never fast-lane and is
explained in its pull request.

## Seams named at the boundary

Recorded so they are not discovered late. None is a blocker.

| Seam                                                                                                                                                                   | Other owner | Why it touches this mission                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| **The RSVP link-domain migration** at the LAN-126 cutover — issued links are revoked-and-reissued or preserved by redirect, decided before cutover                     | Track A     | Those are this mission's tokens, and reissue is destructive: every previously issued link dies                    |
| **Scheduler heartbeat and job-backlog alerts**                                                                                                                         | Mission 11  | It monitors this mission's scheduler, and the mission that builds it is the one that knows what "backed up" means |
| **Rate limiting on the webhook and public surfaces**                                                                                                                   | Mission 11  | The WhatsApp webhook and the signed RSVP page are this mission's endpoints                                        |
| **The operator message-and-flag direction** (2026-08-18) — an operator opens a member and messages them; recorded, deliberately not promoted, candidate home Mission 6 | Mission 6   | It rides this transport, so the pipeline must not preclude it                                                     |

## Determinations recorded, not escalated

Each of these is reversible, follows already-approved intent, and changes no
authority, scope, risk or user-visible meaning.

1. **Forward record F6 is dead and is not carried into the packet.** Task 02 §8
   lists F6 — put D2's escalation-only direction to Clint and Stewart and record
   their ruling on R12. The 2026-08-17 Resend amendment, the manifest §4, and the
   16 Locked Requirements page all say the same thing: **R12 stands as written**,
   Shape B is operative, and no requirement change is pending with anyone.
   Carrying F6 would re-open a closed question and would put an external gate on
   this mission that no longer exists.
2. **Shape B is built here and cannot be exercised against the real squad here.**
   0/42 current-squad email addresses exist. Collection is Mission 5's (Task 08 /
   LAN-85). This is a dependency on acceptance evidence, not a scope reduction —
   the adapter, the webhooks and the evidence trail are all buildable and
   testable now.
3. **Consent is enforced here, defined elsewhere.** A dispatch-time check that
   refuses a recipient without a recorded basis is delivery machinery and belongs
   to this pipeline. The acceptance circuit's content, cadence and escalation are
   Task 07's and Task 11's, riding this transport — the same pattern as Mission
   6's chase.
4. **The stale-deadline gap Task 03 recorded as unowned is now owned, and it
   lands here.** Task 03 §4.1 said the amendment workflow "must decide deadline
   recomputation **and** the cancellation/reissue of pending reminder jobs on
   material change — recorded here so reminders are in its scope when it is
   placed." Mission 2 placed it: it holds the jobs and hands disposal to this
   mission. The gap closes without a boundary change.
5. **Where ADR 0021 and OD-1/Q6 disagree, OD-1 wins.** Task 03 cites ADR 0021 for
   "amending an approved event does not recompute deadlines." OD-1/Q6, resolved
   2026-08-18, says rescheduling **does** recompute the chase threshold and the
   app says so. OD-1 is later and is an owner decision. The ADR text is a
   candidate correction, tracked separately.
6. **D5's trigger is corrected before anything is built against it.** Two of its
   three clauses name transitions that no longer occur. Three proposed
   corrections are recorded in `notion-corrections.md`, unapplied, awaiting
   Brian. The substance — nothing goes out describing a superseded value — is
   unchanged.
7. **Mockups on the event page are grounded against Mission 2's approved
   mockups, not against `main`.** Mission 2 builds that surface and has not
   started; the screens this mission adds to do not exist to screenshot. The
   "current" side of any such mock is Mission 2's approved mockup — `W4` for
   approval, `W5` for amendment — and the acceptance record says so, so that
   nobody later reads an invented surface as observed reality.

## Carried to Stage 3 as genuine owner decisions

Named here so they are visible at the boundary, and deliberately not asked yet:
each belongs to the workflow that owns it, after that workflow has been walked.

- **What happens to a held job** when an amendment is saved — released as it was,
  re-anchored to the new date, replaced with a change notice, or cancelled.
  Mission 2 correctly declined to decide it. It changes what a player receives
  after a session moves, so it is not a Mission Lead delegation.
- **The operator-recorded response rule** — its provenance, and whether it counts
  as a response for escalation purposes.
- **The flag lifecycle**, which Brian approved provisionally on 2026-08-14 and
  asked to have restated at ticketing. If a genuine escalation ladder is wanted —
  more than one step, ending somewhere other than the President — that is a
  change to what was approved and is asked here.
- **Quiet hours are not part of the mission.** Brian rejected the proposed
  window during W1 review on 2026-08-24: "There is no such thing as quiet
  hours." Scheduling and compression do not delay or drop a message on that
  basis.
- **The inbound reply path**, which was deferred pending Stuart's review and is
  entangled with the deferred in-chat buttons (D9).
- **The whole schedule model** — the anchor a schedule hangs from, the ladder per
  event type, and the compression rules when the runway is short. Brought as one
  concrete proposed rule set with a recommendation per rung, not as a list of
  questions.
- **The message sequence is fixed; its timing is not.** Brian set the order on
  2026-08-24 as WhatsApp message, email, follow-up escalation, then notification
  to the President. W7 still owns the offsets and the revised compression rule.
- **Whether the two outbound email paths are reconciled**, and by whom.

## Split decision

**No split.** One commissioned outcome, one mission. Tasks 02 and 03 are two
halves of one machine: Task 03 defines when a message is owed and to whom, Task
02 defines how it is delivered, retried and recovered. Neither can be accepted
independently — a reminder that cannot be delivered is not a deliverable, and a
retry loop with nothing to retry is not either. Size, multiple technologies and
several work packages are explicitly not grounds under the ported rules, and no
safety, authority, readiness or outcome-coherence problem is created by keeping
them together.

## Portfolio deviation

**None to the row's coverage.** Scope 2 is "Automated Communications, RSVP,
Reminders and Recovery" and names R5, R6, R12 and R15 — the RSVP and
response-monitoring surfaces were always inside it. The first draft of this file
narrowed the row; this version restores it.

Two things arrived after the row was approved on 2026-08-19 and are recorded as
covered by it rather than as amendments: Mission 2's amendment-hold seam
(2026-08-21) falls inside Task 02's F2, which the row carries through "Tasks
02+03"; and the chase-threshold recompute falls inside "reminders, configurable
nonresponse escalation".

One surface is genuinely new and is commissioned by Brian directly rather than by
any brief: the pre-approval communications plan on the event page, §6 above,
2026-08-22.

- **Brian approval words:** "The boundary is correct."
- **Approval date:** 2026-08-22
