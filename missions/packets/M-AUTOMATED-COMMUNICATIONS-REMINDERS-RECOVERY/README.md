# Automated Communications, Reminders & Recovery

Portfolio mission 4. This packet is the approved contract a Mission Lead
executes from. `packet.json` is authoritative; this file is the readable version.

## What this mission is for

The club stops chasing people by hand.

Every approved event invites its audience automatically, chases the silence on
an approved ladder, escalates what is genuinely unresolved to the President,
records answers given in person, repairs what could not be delivered, and never
sends a message that has stopped being true.

Clint's stated pain is the thing it answers: _"My WhatsApp is essentially
unusable… 30 chats with players."_

## Why now

This is Release One's largest approved-but-unbuilt capability, and its substrate
is already complete and inert. Verified in the running application at `main`
`80e9616` on 2026-08-25:

- `notification_jobs` carries `scheduled_for`, an idempotency key and six
  states. The `reminder` and `escalation` job types are already in the enum.
- `nonresponse_queue` and `invitation_response_state` are live views. **Nothing
  renders either.**
- The per-event delivery page shows **Audience 47 · Delivered 0 · Queued 0 ·
  Failed 0** and says _"Nothing has been sent for this event yet."_
- The participation table's Delivery column reads **Nothing queued** for all 47
  people.

Every number is zero because nothing drives it. This mission is what drives it.

## The eight workflows

| ID  | Workflow                                          | What it adds                                                           |
| --- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| W1  | Approve an event knowing what it will send        | The messaging plan an approver reads before committing                 |
| W2  | Answer an invitation                              | Interactive templates, answer-specific pages, the player's own page    |
| W3  | Record an answer somebody gave you in person      | One control on the participation table                                 |
| W4  | See who is coming, and who has not answered       | A Delivery column that tells the truth, and where the chase has got to |
| W5  | Chase the people who have not answered            | The Follow-ups queue, and the escalation to the President              |
| W6  | Repair a delivery that failed                     | Real counts, who could not be reached, and a diagnostics page          |
| W7  | Find out what the club's messaging rules are      | An editable messaging schedule, per event type                         |
| W8  | Keep queued messages honest when an event changes | The hold, what resumes, and what a cancellation does to the queue      |

Each carries Brian's dated approval in his own words in `acceptance/Wn.md`, and
its reviewed mockup in `mockups/Wn.html`. Every current-state image in those
mockups is a screenshot of the running application at this baseline.

## The rules that shape everything

- **The ladder order is fixed.** WhatsApp, WhatsApp again, email, then the
  President. Only spacing and counts are configurable.
- **There are no quiet hours.** Nothing is delayed or dropped for the time of
  day, and compression may not reintroduce them.
- **Nobody compiles a list.** Nonresponse surfaces on its own.
- **Delivery and response are separate axes.** A failed delivery never changes
  an answer; an answer never repairs a delivery.
- **Escalation carries no player personal data.** It reaches an office, not a
  person, and names stay behind the operator login.
- **Repair never becomes a composing surface.** There is no manual send in any
  path — a rule this mission chooses, not one it inherits.
- **A cancelled job is never a failure.** Both end as a message that never sent;
  counting them together buries the failures that matter.

## What this mission does not own

Deciding that a message is owed (Mission 2), the amendment surface itself
(Mission 2), taking the register (Task 04), the Monday report (Mission 9),
consent and its lawful basis (Mission 7), the onboarding chase (Mission 6), and
the wider App Shell (Mission 3).

## Two things to read before planning the work

**W8 cannot be built until Mission 2 delivers `REQ-amend-in-place`.** Editing an
approved event is refused on `main` today, so W8's trigger does not exist. This
is a hard ordering constraint on the DAG.

**This mission owes a superseding ADR.** It records two reversals of ADR 0021:
the configuration-administration surface, and deadlines measured from the event's
own start rather than a fixed 18:00 clock. That is real repository work, not a
note — see `REQ-superseding-adr`.

## Open at approval

Recorded as nonblocking unknowns in `packet.json`, each with a handling rule
that preserves safe execution: the first-invitation values and whether that
column stays editable; whether a one-tap WhatsApp URL button can be proved safe
against previews and scanners; whether aggregate Yes counts survive Mission 7's
consent basis; how an online event's joining URL reaches a player; and what
bounds a person credential if a season is never closed.

`blockers` also records that `AGENTS.md` and the owner now disagree in writing
about whether LAN-90 and LAN-92 are binding. No requirement depends on the
resolution, but Brian should settle it.
