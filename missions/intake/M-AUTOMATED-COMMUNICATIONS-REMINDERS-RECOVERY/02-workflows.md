# Workflow inventory — M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY

**Status: FROZEN.** Approved by Brian Schuster on 2026-08-22 — "Approve the eight
workflows and freeze them." No agent re-derives, splits, merges, adds, removes or
renumbers this list; a discovered gap becomes a proposed amendment, approved the
same way and applied atomically to this file and `state.json` together.

## The frozen list

1. `W1` — Approve an event knowing what it will send
2. `W2` — Answer an invitation
3. `W3` — Record an answer somebody gave you in person
4. `W4` — See who is coming, and who has not answered
5. `W5` — Chase the people who have not answered
6. `W6` — Repair a delivery that failed
7. `W7` — Find out what the club's messaging rules are, and change them
8. `W8` — Keep queued messages honest when an event changes

A workflow here is **one primary actor's end-to-end journey, from a trigger and
an entry point to one user-visible result.** An item with no actor, or no visible
result, is a stage or a cross-cutting invariant and is recorded as such rather
than promoted.

## The inventory in detail

| ID     | Workflow                                                      | Primary actor                                 | Trigger                                 | Visible result                                                           |
| ------ | ------------------------------------------------------------- | --------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------ |
| **W1** | Approve an event knowing what it will send                    | An approver (President, VP, Secretary, GM)    | About to approve a drafted event        | They can see the messaging plan, and approve having understood it        |
| **W2** | Answer an invitation                                          | A player                                      | A message arrives                       | Their Yes or No is recorded, and they are told it was                    |
| **W3** | Record an answer somebody gave you in person                  | An operator                                   | A player answers at training or by text | The response is recorded with operator provenance, and chasing stops     |
| **W4** | See who is coming, and who has not answered                   | An operator                                   | Any time between approval and the event | Response state for the event, including what has been chased             |
| **W5** | Chase the people who have not answered                        | The President, as the office holder           | The escalation threshold passes         | They hold an actionable list of who to talk to                           |
| **W6** | Repair a delivery that failed                                 | An operator holding `delivery_administration` | A delivery problem becomes visible      | The person is reached another way, or is on the list, and it is recorded |
| **W7** | Find out what the club's messaging rules are, and change them | An operator, and Brian                        | "When does this actually go out?"       | The rules are readable, and the route to change them is one sentence     |
| **W8** | Keep queued messages honest when an event changes             | An operator amending an approved event        | An amendment is saved                   | Nothing goes out describing a superseded value                           |

Eight. `W1` and `W8` add to surfaces Mission 2 owns; the rest are this mission's
own.

## Why these eight, and not others

**Why `W2` and `W5` are separate.** A player answering and a President chasing
are different people, different triggers and different results. Reminders sit
inside `W2` — a reminder is a further attempt to complete the player's journey,
not a journey of its own, because nobody's screen changes when one fires.

**Why the reminder machinery is not a workflow.** It has no actor. The scheduler
firing on a due job is a stage that `W2` and `W5` depend on, and it is recorded
as a cross-cutting invariant below rather than promoted into the inventory.

**Why `W3` exists at all.** Task 03 §2 lists the operator correction path as a
deliberately deferred gap, and the 2026-08-18 pilot residuals route it here by
name with the reasoning that without it the escalation stream produces false
positives. Chasing somebody who already answered is the failure that makes the
club stop trusting the chase.

**Why `W7` is thin, and still a workflow.** In Release One the values live in a
repository file, not a screen — Task 03 §4.2 is explicit, and LAN-106 owns the
committee-facing surface post-release. But the brief also requires an
operator-readable pointer so that "where does this get changed?" has a
one-sentence answer. An operator asking that question and getting an answer is a
journey with a result, so it is inventoried rather than left as an implicit
documentation chore.

**Why `W1` and `W8` are here rather than in Mission 2.** Both are additions to
Mission 2's event surfaces, and both are about communication, which is this
mission's subject. Mission 2 builds the page; this mission supplies what it says
about messages. `W8`'s disposal decision was explicitly handed here by Mission 2's
approved packet.

## Deliberately not workflows

| Item                                 | Why not                                                                              | Where it lives                           |
| ------------------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------- |
| The scheduler and its retry loop     | No actor. A machine claiming due work                                                | Cross-cutting; enables `W2`, `W5`, `W6`  |
| The Meta template inventory (F7)     | A build artifact plus an owner action, not a journey                                 | Cross-cutting requirement                |
| The Resend email adapter             | A transport. The operator-visible act of routing somebody to email is a step in `W6` | Inside `W6`                              |
| The R15 recovery procedure (F3)      | Documentation. The journey it documents is `W6`                                      | Deliverable attached to `W6`             |
| The delivery-confirmation webhook    | No actor; it is what makes Attempted become Delivered                                | Cross-cutting; visible in `W4`, `W6`     |
| Replacing the allowlist with consent | A change to a gate, not a journey                                                    | Cross-cutting invariant                  |
| International number parsing         | A correctness fix inside dispatch                                                    | Cross-cutting; its failure shows in `W6` |
| The inbound channel reply path       | A further entry point into `W2`, not a separate journey                              | Inside `W2`, gated on Stuart's review    |

## Cross-cutting invariants this mission carries

Recorded here so no workflow has to restate them, and so that none of them can be
lost by not being a workflow. The full statement is in `01-overview.md`.

1. **Two axes never merge** — delivery state, response state, and attendance are
   three separate records. Delivered never means responded.
2. **No manual send path exists**, and its absence is an acceptance criterion.
3. **Consent gates dispatch**, and replaces the allowlist only once it is real and
   enforced.
4. **Refuse rather than guess** on any contact detail.
5. **One live token per invitation**; every repair is a reissue; expiry never
   lands before event start.
6. **Idempotent under scheduler reruns** — one flag per invitation per threshold.
7. **No player personal data in an escalation message body.**
8. **Production is template-only**, so F7 gates every message this mission adds.

## The decision map

Every controlling decision in every controlling source, and its one authoritative
home. This is a reading copy; `state.json.decision_coverage` is the canonical
truth and `decision-coverage.md` is generated from it.

**Two decision-ID collisions exist and every reference is therefore qualified by
source.** `D5` is the undelivered-job rule in the Task 02 brief and the
reminders/escalation capability in the Capability Register. `D7` is the WhatsApp
acceptance circuit in the Task 02 brief and the deferred live-RSVP-visibility
request in the Register. The Authority Manifest §7 warns about exactly this and
says always to qualify a decision ID by its source page.

**The Task 03 brief numbers none of its decisions.** Its §5 log is dated and
unnumbered, so the `T03-` identifiers below are assigned by this intake and each
is anchored to the brief's own section. They are stable from here on.

### Task 02 — Automated Delivery & Recovery

| Decision | Substance                                                 | Home                                                                 |
| -------- | --------------------------------------------------------- | -------------------------------------------------------------------- |
| `D1`     | LAN-78's shipped behaviour stands as delivered            | `W6` — the surface it describes                                      |
| `D2`     | Escalation-only fallback, no email path                   | **Superseded** 2026-08-17 by the Resend amendment                    |
| `D3`     | If an email path exists, the provider is Resend           | `W6`                                                                 |
| `D4`     | R15's "operator queue" is the per-event delivery view     | `W6`                                                                 |
| `D5`     | Undelivered jobs on amendment or cancellation             | `W8` — trigger corrected; see `notion-corrections.md`                |
| `D6`     | Automated retries arrive at Stage 4                       | Cross-cutting scheduler; visible in `W6`                             |
| `D7`     | Per-season WhatsApp acceptance circuit                    | **Shared** — Mission 7 defines, Mission 6 caps, this mission carries |
| `D8`     | "Not dispatched — no channel" backstop                    | `W6`                                                                 |
| `D9`     | Reply path is link and signed page only; buttons deferred | `W2`                                                                 |
| `D10`    | Token expiry never lands before event start               | `W2`                                                                 |
| `F1`     | The automated retry loop                                  | Cross-cutting scheduler; visible in `W6`                             |
| `F2`     | Undelivered-job behaviour on amendment/cancellation       | `W8`                                                                 |
| `F3`     | R15 recovery procedure into the runbook                   | `W6`                                                                 |
| `F4`     | Undeliverable recipients onto the chase list              | `W5`                                                                 |
| `F5`     | The email + calendar fallback implementation              | `W6`                                                                 |
| `F6`     | The R12 requirement-change record                         | **Superseded** — R12 stands as written; nothing is pending           |
| `F7`     | The template inventory                                    | Cross-cutting requirement; owner action at LAN-101                   |
| `Q1`     | R12 change sign-off                                       | **Superseded** with `F6`                                             |
| `Q2`     | Stuart's real-experience review                           | **Excluded** — Track A external gate                                 |
| `Q3`     | ICS attachment versus Google Calendar API                 | **Delegated to the Mission Lead** — ICS recommended by the brief     |
| `Q4`     | Chase-list surfacing shape                                | `W5` — the brief hands it to Task 03's scope                         |

### Task 03 — RSVP, Reminders & Escalation

| Decision                      | Substance                                                       | Home                                             |
| ----------------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| `T03-binary-rsvp`             | RSVP is strictly binary; no third state                         | `W2`                                             |
| `T03-named-list-privacy`      | Named list on the signed live-attendance page                   | **Other mission** — Mission 2's `W7`             |
| `T03-deadline-values`         | Per-type response deadlines, no per-event override              | `W7`                                             |
| `T03-server-rendered`         | Server-rendered RSVP page; no browser grant, no RLS policy      | `W2`                                             |
| `T03-lan79-verified`          | LAN-79 verified against the 15-point standard, three gaps named | `W2`                                             |
| `T03-gap-operator-correction` | The deferred post-start operator correction path                | `W3`                                             |
| `T03-gap-inbound-reply`       | The deferred inbound channel reply path                         | `W2`                                             |
| `T03-gap-peer-visibility`     | Peer visibility locked out of the slice                         | **Excluded** — additive later at no rework cost  |
| `T03-e2-adequate`             | E2 monitoring views confirmed adequate for release one          | `W4`                                             |
| `T03-reminders`               | Reminders at configured offsets before the deadline             | `W2`                                             |
| `T03-arriving-rsvp-cancels`   | An arriving RSVP cancels reminders and clears un-actioned flags | `W2`                                             |
| `T03-nonresponse-queue`       | Nonresponse surfaces without anyone compiling a list            | `W5`                                             |
| `T03-escalation-hours`        | Escalation is deadline + N hours, N per type, N = 0 allowed     | `W5`                                             |
| `T03-escalation-office`       | The escalation target is an office, initial value President     | `W5`                                             |
| `T03-flag-surfaces`           | Three surfaces: proactive message, in-app queue, Monday report  | `W5`                                             |
| `T03-no-personal-data`        | No player personal data in an escalation message body           | `W5`                                             |
| `T03-quiet-hours`             | Quiet-hours send window; clamped-deadline events skip reminders | `W7`                                             |
| `T03-flag-lifecycle`          | One flag per invitation per threshold, provisionally approved   | `W5`                                             |
| `T03-config-model`            | Central repository config, ADR 0021 pattern, no admin UI        | `W7`                                             |
| `T03-config-location`         | One sibling file, plus the operator-readable pointer            | `W7`                                             |
| `T03-lan106-committed`        | The committee configuration surface is committed post-release   | **Excluded** — LAN-106                           |
| `T03-stale-deadline`          | The amendment workflow must decide reminder-job handling        | `W8` — now placed by Mission 2                   |
| `T03-prereq-consent`          | D6 consent and contact onboarding is a hard prerequisite        | **Shared** — Mission 7 defines                   |
| `T03-prereq-templates`        | Approved Meta templates before anything can send                | Cross-cutting `F7`; owner action                 |
| `T03-prereq-amendment`        | Amendment-workflow placement                                    | `W8` — resolved                                  |
| `T03-prereq-lan106`           | LAN-106's wording needs reminder/escalation configuration named | **Excluded** — Linear reconciliation, not build  |
| `T03-template-budget`         | Paid template conversations at reminder volume are in budget    | **Excluded** — owner cost decision, already made |

### Capability Register — Scope 2

| Decision | Substance                                         | Home                                                     |
| -------- | ------------------------------------------------- | -------------------------------------------------------- |
| `D1`     | Automated WhatsApp 1:1 RSVP delivery              | `W1` — the dispatch approval sets off                    |
| `D2`     | WhatsApp production enablement                    | **Excluded** — Track A, LAN-101                          |
| `D3`     | Automated email + calendar fallback               | `W6`                                                     |
| `D4`     | Delivery visibility, retry, operator recovery     | `W6`                                                     |
| `D5`     | Reminders and configurable nonresponse escalation | `W5`                                                     |
| `D6`     | Consent and contact-preference onboarding         | **Shared** — Mission 7 defines, enforced here            |
| `D7`     | Live RSVP visibility back to the WhatsApp group   | **Excluded** — deferred by owner decision 2026-08-12, Q3 |
| `E1`     | No-login player RSVP page                         | `W2`                                                     |
| `E2`     | Operator RSVP monitoring                          | `W4`                                                     |

### The 16 Locked Requirements

| Decision | Substance                                                    | Home                       |
| -------- | ------------------------------------------------------------ | -------------------------- |
| `R5`     | Binary RSVP, reason required on No                           | `W2` — satisfied, retained |
| `R6`     | Reminders and configurable nonresponse escalation            | `W5`                       |
| `R12`    | WhatsApp primary, automated fallback, never system of record | `W6`                       |
| `R15`    | Visible failures and documented automated recovery           | `W6`                       |

### Authority Manifest and portfolio decisions

| Decision             | Substance                                                | Home                                     |
| -------------------- | -------------------------------------------------------- | ---------------------------------------- |
| `OD1`                | C4 trio — Q6 recompute, Q7 no reason, Q9 notify everyone | `W8` for Q6's recompute; Q7/Q9 Mission 2 |
| `OD4`                | R16's acceptance is Clint's dated sign-off               | **Excluded** — Track B                   |
| `PILOT-verbal-rsvp`  | Operator-recorded verbal RSVP lands in this mission      | `W3`                                     |
| `PILOT-message-flag` | The operator message-and-flag direction, not promoted    | **Other mission** — Mission 6, candidate |

### Mission 2's approved packet

| Decision             | Substance                                                       | Home                                                                 |
| -------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------- |
| `REQ-amend-hold`     | Saving an amendment holds unsent messages; Mission 4 disposes   | `W8`                                                                 |
| `REQ-amend-in-place` | An approved event is amended in place and never leaves approved | **Other mission** — Mission 2, and the reason `D5`'s trigger changed |
| `D54`                | Re-notify produces an obligation this mission discharges        | `W8`                                                                 |
| `D58`                | Cancellation notices follow the notify choice                   | `W8`                                                                 |
| `D60`                | Cancellation is terminal                                        | `W8`                                                                 |
| `D76`                | The internal cancellation reason never reaches a recipient      | `W8`                                                                 |

### Owner decisions taken at this intake

| Decision               | Substance                                                     | Home                                             |
| ---------------------- | ------------------------------------------------------------- | ------------------------------------------------ |
| `OWN-allowlist`        | The hard-coded allowlist is replaced by the acceptance record | Cross-cutting; visible in `W6`                   |
| `OWN-international`    | Telephone numbers are international, still refusing to guess  | Cross-cutting; visible in `W6`                   |
| `OWN-comms-plan`       | The approver sees the messaging plan before approving         | `W1`                                             |
| `OWN-response-surface` | The response surface is this mission's, built or not          | `W2`, `W3`, `W4`                                 |
| `OWN-schedule-model`   | Anchors, the ladder, and compression when runway is short     | `W1` owns the visible plan; `W7` owns the values |

## A note on provisional mission ids

Four missions referenced in the map have no approved packet and therefore no
approved id. Where the coverage has to name one, it uses the portfolio row name
transliterated the way `M-EVENTS-CALENDAR-TARGET-STATE` was — `M5` as
`M-PEOPLE-ROSTER-AND-RECRUITMENT-INTAKE`, `M6` as
`M-ONBOARDING-AND-INFORMATION-COMPLETION`, `M7` as
`M-CONSENT-PRIVACY-AND-DATA-RIGHTS`, `M9` as
`M-LEADERSHIP-REPORTING-AND-EXPORTS`. These are provisional and are reconciled
when each of those intakes runs and names itself. Mission 2's id is real.

## The walk-up welcome, and every other mission's messages

Mission 5 owns the walk-up welcome flow — the portfolio names it in row 5's
primary coverage, and Task 04's residual welcome-flow slice is routed there. The
Capability Register's note that its "Linear placement is an open classification"
predates the 2026-08-19 portfolio and is stale.

The split is the one used everywhere else in this boundary: **the mission that
owns the relationship owns what is said and when; this mission owns the pipe, the
template contract, the delivery evidence and the retry.** That holds for Mission
5's welcome and verification links, Mission 6's onboarding chase, Mission 7's
acceptance circuit, and Mission 9's report exceptions. The packet must say so, so
that none of those missions discovers it late.

## Brian approval of the frozen inventory

- **Exact words:** "Approve the eight workflows and freeze them"
- **Date:** 2026-08-22
