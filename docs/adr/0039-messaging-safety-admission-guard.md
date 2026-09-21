# 0039 — One admission guard inside the claim, with thresholds in code

**Status:** Accepted · **Date:** 2026-09-17 · **Amends:**
[0023](0023-rsvp-token-and-whatsapp-delivery.md)

Approved by Brian through LAN-394.

## Context

Before this, the club could send a message to every person it holds a number
for, from seven different code paths, with nothing between a mistake and the
provider:

| Dispatcher                             | Where                                                          |
| -------------------------------------- | -------------------------------------------------------------- |
| `dispatchJob`                          | invitations, reminders, nudges, notices, the recruit follow-up |
| `dispatchEscalationJob`                | the President's escalation and its email fallback              |
| `dispatchRecruitmentCycleJob`          | the recruitment cycle                                          |
| `dispatchOnboardingWelcomeJob`         | the onboarding welcome                                         |
| `dispatchOnboardingChaseJob`           | the automated chase and an operator's nudge                    |
| `dispatchOnboardingChaseEscalationJob` | onboarding exhaustion                                          |
| `dispatchNoticeJob`                    | cancellation notices                                           |

Each one claims a job, calls a provider and records the outcome. A loop that
worked — no provider error at all, every message accepted — had no ceiling, and
neither did a person: a recovered backlog could reach one recipient a dozen
times in a minute. Nothing could be stopped without a deployment.

Two designs were considered and one was discarded. The first used a separate
admission ledger with consumable receipts, a permit expiry and a reaper. An
independent red-team review found that the expiry could not mean what it
claimed — there is no atomic database-and-network operation, so a receipt
consumed at 59.9 seconds can still start a call at 60.1 — and that the extra
state introduced an admitted-but-unconsumed job with no recovery path. Brian
accepted the simplification.

## Decision

**One admission guard, inside the existing job-claim transaction, and no second
lifecycle.**

1. Each dispatcher locks its job with `select … for update` under the predicate
   its `update` used to carry, resolves eligibility and the destination, and
   only then asks the guard. The lock gives the same mutual exclusion — a
   read-committed locker re-evaluates the WHERE after the lock is granted — and
   the gap between the two statements is where the guard runs.
2. A deferral costs the message nothing: no attempt increment, no token minted
   or superseded, no `last_error`, no fallback, no failure. The job stays
   `pending` and says why in three columns of its own.
3. Counting is over `delivery_attempts`, which already records "the club asked a
   provider to send something". Three nullable columns on it are the whole of
   the accounting. **A committed admission counts even when the outcome is never
   learned** — the club may have been charged and the recipient may have been
   reached.
4. Durable state is one table, `messaging_safety_scopes`: a global row, one per
   provider, and one per person or destination that has been held. Pause (a
   person deciding) and latch (a threshold tripping) are separate columns, so
   resuming one never clears the other. A recipient row is written **only when a
   hold is actually recorded** — an ordinary admission reads an absent row as
   "no hold" and creates nothing — and the same eight-day sweep removes it again
   once it holds nothing. The exclusion two concurrent claimers need comes from
   the global row, which every admission locks first and holds to commit.
5. **The thresholds live in code**, as named constants with the decision beside
   them, and are shown read-only on the page. A limit stored as data is a limit
   somebody can move without a decision, and the point of the feature is that
   the club's outbound volume has a ceiling nobody reaches by accident.

### The values (Brian, 17 September 2026)

| Control                                      | Value                                                                                                  | Effect                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Shared pacing                                | 50 admitted attempts per rolling 5 minutes                                                             | extra messages wait; automatic recovery            |
| Per person, per destination                  | 1 admission per rolling 5 minutes                                                                      | automatic deferral                                 |
| Person or destination ceiling                | 10 per 24 hours; 30 per 7 days                                                                         | latches a hold on that recipient only              |
| Global emergency stop                        | 3,000 admitted attempts per rolling 24 hours                                                           | durable global pause; no midnight or restart reset |
| Capacity warning                             | 80% of the global allowance                                                                            | warning and alert; nothing stops                   |
| Provider cooldown                            | 5 consecutive provider-side faults within 5 minutes → 5 minutes, one probe, then 10, 20, 30, repeating | WhatsApp and email independently                   |
| Queue warning                                | oldest due job waiting over 60 minutes                                                                 | warning and alert; nothing stops                   |
| Retention of the identifying counting fields | 8 days                                                                                                 | cleared together by the existing sweep             |

It ships enabled with these values from the first deploy. There is no disabled
state, no environment variable and no override.

### Authority

Pause and resume are a **new, narrower capability**,
`messaging_safety_authority`, granted to the core four and to nobody else.
`delivery_administration` — which gates the page — also grants the IT Officer,
and deciding that the club stops talking to its members is not an administrative
act. This is the second exception to the 15 August 2026 rule that the
administrative seat holds every capability in the map;
[`person_erasure`](../architecture.md) was the first, for the same kind of
reason.

### Alerts

Structured, count-only JSON on stdout, which Cloud Logging ingests and a
log-based alert policy watches. Never a phone number, an email address, a name,
a person id, a destination fingerprint, a token URL, a message body or an
operator's typed reason. The route is deliberately the one thing a paused
message queue cannot silence, and the sweep writes a heartbeat on every tick so
that a scheduler which has stopped — and therefore produces no incidents at all
— can be noticed by its silence. The Cloud Monitoring policy and its
notification channel are the owner's to create.

## Consequences

- **A pause cannot recall a message already handed to the provider.** The claim
  commit is the in-flight boundary, exactly as it was before. What a pause
  guarantees is that no later claim passes it. No number of messages arriving
  after a pause is promised.
- **A crash between claim and provider still leaves an unknown outcome.** That
  is pre-existing and is not solved here; it is made visible, as a count and an
  age, with no universal resend action.
- **`deferred` is a fourth dispatch outcome** and every manual caller has to
  project it as a queue rather than as a refusal. A retry, a reissue, an
  onboarding nudge, an event chase and a recruitment ask each say so in their
  own words.
- **Two people genuinely sharing one number may need a manual resume.**
  Accepted, as the alternative is sending unlimited messages to that number.
- **Cancellations and operator retries get no exemption from the global stop.**
  An emergency stop can therefore delay a cancellation notice until somebody
  resumes.
- **Destination fingerprints are not anonymisation.** SHA-256 over a small
  enumerable input space is personal data that is inconvenient to read, and it
  is treated as personal data: server storage only, eight days, and never in a
  log or a browser payload. An erasure removes a held destination's scope by
  the fingerprints of the person's own contact points, computed before those
  contact points are deleted, because the other route to it — the
  `safety_destination_key` on their attempts — has been null since the eight-day
  sweep cleared it. A destination two people share therefore loses its hold when
  either of them is erased; that is the same trade as per-destination counting,
  taken in the direction erasure requires.
- **Rolling back to a pre-guard revision re-opens unguarded egress.** Stop the
  scheduler first.
- **Older suites had to say "and then some time passed".** Several tests
  compress days of club life into one second; `agePastSafetyPacing` in
  `tests/helpers/service-layer.ts` is how they declare that, and it weakens
  nothing — it moves the clock, never a latch, and the weekly and global
  ceilings still apply.
