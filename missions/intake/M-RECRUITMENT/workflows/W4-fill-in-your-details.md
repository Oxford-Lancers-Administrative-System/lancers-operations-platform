# W4 — Fill in your details

- Purpose/intended outcome: the recruit tells the club about themselves — the
  recruit-stage field set — on a form minted for them and linked to their person,
  asked politely and reminded once.
- Primary actor: the recruit.
- Trigger: a step of `W10`'s ladder, or an operator sending or resending the ask
  from `W2` or `W9`.
- Entry point: a WhatsApp message carrying a signed link.
- Route/placement: `/a/[token]` — the shared signed-link → form substrate, built
  once here.
- Controlling source: Task 09 amendment 3 (2026-08-26), which puts the substrate
  and the recruit-stage field set in this mission; Task 08 §4, which routes
  football background, experience and gear ownership here and never enumerates
  them; Brian's 2026-08-31 direction that the ask is a minted, person-linked form.
- User-visible result: what the recruit chose to tell the club is on their record,
  attributed to them, and the ask closes.

## Current `main` grounding

- Locally rendered route or nearest implemented analogue: **none usable.**
  `person_access_tokens`, `rsvp_access_tokens` and `club_link_tokens` are all
  empty in the seeded dataset, so no signed-link page renders anything but the
  uniform invalid state. Both sides are therefore **drawn** and labelled
  `New surface, nothing to compare`.
- Reused component, language, interaction, and permission patterns: the no-login
  signed-link contract Task 08 §3 already fixes — acts as the Person, carries no
  session, exposes only that person's own flow, and shows the uniform invalid page
  on expiry or revocation with no information leakage.
- Desktop and 375px evidence: `W4-01` and `W4-02`, drawn at both widths;
  `W4-03` photographed both sides on the messaging-schedule shell.
- **`W4-03` answers the question Brian asked at the stop** — _"No explanation on
  how we got here. Is this automated? Does this get sent out? I don't know
  because it doesn't say anywhere."_ It is automated, it is an approved template,
  and it carries her own signed link; `W4-03` is step 4 of the cycle that fires
  it. Note that `/a/[token]` **does** ship at the baseline: the route exists and
  only a seeded token is missing, so these two screens are drawn for want of a
  token rather than for want of a route.
- Reason for any departure from the implemented application: nothing to depart
  from. This is the substrate's first instance.

## Two questionnaires, not one

Brian, 2026-08-31: _"The W4 and W15 should have personal details. They should be
two separate questionnaires that get sent out at different times… It's two
questionnaires."_ He declined a separate workflow for the second one — _"I don't
want a workflow 15"_ — so both live here, on one substrate.

They are **two distinct sends**, minted separately, answerable separately, and
each with its own state on the recruit's record. **When each goes out, and
whether they are ever combined, is Brian's to settle** — _"we'll figure out when
they get put together. I'm doing that."_ The order below is not a decision.

### Questionnaire A — Who you are

The recruit supplies or confirms their own personal details. Enumerated with
Mission 5, because these are its fields.

| Field          | Why the club wants it                                    |
| -------------- | -------------------------------------------------------- |
| Preferred name | What to call them, where it differs from their full name |
| Mobile         | Confirm or correct what the door captured                |
| Email          | Often not captured at a stand at all                     |
| College        | Confirm or supply                                        |
| Year           | Confirm or supply                                        |

**The seam, stated rather than assumed:** the _fields_ belong to Mission 5's
person record, which this mission does not own and does not correct. This
mission owns **the asking** — minting the link, sending it, and receiving the
answers. What the person record does with an answer is Mission 5's, and the
exact field list above is proposed until Mission 5 confirms it.

### Questionnaire B — How you came to football

The recruit-stage field set. Never enumerated by anyone before this intake:
Task 08 §4 records that football background, experience and gear ownership were
deliberately not carried into the person inventory and were routed to Task 09,
and Mission 5's approved packet records the set as an open unknown.

| Field                             | Why the club wants it                                                |
| --------------------------------- | -------------------------------------------------------------------- |
| Played American football before?  | Yes/no. Whether to point them at a taster or a session               |
| Watched American football before? | Yes/no. Someone who has watched it is not starting from nothing      |
| Position interest                 | Nothing binding — a conversation opener for a coach                  |
| Gear owned                        | Whether they need kit to turn up at all                              |
| How they heard of us              | The only recruitment-effectiveness question worth asking             |
| Anything else                     | Free text, because a recruit will tell you something you did not ask |

Amended by Brian on 2026-08-31, on being shown an earlier six:

- **Year and college is gone from this one.** _"Whether they're in college is
  something we already asked."_ It belongs to Questionnaire A.
- **"Played before" became two questions, both yes/no.** _"Have they ever played
  American football before? Have they ever watched American football? Those
  should be yes-or-no questions."_
- **`Anything else` is retained but not confirmed.**

Every field in both questionnaires is optional. Nothing here gates anything. Missing information never blocks a capture and never
blocks the flip — Task 09 D5, and invariant 4.

## Required actions

1. The recruit opens the link and sees a short, plain form.
2. They fill in as much or as little as they choose and submit.
3. They see that it was received.
4. One polite reminder if they do not.
5. An operator can resend, and can see what is outstanding.

## State transitions

Answering is an interaction, so it moves `identified → engaged` where the recruit
is not already there. Nothing else moves.

## Handoffs

- From `W3` at the end of the ladder; from `W2` and `W9` when an operator sends.
- To `W2`, where the answers land.
- To Missions 7 and 8, which extend this substrate with their own field sets.

## Dependencies and mission boundaries

- **Missions 7 and 8 / the substrate:** this mission's side is the substrate and
  the recruit field set; Mission 7 extends it with the onboarding set, Mission 8
  with consent and correction. **Shared, and the rule that makes it shared is
  one open request per person, ever** — which only holds if the substrate enforces
  it rather than each caller. Independently walkable.
- **Mission 4 / transport:** carries the link. Independently walkable.

## Exceptions and recovery

- **Expired or revoked link.** The uniform invalid page — no information leakage,
  per the E1 404-uniformity precedent.
- **Already answered.** A friendly page saying so, changing nothing.
- **The recruit answers twice.** The later answer supersedes; the earlier is kept.
- **Save fails.** A retry message and no partial write.
- **An operator asks while a request is already open.** Refused by the
  one-open-request rule, with the existing request offered for resend instead.

## Safety, privacy, consent, and authority boundaries

- The link acts as the Person and exposes only their own flow — never the roster,
  never another person, never anything about the club's other recruits.
- No login, by Task 08 §3's decision that there are no player logins in Release
  One.
- What the recruit provides is attributed to them, so an operator can always see
  that a value came from the recruit rather than from the club.

## Acceptance evidence

- `grounding: code-only`. Both sides drawn, because no token exists to
  photograph. If a token becomes available in seeded data before Stage 4, these
  screens are re-shot as photographs and this record is updated.

## Core decisions

| Decision                                                          | Classification                | Governing evidence or recommended default                                                           | Status  |
| ----------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------- | ------- |
| The ask is a minted form linked to the person, sent not published | `locked`                      | Brian, 2026-08-31                                                                                   | Settled |
| At most one open request per person, ever                         | `locked`                      | Task 09 amendment 3                                                                                 | Settled |
| Every field is optional and nothing gates                         | `locked`                      | Task 09 D5; invariant 4                                                                             | Settled |
| The six-field set above                                           | `proposed for owner approval` | First enumeration anywhere; Brian: "We need to figure out what those look like"                     | Open    |
| The ask is sent a day after the welcome, as its own message       | `proposed for owner approval` | Open decision 1; the 2026-08-26 record says it rides the welcome, Brian later described a day later | Open    |
| One reminder, then silence until an operator acts                 | `proposed for owner approval` | The never-harsh rule permits the reminder and forbids the cadence                                   | Open    |

## Brian approval

- Exact words:
- Date:
