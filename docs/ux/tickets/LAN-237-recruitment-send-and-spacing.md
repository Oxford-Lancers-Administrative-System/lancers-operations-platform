# LAN-237 — Immediate operator sends and recruitment record spacing

Brian requested one draft PR for LAN-237 and the recruitment record's spacing
regression on 8 September 2026. LAN-238 is reference only and is excluded.

## Owner decision

Brian confirmed that operator sends and resends should attempt delivery immediately,
including other nudge surfaces. Automatic cycle messages keep their capture-time
anchor. A manual ask must not collapse its reminder into the same instant.
Due captions read **Queued — awaiting dispatch**, never a past **Queued for** date
or an unsupported claim that delivery is in progress.

## Behavior

- Each recruitment button acts on its selected track only. The selected ask is
  due at the operator request time, regardless of the configured capture offset.
- Delivery is attempted after the declaration transaction commits, during the
  action itself, through the existing recruitment dispatcher. The dialog reports
  **Sent** only after provider acceptance and reports a refusal otherwise.
- A resend reuses the ask job, including after provider acceptance. It cannot
  reclaim an in-flight, unaccepted attempt or reset the delivery attempt ceiling.
  The automatic cycle still has one ask and one reminder slot per track.
- An unsent reminder retains at least the configured ask-to-reminder interval
  after the manual request. An already later reminder is not accelerated, and an
  accepted reminder is not requeued. Failed-reminder backoff respects that date.
- Consent provenance, status eligibility, completion and dispatch-time rechecks
  retain their existing gates. Answered questionnaires are not reopened.
- Last-sent dates still come from accepted delivery attempts. A future queued
  caption changes to awaiting dispatch when its due time arrives on an open page.

## Spacing and UX conformance

The W2 record retains the shared PageHeader, MetricRow, banded Sections, status
control, dialogs and current content. Its page layout now separates the header,
metrics and section groups by the design system's 24px gap. The same gap separates
Person and Recruitment; each send caption has 8px above it and breathing room
below it. The grid track can shrink at 375px so tables scroll within the record.

Appearance follows `docs/ux/design-system.md` and the LAN-231–235 rollout;
workflow authority remains LAN-204's W2 contract and the W2-01–W2-04 desktop and
375px frames, with this recorded timing amendment. No shared kit style changes.

## Blast-radius audit

| Operator action                                  | Existing delivery path                                         | Result                                                                                                |
| ------------------------------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Recruitment personal/recruitment send or resend  | `sendRecruitmentQuestionnaire` → `dispatchRecruitmentCycleJob` | Corrected here: selected ask attempted immediately, reminder kept later                               |
| Missing-information queue nudge, single or batch | `sendOnboardingNudges` → `dispatchOnboardingChaseJob`          | Already creates a due-now job and dispatches each selected person within the action                   |
| Event invitation Retry                           | `retryDelivery` → `dispatchJob`                                | Already dispatches the selected job directly, without waiting for scheduled time or automatic backoff |
| Event Revoke and reissue                         | `revokeAndReissue` → `dispatchJob`                             | Already rearms and immediately attempts the selected invitation                                       |
| Operator invitation resend/correct-and-resend    | `sendAgain` → `deliverInvitation`                              | Already invokes the identity provider during the action                                               |
| Password-reset resend                            | Shared password-reset action                                   | Already calls the Auth provider during the action; provider throttling remains                        |

Automatic reminders, onboarding chase, event scheduling and provider retries
remain automatic. This audit changes no permission, consent, failure ceiling or
provider throttling rule elsewhere.

## Production handoff

No schema migration, configuration change, pilot setup or cleanup is required.
Local synthetic scenarios prove the scheduling and dispatch paths; hosted tester
rows already exist. Brian deploys the application deliberately after merge and
reviews the recruitment record's spacing and send outcomes. Real Meta acceptance
requires the existing owner-managed provider configuration; no agent enables it.
LAN-238's dataset repair and any production reload are outside this PR.
