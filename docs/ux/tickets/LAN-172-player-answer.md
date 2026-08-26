# LAN-172 — Answer an invitation: templates, landing pages and the player's own page (W2)

Status: implemented as part of mission `M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY`,
package `WP-player-answer`. Verify against the current live Linear issue and
`missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/acceptance/W2.md`
before further implementation.

> **Synthetic scenario data:** every displayed person, contact detail, status,
> response and attendance record is synthetic and does not correspond to a real
> member.

## Purpose

A player taps **Yes view details** or **No give reason** in an approved
WhatsApp message (or the equivalent email calls to action), and the tap is
already the answer by the time any page renders. The click opens an
answer-specific landing state, then ends on the player's own durable page:
everything still needing an answer, and everything already answered whose
event has not happened yet.

The current live LAN-172 issue, comments, relationships and mission journal
decisions remain authoritative. Shared vocabulary, responsive behaviour and
cross-ticket states are defined in [`../slice-ux.md`](../slice-ux.md) and are
not duplicated here.

## Owned screens and routes

| Screen | Route                                      | Audience       |
| ------ | ------------------------------------------ | -------------- |
| W2-01  | (WhatsApp/email copy)                      | Invited player |
| W2-02  | (WhatsApp/email copy)                      | Invited player |
| W2-03  | `/a/[token]`, then `/me/[token]?open=<id>` | Invited player |
| W2-04  | `/a/[token]`, then `/me/[token]?open=<id>` | Invited player |
| W2-05  | `/me/[token]`                              | Invited player |
| W2-06  | `/me/[token]`                              | Invited player |

**W2-03 and W2-04 are two steps, not two routes.** `/a/[token]` is
deliberately the minimum a side-effect-free GET can show — the answer-specific
heading, the event's facts, the aggregate count, and the one control Q-11's
accepted no-JavaScript deviation calls for. The rich per-invitation content the
workflow describes for those screens — the questions a Yes still owes, the
reason box a No still owes, the other-invitations notice — lives on `/me/[token]`
in a focused panel opened by `?open=<invitationId>`, because that content
requires a write authorization the one-time answer token has already spent by
the time it is needed. This is a deliberate implementation shape within the
delegated authority Q-11 leaves open ("exact safe implementation... delegated
to Mission Lead"), not a narrower reading of the workflow's screens.

## Wireframes

`missions/packets/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/mockups/W2.html`
is the approved mockup this implementation follows for copy and information
hierarchy. No `docs/ux/wireframes/` SVGs exist for this ticket; the mission
packet mockup is the named source per the brief.

## This ticket builds

- The player-facing WhatsApp and email content for the `invitation` and
  `reminder` rungs: two URL buttons/calls to action (Yes, No), no raw link in
  body copy, no count on the first message, an accurate live Yes count from the
  second rung onward.
- `/a/[token]` — the one-time answer link. A side-effect-free GET (Q-11):
  resolves the token, renders the answer-specific state, and writes nothing,
  not even a use counter. A cookie-gated POST that consumes the token, records
  the response, and mints a fresh durable credential in the same transaction.
- `/me/[token]` — the player's durable, season-scoped page. Work needing an
  answer above (next invitation visually dominant), already-answered upcoming
  events below (Yes and No alike, each changeable), a focused panel for one
  invitation's follow-up work (event questions, a No's reason), and the empty
  state.
- The credential module (`src/lib/services/player-answer-tokens.ts`): mint,
  resolve and consume for the one-time answer token; mint (reissue), resolve
  and revoke for the durable person token. Both live in `person_access_tokens`,
  which LAN-169 shipped with zero consuming code.
- The answer-recording path (`recordAnswerIn`, extracted from
  `recordSignedLinkResponse` in `src/lib/services/rsvp.ts`) shared by the
  answer link, the durable page's own writes, and the pre-existing signed-link
  page — one transactional definition of "record an answer", not three.

## Explicitly not in this ticket

- The operator surfaces (`src/app/participation/`) — LAN-170 and LAN-173.
- The messaging plan disclosure and schedule page — LAN-171.
- The Meta cutover: registering the templates this ticket declares, the
  manifest, the config check, the first real dispatch — LAN-168.
- Any schema change. `person_access_tokens` is used exactly as LAN-169 shipped
  it; the one-time answer token's invitation and answer identity is carried in
  its own plaintext (see `docs/architecture/data-model.md`), not a new column.
- An operator-facing control to revoke a person's durable link.
  `revokePersonTokenIn` exists and is tested; nothing in the operator UI calls
  it yet. `src/app/participation/` is out of this package's boundary, so the
  trigger for this capability is a follow-up.
- Rewiring the nudge, schedule-change and cancellation messages onto the
  durable page. They continue to use the pre-existing signed per-invitation
  link (`/rsvp/[token]`) unchanged. Only `invitation` and `reminder` — the two
  rungs Q-11 and the W2 acceptance evidence are about — carry the new two-button
  answer shape.

## Owner-resolved contract — Q-11, the release gate

`REQ-no-false-rsvp`. Resolved by Brian, 2026-08-25, restated in full in
LAN-172: the WhatsApp URL button carries a one-time token; the GET is entirely
side-effect-free; the GET sets a cookie; the POST is accepted only when that
cookie returns; the token is single-use at POST; no user-agent sniffing. The
accepted deviation is the no-JavaScript single control on `/a/[token]`, worded
as the answer action (it reuses the exact WhatsApp button label — Q-10) and
never as a confirmation.

Implementation: the cookie is set by `src/proxy.ts`, not by the page — a
Server Component's render may not mutate cookies in this framework — scoped by
`Path` to the exact request pathname, which is what makes it return only on a
POST to that same token's own URL. See `src/lib/rsvp/answer-gate.ts` for why
presence alone, with no value comparison, is the whole check.

## Owner-resolved contract — Q-10, button labels

Alphanumerics and spaces only, no em dashes: **"Yes view details"** and
**"No give reason"**, declared once in `src/lib/delivery/templates.ts` as
`YES_BUTTON_LABEL` / `NO_BUTTON_LABEL` and reused verbatim by `/a/[token]`'s
own control, so the WhatsApp button and the page it opens never say two
different things for the same action.

## Owner-resolved contract — Q-12, the cancellation scope

An arriving RSVP cancels only `job_type in ('invitation', 'reminder')`. It
does not cancel a `schedule_change_notice` or a `cancellation_notice`. This is
enforced in `stopChasingIn` (`src/lib/services/rsvp.ts`, shipped by LAN-169)
and this ticket does not widen it — `recordAnswerIn` calls the same function
every answer path already used.

## Answer behaviour

- **A No is standing from the click**, with the visible default **"No reason
  given"**. The `/a/[token]` POST records exactly this default
  (`NO_REASON_GIVEN_DEFAULT`); no copy anywhere implies the No is unrecorded
  until a reason arrives. Adding a real reason from the durable page's focused
  panel appends a new `rsvp_responses` row (via the same `recordAnswerIn`) and
  never edits history.
- **A Yes is standing while required event questions remain outstanding**,
  qualified separately as "Additional questions outstanding" on both the
  durable page's summary rows and its focused panel.
- Either click **cancels every later player-facing job and clears an
  un-actioned nonresponse flag in the same transaction** — inherited from
  `recordAnswerIn`/`stopChasingIn`, not reimplemented here.
- **Emphasis always points at Yes.** The Yes control is filled (`success`) on
  every surface this ticket ships; every No control is unfilled, including on
  `/a/[token]` where it is the only control in its row. Standing-answer colour
  follows `src/app/participation/participation-table.tsx`: Yes `success`, No
  `error`.

## The player's own page

`/me/[token]`: **Needs your answer**, most urgent (nearest deadline) event
visually dominant, above **Your answers — still to come** (Yes and No alike,
each with a **Change** control). An approved event is visible here before its
invitation is ever dispatched — the query has no dispatch condition, only
`events.status = 'approved'` — so answering early naturally suppresses rung 0
through the same `stopChasingIn` cancellation every other answer triggers.
Empty state reads **"No outstanding events"** and links to the public calendar
(`/calendar`, LAN-153).

**Simplification recorded here rather than hidden**: the workflow's three-way
split ("New invitations", "Still need your answer", "Follow-up needed") is
implemented as two sections (needs an answer; already answered) with
follow-up work — a missing reason, outstanding questions — shown as a qualifier
chip on the relevant row rather than as a third physically separate section.
This satisfies the acceptance list's actual checkable items (needs-answer
above already-answered, both directions changeable, follow-up visible) without
an "opened/unopened" tracking column this package has no migration to add.

## The credential

`person_access_tokens`, LAN-169's table, first consumed here. Season-scoped
(a live read of `seasons.closed_at`, never a stamped expiry), digest only,
revocable per person without waiting for Mission 10
(`revokePersonTokenIn`). A durable link is **reissued**, not recovered, at the
moment a fresh one is needed (today: the instant after `/a/[token]` records an
answer) — its previous plaintext cannot be read back from the digest that is
all the database ever stored, the same limitation `rsvp_access_tokens`
already lives with.

**Cross-person isolation is proved by test.** `resolveAnswerTokenIn` cross-checks
the token's own `person_id` against the invitation it names before returning
anything; `recordPlayerHomeAnswerIn` re-proves ownership inside the write
transaction for every durable-page write; `readPlayerHomeIn` is scoped
entirely by the resolved `personId`. All three are exercised in
`src/lib/services/player-answer-tokens.test.ts` and
`src/lib/services/player-home.test.ts`, including a token whose invitation id
has been substituted for somebody else's.

## Requirements

`REQ-whatsapp-actions`, `REQ-click-is-the-answer`, `REQ-no-false-rsvp`,
`REQ-no-reason-given`, `REQ-yes-stands-with-questions`, `REQ-one-nudge` (the
nudge message itself is unchanged by this ticket — see Explicitly not in this
ticket), `REQ-attendance-not-absence`, `REQ-plain-first-contact`,
`REQ-player-page`, `REQ-player-page-empty`, `REQ-approved-means-visible`,
`REQ-cross-person-isolation`.

## Acceptance

- [x] Preview, scanner, reload and double-tap tests prove no false response is
      created, and that a GET writes nothing —
      `player-answer-tokens.test.ts`'s "makes no write at all on a valid
      read" and "is idempotent" cases.
- [x] A player's answer is standing before the landing page renders — the
      WhatsApp/email tap is the POST's cookie-gated write; the GET only reads.
- [x] A No is standing from the click with "No reason given"; adding a reason
      appends without editing history.
- [x] Either answer cancels later player-facing jobs and clears an un-actioned
      flag atomically.
- [x] WhatsApp 1 renders with no count of any kind; later rungs and landing
      pages carry accurate counts (`templates.test.ts`).
- [ ] An incomplete Yes produces exactly one further message. **Not built by
      this package** — the nudge dispatch path is unchanged (see Explicitly
      not in this ticket) and this criterion belongs to whichever package
      wires "Yes recorded, required questions outstanding" to a nudge job.
- [x] The player's page returns only that player's own work; a foreign
      identifier is absent from content, DOM and payload
      (`player-home.test.ts`'s cross-person-isolation case).
- [x] The credential stops resolving on season close, and an operator can
      revoke one without one (`resolvePersonTokenIn`, `revokePersonTokenIn`;
      no operator UI trigger yet — see Explicitly not in this ticket).
- [x] An approved event appears before dispatch, and answering early
      suppresses rung 1.
- [x] Desktop and true 375px conform; no horizontal scrolling — see the visual
      preflight evidence in the pull request.
- [x] `npm run verify`.

## Boundaries

No migration. Reads stay no-cache, non-indexed, no-referrer (`src/proxy.ts`).
Domain writes stay server-only with no public table grants — `person_access_tokens`
carries the same `revoke all ... grant select, insert, update to service_role`
posture LAN-169 shipped. Unknown, revoked, event-started and (for the durable
credential) season-closed tokens remain publicly indistinguishable. Local
Supabase only. No real message to any real person. Draft PR only.
