# Overview — M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY

The boundary is `00-boundary.md`, approved 2026-08-22. This file records what
holds across every workflow in the mission, so that no individual workflow has to
restate it and no Mission Lead has to infer it.

## Designed outcome

**A player hears from the club automatically, answers in one tap, and is chased
without anybody keeping a list. When that fails, somebody can see it and fix it.**

Concretely, at the end of this mission:

- An approved event produces messages on a schedule the club chose, not all at
  once at the moment of approval.
- Somebody who has not answered gets reminded, and then becomes visible to the
  President as an exception — automatically, at a time the club configured.
- A message that cannot be delivered is retried without a human, and when retries
  are exhausted the person is reachable by another channel or is on a list
  somebody works through.
- Every answer, however it arrives — a tap on a signed link, a word at training
  recorded by an operator, a reply in the channel — lands in one place with its
  provenance visible.
- An operator about to approve an event can see what approval will set off.

## Why now

Three reasons, in order of weight.

**It is the largest thing in Release One that is defined and absent.** The
Authority Manifest's own words for R6: "Defined; **not implemented** — no
scheduler on main; largest approved-but-untracked capability." Verified against
`main` @ `c59bff1` — the job table, the job types, the queue views and the
response states all exist, and nothing drives any of them.

**It is the client's stated pain.** Clint: "My WhatsApp is essentially
unusable… 30 chats with players." Release One's acceptance was renegotiated on
2026-08-18 to be Clint's dated sign-off that the delivered system does the job
(OD-4). This mission is a large part of what he will be judging.

**Mission 2 has just handed it a seam that will otherwise rot.** The approved
Events packet holds unsent messages when an event is amended and explicitly
leaves their disposal here. Until this mission decides, that is an unfinished
half of a merged decision.

## In scope

The boundary carries the full statement in six parts: every message the club
sends a person · when each goes out · how it goes and what happens when it fails
· who it may be sent to and whether they can be addressed · the response surface
end to end · the people who don't answer · what an operator or approver sees.

The rule that produced that list, and the one to apply to anything discovered
later: **ownership is by subject, not by build state.** A shipped surface being
in scope does not mean it is rebuilt — it means this is where its gaps close.

## Out of scope

The event itself and its surfaces (Mission 2) · defining consent (Mission 7) ·
Mission 6's onboarding chase behaviour · the Monday report surface (Mission 9) ·
the committee configuration UI (LAN-106) · peer visibility on the RSVP page · a
third RSVP state · any manual send · production activation itself (Track A).

## Cross-cutting invariants

### Privacy and capability boundary

- **`delivery_administration`** is the capability, held by President, Vice
  President, Secretary, General Manager and IT Officer. **A coach never holds
  it**, and neither does a Treasurer. Delivery is named in `slice-ux.md` §3 among
  the surfaces a coaching seat never receives.
- **No player personal data in an escalation message body.** The outbound message
  carries the event, a count, and a link into the operator area. Names live
  behind the operator login. Member data never rides through Meta's
  infrastructure for escalation, and the template stays generic and reusable.
- **Decline reasons are operator-group only** and are never exported into a
  shared artifact.
- **The RSVP page has zero peer visibility.** A player never learns who else was
  asked or who else answered. The named-list privacy decision of 2026-08-13
  applies to the separate signed live-attendance surface, not to `/rsvp/[token]`.
- **Provider detail is mapped and redacted.** Failure reasons are translated into
  club language with digits redacted; no raw webhook payload, provider secret or
  credential appears in any interface. A missing-configuration failure names the
  absent **variables**, never their values.
- **No browser-facing grant, no RLS policy on a domain table.** The signed RSVP
  page is server-rendered and server-submitted with the server-only key — ratified
  as final by Brian on 2026-08-14, with the client-rendered alternative presented
  and rejected. This mission does not reopen it, and nothing it builds may
  introduce a public grant.

### State vocabulary

This mission is unusually vocabulary-heavy, and the words below are the whole of
it. Anything a workflow needs beyond them is new vocabulary and is named as such.

**Stored, and locked.**

| Vocabulary                 | Values                                                                                                              | Note                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `notification_job_status`  | `pending` · `ready` · `processing` · `completed` · `failed` · `cancelled`                                           | Invariant M4: exactly six, no seventh. Terminal failure is `failed` with the policy exhausted                                                          |
| `notification_job_type`    | `invitation` · `reminder` · `cancellation_notice` · `schedule_change_notice` · `escalation` · `other`               | Reminder and escalation already exist and are unused                                                                                                   |
| `notification_channel`     | `whatsapp` · `email` · `sms` · `manual`                                                                             | `manual` is refused at the database on delivery attempts                                                                                               |
| `delivery_outcome`         | `delivered` · `failed` · `rejected` · `manual`                                                                      |                                                                                                                                                        |
| `response_state` (derived) | `never_invited` · `awaiting_response` · `responded_yes` · `responded_no` · `expired_without_response` · `cancelled` | From `invitation_response_state`; `never_invited` is the exception the audience relation exposed — somebody the approver confirmed who was never asked |

**Operator-facing, and verbatim.** Delivery reads **Queued · Attempted ·
Delivered · Failed · Retryable** — the word plus a chip, never colour alone.
`Retryable` and `Failed` are different states and not one: Retryable is a
transient failure with attempts remaining, Failed is a terminal refusal or an
exhausted ceiling. The recovery procedure turns on that distinction.

**Two axes that never merge.** Delivery state and response state are separate and
are displayed separately. Delivered never means responded; a test asserts that an
attempted row still reads Outstanding. Attendance is a third axis again, and RSVP
never prepopulates it (R7).

**New vocabulary this mission must introduce**, and therefore must name
deliberately rather than let leak in: the escalation flag and its lifecycle, and
whatever the schedule model needs to express an anchor, a rung and a compressed
schedule.

### Audit posture

- **`delivery_attempts` and `delivery_results` are the evidence trail.** Every
  action and its outcome appear in the attempt history — that is an acceptance
  criterion of the R15 recovery walk, not a nicety.
- **Delivery state changes only on verified provider callback.** An
  accepted-but-unconfirmed message correctly reads **Attempted**, not Delivered.
  Today the production webhook is unconfigured, so everything stalls at Attempted
  — a known, accepted condition this mission ends.
- **A person acting is recorded as a person acting.** Retry, revoke-and-reissue
  and an operator-recorded response each carry actor and, where the schema asks
  for it, reason.
- **Responses are append-only and superseding.** A changed answer adds a row; the
  current answer is a view over them. History is never edited.

### Safety, consent, and recovery

- **No manual path exists, and its absence is itself an acceptance criterion.**
  No function records a manual delivery, no screen offers one, and the database
  refuses the `manual` channel. The R15 runbook contains no manual-send step. "Manual
  recovery" means a human reviews an exception and initiates an approved
  automated action.
- **Consent gates dispatch, and replaces the allowlist in that order.** The
  hard-coded recipient allowlist is today the only thing between Approve and the
  real squad. It is removed only once the acceptance record is real and enforced
  at dispatch — never before. Mission 7 defines the record; this mission refuses
  to send without it.
- **Refuse rather than guess.** An unconvertible telephone number fails loudly
  and says the roster needs fixing. A wrong guess sends a club invitation
  containing a working RSVP link to a stranger. Widening to international numbers
  does not soften this.
- **Tokens.** Plaintext is never stored, so a link can never be resent — every
  repair is a reissue that supersedes its predecessor, and at most one live token
  exists per invitation. Token expiry never lands before event start, because a
  late RSVP is permitted up to the hour before (D24/D10).
- **Fail closed.** Missing outbound configuration produces a failed, retryable
  attempt naming the absent variables; it never silently sends nothing and never
  reports success.
- **Idempotence under reruns.** The scheduler will run the same work more than
  once. Jobs carry an idempotency key, are claimed with `for update skip locked`,
  and a flag fires once per invitation per threshold.

### Rollout constraints

- **Production WhatsApp is template-only** (ADR 0023). Nothing can be sent in
  production that Meta has not approved as a template, so the F7 inventory gates
  every message this mission adds.
- **Local Supabase only.** All development, tests, migrations and agent execution
  run against the local stack. No agent applies a migration to hosted Supabase or
  runs a script against it.
- **Real club data stays prohibited** in every environment until the pre-pilot
  gate closes. Nothing this mission builds may be exercised against the real
  roster before then.
- **Production acceptance is gated by other people's work**, not by this
  mission's: LAN-101 (club number, Meta verification, approved templates,
  webhook), LAN-126 (sending domain, DNS, SMTP), Stuart's real-experience review,
  and a recorded consent basis. Build is unblocked; acceptance is not.
- **Email cannot be exercised against the squad yet.** 0/42 current-squad
  addresses exist; collection is Mission 5's. The adapter, its webhooks and its
  evidence trail are all buildable and testable now.
- **A dependency is being added** for international telephone parsing. Dependency
  changes are never fast-lane and are explained in their pull request.

## Sources

`sources.md` is the index. The controlling records for this file are the Task 02
and Task 03 feature briefs, the Release 1 Authority Manifest, the 16 Locked
Requirements, and the repository at `c59bff1` — specifically
`supabase/migrations/20260810120000_domain_types.sql`,
`20260810121300_domain_event_audience.sql`, `src/lib/auth/capabilities.ts`,
`src/lib/delivery/`, and `src/lib/services/delivery.ts`.

## Brian approval

- **Exact words:** "This seems like what we talked about based on what we've talked about before. This seems correct. I guess as we go through the workflows, we'll figure out if this is right. Approved"
- **Date:** 2026-08-22
