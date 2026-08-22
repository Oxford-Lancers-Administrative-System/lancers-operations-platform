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
- **Primary coverage:** R6, R12, R15 · Tasks 02 + 03 · Scope 2
  ("Automated Communications, RSVP, Reminders and Recovery"). R5 is satisfied
  (LAN-79, PR #28) and retained for traceability, not rebuilt.
- **Deliberately shared coverage:**
  - **Task 11 transport reuse → Mission 6.** Mission 6's onboarding chase rides
    this mission's pipeline verbatim. One machine, two streams. The chase's
    behaviour, queue, caps and refused state stay with Mission 6.
  - **Consent enforcement → defined in Mission 7.** Mission 7 defines the lawful
    basis and the acceptance record; this mission enforces it at dispatch.
  - **C4 delivery half → Mission 2 owns the event-side rules.** Mission 2 places
    the hold; this mission disposes of what is held.
  - **Escalation-list surfacing ↔ Mission 9.** Chase-list content overlaps the
    Monday report's exception sections (Task 02 §8, Task 05 boundary).

## What this mission is for

Release One's largest approved-but-unbuilt capability. The manifest's own words:
R6 is "**Defined; not implemented** — no scheduler on main; largest
approved-but-untracked capability." Verified against `main` @ `c59bff1`: the
substrate exists and nothing drives it. `notification_jobs` carries
`scheduled_for`, an idempotency key and the six locked states; the `reminder` and
`escalation` job types are already in the enum; `nonresponse_queue` and
`invitation_response_state` are live views. There is no scheduler, no reminder
policy, no escalation flag and no Resend adapter anywhere in `src/`.

Clint's stated pain is the thing this mission answers: "My WhatsApp is
essentially unusable… 30 chats with players."

## In scope

**Reminders and escalation (Task 03 §4, the D5 behaviour definition).**

- Automatic reminders to unanswered invitations at configured offsets before the
  response deadline, riding the Task 02 pipeline as ordinary notification jobs.
- An arriving RSVP cancels that person's pending reminders and clears any
  un-actioned escalation flag.
- Nonresponse becomes an escalation flag **N hours past the response deadline**,
  N configurable per event type, N = 0 permitted.
- The escalation target is an **office, not a person** — initial value President,
  resolving to the current holder; a vacant office surfaces as a visible
  exception, never a silent drop.
- Three surfaces for a flag: a proactive automated message to the office holder,
  the in-app nonresponse queue, and the Monday report.
- **No player personal data in an escalation message body** — event, count and a
  link into the operator area; names stay behind the operator login.
- A quiet-hours send window (proposed 08:00–21:00 Europe/London), with anything
  outside it rolling to the next opening; clamped-deadline events skip reminders
  and still receive the full N-hour grace.
- Flag lifecycle: one flag per invitation per threshold, idempotent under
  scheduler reruns, cleared by an arriving RSVP. **Recorded provisional by Brian
  on 2026-08-14 and explicitly owed a restatement and confirmation here.**
- Configuration values in central repository config on the ADR 0021 pattern — one
  frozen table, one file, no default arm, reasoning beside the values — plus the
  operator-readable pointer saying where policy lives and how a change is
  requested.

**Delivery, retry and recovery (Task 02).**

- **F1** — the automated retry loop: Cloud Scheduler owns _when_, the database
  records what is due; backoff, attempt ceiling, idempotent
  `for update skip locked` claims (D6, M1).
- **F2** — undelivered-job behaviour on amendment and cancellation, as corrected
  below.
- **F3** — the R15 recovery procedure (§5 verbatim) into the operating runbook.
- **F4** — undeliverable recipients joining the escalation/chase list: one list,
  two streams — didn't receive it, didn't answer it.
- **F5** — the Shape B automated email + calendar fallback: Resend on the club
  domain, the same signed RSVP link, an ICS attachment, delivery and bounce
  webhooks into the same evidence tables.
- **F7** — the template inventory: invitation, change notice, cancellation
  notice, onboarding acceptance, reminder and chase-list messages, enumerated,
  created and tested.
- **D8** — the "Not dispatched — no channel" backstop, counted and visible.

**Arriving from Mission 2's approved packet (merged 2026-08-21, after the
portfolio row was written).**

- Disposal of a **held** job when an amendment is saved — released, re-anchored,
  replaced or cancelled.
- Recomputing the chase threshold against a moved date (OD-1/Q6).
- Discharging the obligation a Mission 2 re-notify (D54) produces.

**From the pilot residuals (2026-08-18), routed here by name.**

- **Operator-recorded verbal RSVP** — a response given in person or by text, with
  operator provenance visible. Without it the escalation stream produces false
  positives. The portfolio's 2026-08-19 decisions place the wording at this
  intake.

## Out of scope

| Excluded                                                                                          | Where it lives, or why                                                                         |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| The player RSVP page and its response path                                                        | R5 satisfied — LAN-79, PR #28. Verified, not rebuilt                                           |
| Operator response-monitoring views (E2)                                                           | Confirmed adequate for release one across LAN-77/78/81                                         |
| A live per-event RSVP screen                                                                      | Task 03 §3: record it if the pilot shows the need; do not build it now                         |
| Mission 6's onboarding chase behaviour, caps and refused state                                    | Task 11. Reuses this transport; the behaviour is not this mission's                            |
| Consent capture, lawful basis, the D6 acceptance wording                                          | Mission 7 / Task 07. This mission enforces the rule it defines                                 |
| Event-side amendment and cancellation rules (Q6/Q7/Q9, D49–D61)                                   | Mission 2, packet v1, merged                                                                   |
| The committee-facing configuration UI                                                             | LAN-106, committed post-release-one. Release One is repository config                          |
| A cross-event delivery-health queue                                                               | Task 02 D4 — the per-event view plus the event-page flag is the operating model                |
| In-chat interactive Yes/No reply buttons                                                          | Task 02 D9, deferred; revisit after Stuart's review                                            |
| Recall of anything already sent                                                                   | Task 02 §11, and unaffected by the D49 supersession                                            |
| Broadcast announcements                                                                           | Owner decision 2026-08-19: they stay in WhatsApp groups. Structured communications only        |
| Any manual copy, send, post or "mark as sent" path, in any state                                  | R12/R15 as clarified; enforced by `channel <> 'manual'` and `tests/no-manual-delivery.test.ts` |
| Production activation itself — club number, Meta verification, template approval, Stuart's review | Track A: LAN-101, LAN-126. Gates acceptance, not build                                         |

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

## Carried to Stage 3 as genuine owner decisions

Named here so they are visible at the boundary, and deliberately not asked yet:
each belongs to the workflow that owns it, after that workflow has been walked.

- **What happens to a held job** when an amendment is saved — released as it was,
  re-anchored to the new date, replaced with a change notice, or cancelled.
  Mission 2 correctly declined to decide it. It changes what a player receives
  after a session moves, so it is not a Mission Lead delegation.
- **The operator-recorded verbal RSVP rule** — its provenance, whether it counts
  as a response for escalation purposes, and its wording.
- **The flag lifecycle**, which Brian approved provisionally on 2026-08-14 and
  asked to have restated at ticketing.
- **The quiet-hours window** — proposed 08:00–21:00, accepted but never fixed.

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

**None.** The boundary as written is the approved row.

Two things arrived after the row was approved on 2026-08-19 and are recorded as
covered by it rather than as amendments: Mission 2's amendment-hold seam
(2026-08-21) falls inside Task 02's F2, which the row already carries through
"Tasks 02+03"; and the chase-threshold recompute falls inside "reminders,
configurable nonresponse escalation". Neither adds coverage the row does not
name.

- **Brian approval words:**
- **Approval date:**
