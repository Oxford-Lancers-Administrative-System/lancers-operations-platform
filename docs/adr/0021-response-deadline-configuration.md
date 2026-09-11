# 0021 — RSVP response deadlines are central configuration, not per-event input

**Status:** Accepted · **Date:** 2026-08-13 ·
**Partly superseded by [0036](0036-messaging-schedule-configuration.md)**
(2026-08-25): decision 3's prohibition on a configuration-administration surface
is reversed, and every deadline is now measured from the event's own start
rather than from a fixed 18:00 wall clock. The day counts below, the complete
table with no default arm, the clamp, and the refusal of a per-event override
all survive.

## Context

Approval writes a response deadline onto every invitation to a
response-soliciting event (invariant E6: an event that solicits no response
carries none, and its invitations can never expire). LAN-77 had to put a value
in `invitations.expires_at`, and there was nowhere to get one from.

The deadline is not a cutoff. `docs/ux/slice-ux.md` § 9 keeps responses open —
and changeable — until the event starts, including after the deadline has
passed. What the deadline decides is when an unanswered invitation becomes an
**exception the club chases**, feeding `nonresponse_queue` and the Monday
report. So its value is a statement about how much planning lead time the club
needs, not about politeness.

LAN-77's owner clarification of 12 August 2026 settled the _shape_: the deadline
is derived from centrally configured rules for the event type, is shown to the
approver during final approval, and the MVP provides no per-event override and no
free-entry deadline field. It explicitly did **not** settle the values, and said
so: "the governing documentation still contains no approved duration/value for
each event type … implementers must not invent them."

Two artefacts implied two days before at 18:00 — an approved wireframe's
illustrative text and the synthetic seed's generator — and neither is an
approved club rule. Implementing from them would have laundered an illustration
into policy, so implementation stopped and asked.

## Decision

Brian decided the values on 13 August 2026. They live in
`src/lib/services/response-deadline.ts` as a complete table over
`public.event_type`, with his reasoning recorded beside them.

- **Two calendar days before the event date, at 18:00** — `practice`,
  `strength_and_conditioning`, `chalk`, `recruitment`, `meeting`, `other`.
- **Five days** — `social`.
- **Seven days** — `fixture`, `varsity`, `camp`.

All times are `Europe/London` wall clock, resolved in PostgreSQL so that both
British Summer Time transitions inside a season are correct.

Three further rules follow from it, and each is a constraint on later work:

1. **The table is complete, and there is no default arm.** An event type with no
   configured rule is a refusal (`response_deadline_not_configured`), not an
   inherited two days. Widening `public.event_type` therefore forces the
   decision to be made rather than silently absorbed.

2. **A deadline already in the past is clamped to the approval moment**, and the
   approver is shown "Due immediately" before committing. Approval is never
   refused for being late, and the deadline is never moved beyond the club's
   own already-missed planning point. There is no minimum-notice window: a
   response stays useful until the event begins, and refusing approval would
   block legitimate last-minute events.

3. **No per-event override, and no configuration-administration surface.** Not a
   field, not a query parameter, not an "advanced" disclosure. The narrow
   central rule this ADR records does not authorize the broader post-MVP event
   template and configuration administration in LAN-106.

## Consequences

- Changing a deadline is a change to one frozen table in one file, reviewable on
  its own — and it is club policy, so it needs Brian rather than a reviewer.
- The values carry no measured evidence behind them, which Brian recorded
  explicitly. Socials and camps vary in their logistical needs, and the fixed
  rules cannot represent every deposit, accommodation or booking deadline. They
  are approved as the fixed MVP configuration and are **to be reviewed after the
  controlled pilot**.
- The deadline is frozen onto each invitation at approval. Amending an approved
  event does not currently recompute it; the amendment workflow is unowned (see
  LAN-77's owner clarification) and will have to decide that deliberately.
- Because approval can clamp, an event approved close to its date puts its whole
  audience into the nonresponse queue at once. That is the honest consequence of
  approving after the planning point, and it is surfaced on the approval screen
  rather than discovered in the Monday report.
