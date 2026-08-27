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

**Correction round 2 (Q-22).** The paragraph this replaces quoted W2's
delegation as _"exact safe implementation... delegated to Mission Lead"_. The
ellipsis dropped the scope and the constraint the real clause carries —
`W2-answer-an-invitation.md:391`: _"Exact safe implementation **of one-time
actions, sessions and scanner resistance** — must satisfy the visible and
security acceptance **without changing meaning**."_ That narrower, security-
only delegation was then cited to justify stripping the fact block, social
proof and other-invitations notice off `/a/[token]`, and collapsing the
workflow's four-section durable page to two. Neither reduction was ever put to
Brian, and a note in this ticket is not the same thing as his approval — the
harness has an `owner-checked` milestone precisely so that a rendering
departure becomes an owner question before it is built, not a paragraph the
implementer wrote for itself. Both reductions are corrected in this round; see
the sections below for what each screen now shows.

**W2-03 and W2-04 are two steps, not two routes**, and that division is what
Q-11 actually delegates: the GET (`/a/[token]`) stays entirely side-effect-free
per `REQ-no-false-rsvp`, so it can never write on its own — the event's own
questions, or a No's reason, are never recorded merely by the page rendering.
What the GET shows is every fact the mockup draws for these two screens: the
player's name, venue, response deadline and standing answer, live social
proof, and the other-invitations notice.

**Correction round 5 (OWNER-LAN172-12, OWNER-LAN172-13) moves the follow-up
itself onto this same GET's page**, superseding round 2's placement of it on
`/me/[token]` alone. Brian, more than once: _"I shouldn't have to click twice
to get to the answers"_ and _"If I click no on the answer, I should go to the
page, and I should have the reason sit in there."_ W2 line 61 already said
this: the Yes landing "asks applicable event questions"; the No-path section:
"the reason field belongs on that page." The event's questions (Yes) or the
reason field (No) now render directly on `/a/[token]`'s own page, inside the
**same `<form>`** as the confirm button — one submit records the RSVP and
saves the follow-up together. This does not touch Q-11: the GET is exactly as
side-effect-free as before (the form is markup, not a write), and the POST is
still the one, single, cookie-gated action (`submitAnswer`) that already
protected the RSVP recording — no second gate was added, and no existing one
was widened. `/me/[token]`'s own focused panel is unchanged and still exists:
it is where a player who used "New invitations"/"Still need your answer" on
their own durable page (never touched a WhatsApp link) answers the same
follow-up, and where anyone can return later to finish what the landing page's
one visit did not (an optional question left blank, for instance).

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
  resolves the token, renders the answer-specific state and, since round 5,
  the applicable event questions (Yes) or the reason field (No) inline, and
  writes nothing, not even a use counter. A cookie-gated POST that consumes
  the token, records the response, saves whatever follow-up the same form
  carried, and mints a fresh durable credential, all in the same transaction.
- `/me/[token]` — the player's durable, season-scoped page. The four approved
  sections in order (New invitations, Still need your answer, Follow-up
  needed, Your answers — still to come), the single soonest unanswered
  invitation visually dominant, a 21-day horizon with everything beyond in one
  openable further-out section, a focused panel for one invitation's
  follow-up work (event questions, a No's reason), and the empty state.
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
as the answer action and never as a confirmation. Untouched by correction
round 3: the GET still writes nothing, the POST is still cookie-gated and
single-use. Untouched by correction round 5 too, which folds the event's
questions (Yes) or the reason field (No) into that same one control's own
`<form>` rather than adding a second write path: still one cookie check
before any transaction opens, still one action (`submitAnswer`), still a
single-use token. The two same-page shortcuts round 5 adds — "Plans changed?"
on the Yes page, "Change to Yes" on the No page — post through this identical
action with an `intent` field the way `submitAnswer` already reads any other
form field; they do not create, weaken or bypass a gate, because there is
still only the one.

Implementation: the cookie is set by `src/proxy.ts`, not by the page — a
Server Component's render may not mutate cookies in this framework — scoped by
`Path` to the exact request pathname, which is what makes it return only on a
POST to that same token's own URL. See `src/lib/rsvp/answer-gate.ts` for why
presence alone, with no value comparison, is the whole check.

**Correction round 6 (OWNER-LAN172-17): the accepted deviation's own POST is
built.** Every round through 5 left `/a/[token]`'s form as a manual click
only — the no-JavaScript fallback Q-11 names as "the one accepted deviation"
was, in practice, the only path any player was ever on: the WhatsApp tap
loaded the page, and the page's own heading and fact box already said "You're
attending" / "You're not attending — no reason given" as if recorded, while
nothing had been. `src/app/a/[token]/auto-submit.tsx` — a small client
component — now calls `requestSubmit()` on the page's own form the instant it
mounts, in a JS-capable browser, so the tap really is the whole interaction.
Nothing about the gate moves: the GET this component's own page renders still
writes nothing; the POST it triggers is the exact same `submitAnswer` action,
checked against the exact same cookie `src/proxy.ts` already set on that GET.
No user-agent sniffing was added or considered — a browser without JavaScript
simply never runs the effect, and the unmodified visible button is the
fallback Q-11 always described. Guarded off while a throttled retry's own
`BUSY_MESSAGE` banner is showing, so a rate-limited client cannot re-trigger
itself in a loop.

**Correction round 7 (Q-30, LAN-172-r5-F1): the auto-submit itself defeated
the gate it was built to satisfy.** Round 6's `requestSubmit()` fired
unconditionally on mount. The gate cookie is set unconditionally too, on
every GET — presence, not value, is the whole check, exactly as this
section's own paragraph above says — which was safe only as long as
nothing but a human's own click could turn that GET's cookie into a POST.
Firing on mount alone collapsed that: any JS-executing visitor that renders
this page — including the well-documented class of corporate link/email
security scanners that render full JavaScript in headless Chromium
specifically to catch dynamic phishing behaviour — carries the same cookie
back on the same-origin POST its own script fires, with no human action at
all. `REQ-no-false-rsvp` names a security scanner explicitly as an actor
that must never produce an authoritative response, so this was a release-
gate violation, caught in correction review round 5 (LAN-172-r5-F1) before
merge, not a cosmetic gap.

Brian's resolution, recorded as **Q-30**, chose explicitly among three
options put to him and picked **option (c)**: gate the submit on a genuine
human-interaction signal a fetcher does not produce, rather than (a)
declaring this population already accepted as out of Q-11's scope, or (b) a
different mechanism entirely. His words: _"And option C."_
`src/app/a/[token]/auto-submit.tsx` now attaches passive listeners for
`pointerdown`, `pointermove`, `mousemove`, `keydown`, `touchstart`,
`touchmove`, `scroll` and `wheel` — Brian's own named categories (pointer,
key, touch, scroll) — and submits on the first one to arrive, never on mount.
This is not the user-agent heuristic Q-11 already forbade: that ruled out
guessing _who_ a visitor is from a string it sends; this is direct evidence
of _what actually happened_ in the browser, stronger evidence of a human
than "the cookie came back" ever was. The GET still writes nothing; the POST
is still checked against exactly the same cookie; the token is still
single-use and idempotent regardless (`consumeAnswerTokenIn`'s row lock,
unchanged). A visitor who never produces a qualifying signal — no
JavaScript, or a human who reads without ever touching the screen — still
sees the page's own single visible button: Q-11's fallback, now covering a
slightly wider population than before, by design.

Proved live, headless, end to end, against the real local stack: a fresh
token rendered with zero simulated interaction, then observed idle, records
nothing and never consumes the token; a second, independent fresh token
rendered and given exactly one genuine interaction (a real Playwright mouse
move, dispatched the way OS input is, not a page-authored fake) records
exactly one response, consumes the token once, and redirects to the durable
page — see the pull request for the exact commands and output.

**Deliberately left unchanged: `/a/[token]`'s heading and "Your answer" fact
box still describe the token's own encoded answer immediately, before any
interaction or write.** Interaction-gating can only widen the window before
a real write lands compared to round 6 (a passive reader who never scrolls
or taps now stays on the fallback indefinitely, which is the intended
consequence of Q-30, not a flaw in it), so this reopens exactly the tension
the original walk report first named for this copy. Addressing it was
correction review round 5's own explicit invitation ("decide this
deliberately and say... how you handled it"), not part of Q-30's own ask
(gate the write, not redesign the page), and reversing it would touch an
explicit prior owner decision (round 5, OWNER-LAN172-13) that this ticket's
own words are the click already recorded it. Left unchanged this round;
recorded here, and in this round's own receipt, as a residual item for
Brian's attention — not decided silently.

## Owner-resolved contract — Q-10, button labels

Alphanumerics and spaces only, no em dashes: **"Yes view details"** and
**"No give reason"**, declared once in `src/lib/delivery/templates.ts` as
`YES_BUTTON_LABEL` / `NO_BUTTON_LABEL`. This is the message's own contract —
what Meta's WhatsApp URL buttons must say, 25 characters and alphanumeric
because Meta enforces it.

**Correction round 3 (OWNER-LAN172-10).** The first two rounds also reused
these exact strings verbatim on `/a/[token]`'s own on-page button, on the
reasoning that message and page should never say two different things for the
same action. Brian: _"the bottom of the screen says something like 'Yes, go
see it'... the text is weird"_ — reusing "view details" once the details are
already on screen is a category error, not consistency. Q-10 governs only the
message's own labels; the on-page button is a second, separate control the
player only sees after already arriving, and is free to name what happens
next. It now reads **"Save options"** when the event has questions waiting, or
**"Go see other events"** when it does not (`confirmLabel`, `hasQuestions`
param).

**Correction round 5 (OWNER-LAN172-13) replaces the No page's single
confirm button entirely.** The button that used to read `NO_BUTTON_LABEL`
verbatim ("No give reason") is gone — Brian: _"'No, give reason' is a dumb
thing"_ — not renamed but removed, replaced by the reason field and its own
two controls (below). `NO_BUTTON_LABEL` itself is untouched as the message's
own Q-10 contract; it simply has no on-page button reusing it any more.

## Owner-resolved contract — Q-12, the cancellation scope

An arriving RSVP cancels only `job_type in ('invitation', 'reminder')`. It
does not cancel a `schedule_change_notice` or a `cancellation_notice`. This is
enforced in `stopChasingIn` (`src/lib/services/rsvp.ts`, shipped by LAN-169)
and this ticket does not widen it — `recordAnswerIn` calls the same function
every answer path already used.

## Answer behaviour

- **A No is standing from the click**, with the visible default **"No reason
  given"**. The `/a/[token]` POST records exactly this default
  (`NO_REASON_GIVEN_DEFAULT`) when the reason field was left blank — round 5
  puts that field on the same page and the same submit, so a real reason typed
  there is recorded immediately instead of defaulting. No copy anywhere
  implies the No is unrecorded until a reason arrives. Adding or changing a
  reason later, from the durable page's focused panel, appends a new
  `rsvp_responses` row (via the same `recordAnswerIn`) and never edits history.
- **A Yes is standing while required event questions remain outstanding**,
  qualified separately as "Additional questions outstanding" on both the
  durable page's summary rows and its focused panel. Round 5 lets a Yes
  answer those questions in the same submit that records the RSVP, on
  `/a/[token]` itself; the focused panel still asks whatever was left
  unanswered. **Correction round 6 (OWNER-LAN172-18):** round 5's shared
  submit put the confirm button and the questions in one `<form>`, and the
  native `required` attribute on a required question silently blocked that
  form from submitting at all — the opposite of this rule, discovered once
  round 6's auto-submit (above) meant that attribute was blocking the answer
  on every load, not only an inattentive manual click.
  `src/app/a/[token]/question-field.tsx`'s `QuestionField` now takes an
  `enforceRequired` prop (default `true`); `/a/[token]` passes `false`, so a
  blank required question never blocks this submit, auto-fired or manual.
  `answerEventQuestionsIn` already skipped a blank submission rather than
  saving an empty answer, so nothing false is ever recorded — the question is
  left genuinely outstanding for the focused panel, exactly as this bullet
  says it should be. The focused panel's own dedicated questions form keeps
  `enforceRequired`'s default: that Yes already stands by the time that form
  is on screen, so `required` there only ever gates its own Save, never the
  answer.
- Either click **cancels every later player-facing job and clears an
  un-actioned nonresponse flag in the same transaction** — inherited from
  `recordAnswerIn`/`stopChasingIn`, not reimplemented here.
- **Emphasis always points at Yes.** The Yes control is filled (`success`) on
  every surface this ticket ships; every No control is unfilled. On
  `/a/[token]`'s No page (round 5), that means **"Give a reason and
  continue"** (unfilled) beside **"Change to Yes"** (filled) — two controls
  now, not one, with the rule applied to each by what it means, not by which
  row it sits in. Standing-answer colour follows
  `src/app/participation/participation-table.tsx`: Yes `success`, No `error`.

## The player's own page

`/me/[token]` carries the player's own name at the top (Brian, 2026-08-26: "it
should have the player's name so it knows that I'm on the right page" — no
other personal detail), then the approved heading — a count of outstanding
work, **"You have N invitations to answer"** — never invented copy.

**Correction round 3 (OWNER-LAN172-07): the count is scoped to the horizon.**
Brian saw "You have 6 invitations to answer" on a page rendering nothing
outstanding — every one of the six sat beyond the 21-day horizon, in the
closed-by-default Further ahead section. His ruling, Q-26, overrides an
earlier decision to keep the count total and label the section instead:
_"The six outstanding should just be the ones within the 21-day time horizon.
I want the ones that are approved and within 21 days, and that's what it
should be built around."_ `outstandingCount` now counts only unanswered
invitations that are both approved and within the horizon — exactly the set
`newInvitations` and `stillNeedAnswer` render inline. A player whose only
outstanding work sits beyond the horizon sees a heading of **zero** and their
work in Further ahead — that is intended, not a bug. Beyond-horizon events
stay fully reachable there, so `REQ-approved-means-visible` is unaffected.

**Correction round 5 (OWNER-LAN172-14): the heading never denies live
follow-up work.** Brian saw **"No outstanding events — you have answered
every invitation waiting for you. Nothing else needs an answer right now."**
directly above an open, required question. `outstandingCount` legitimately
reads zero in that state — it counts only `response === null`, unchanged by
this finding — but the heading's own sentence was false: something did still
need finishing. `pageHeading` now takes a second signal,
`followUpNeeded.length > 0`, and reads **"You have follow-up work to
finish"** with its own honest help text whenever there is no new work but a
standing answer still owes a reason or a question. The genuinely empty
state — no outstanding count and no follow-up — is unchanged.

**Correction round 5 (OWNER-LAN172-15): two counters, one shared
definition.** Brian, on one screen: the heading read zero outstanding while
the panel below it read "You have 3 other invitations still waiting for an
answer." `otherOutstandingCount` (`readPlayerAnswerLandingIn`) had no horizon
at all, while `outstandingCount` had been scoped to Q-26's 21 days since
round 3 — two correct numbers, two different windows, reading as one bug.
Both now read the same `eventWithinHorizonExpression` helper in
`player-home.ts`, so they cannot drift apart again; `otherOutstandingSentence`
on `/a/[token]` inherits the fix from the same source, with no separate change
needed there.

**Correction round 2 (Q-22): the four approved sections, restored.** The first
draft collapsed the workflow's three-way split of unanswered work to two
sections and recorded the collapse as a note in this ticket rather than an
owner question — exactly the shape Q-22 exists to catch. `readPlayerHomeIn`
now builds all four, in the approved order:

- **New invitations** — unanswered, and the club has not yet chased it.
- **Still need your answer** — unanswered, and a reminder has gone out.
  LAN-169's messaging ladder makes this a real, derivable fact
  (`notification_jobs.job_type = 'reminder'` completed for the invitation) —
  not the literal "opened the link" the mockup's copy suggests, which Q-11
  keeps untrackable on purpose (the answer link's GET stays side-effect-free).
- **Follow-up needed** — a standing No still carrying the honest default, or a
  standing Yes with required questions outstanding.
- **Your answers — still to come** — everything else already answered, Yes and
  No alike, each with a **Change** control.

The single soonest unanswered invitation, across the first two sections, is
visually dominant — never more than one per page. Every row carries a status
chip (`Next` / `Awaiting answer` / `No reason given` / `Attending` / `Not
attending`) alongside the event's own type chip, and two direct actions —
side-by-side Yes/No for unanswered rows, matching the approved `mini-actions`
control, never a single navigation button that costs a second tap.

**Q-20's 21-day horizon.** The four sections above show only events within 21
days (`PLAYER_HOME_HORIZON_DAYS`, a single named constant); everything beyond
sits in one further "Further ahead" section the player opens themselves.
Nothing is hidden — `REQ-approved-means-visible` stands unchanged — an
approved event is visible here before its invitation is ever dispatched, the
query has no dispatch condition, only `events.status = 'approved'`, so
answering early naturally suppresses rung 0 through the same `stopChasingIn`
cancellation every other answer triggers.

Empty state reads **"No outstanding events"** the moment nothing needs an
answer, whether or not answered history remains below it, and links to the
public calendar (`/calendar`, LAN-153).

**A player's own No stands from the click, on this page too (Q-22,
`REQ-no-reason-given`).** The row and focused-panel No controls submit no
reason at all; `submitNo` fills the honest default (`"No reason given"`,
`NO_REASON_GIVEN_DEFAULT`) exactly as the WhatsApp/email answer link already
does, rather than refusing a blank field. Only the dedicated **"Save"** form
(renamed from "Give a reason and continue" — correction round 3, below) —
replacing an already-standing default with the player's real explanation —
still requires actual text server-side; the field itself carries no `required`
marker, since the No already stands without it.

**Correction round 3 (OWNER-LAN172-09): the standing-No panel reordered and
de-alarmed.** Brian: _"the callout at the top, 'No reason given,' is very
confusing... As soon as I click No, there should be a callout on this page for
me to show the reason I'm giving. I should be able to give a reason."_ The
panel foregrounded "Change to Yes" ahead of the reason field, and rendered the
honest default as an `error`-severity Alert — reading as a fault rather than a
recorded answer. Now, top to bottom: the plain acknowledgement (an `info`
Alert, not `error`), the optional reason field with an honestly instructional
placeholder (`"e.g. clashes with a family commitment"`, not the answer-shaped
`"Academic conflict"`) and its **Save** button, then **"Change to Yes"** as
the standing exit. `REQ-emphasis-points-at-yes` is unaffected — Change to Yes
keeps its filled treatment; only the order and tone of what precedes it
changed.

**Correction round 3 (OWNER-LAN172-08): saving questions ends in an
acknowledgement, not the same form.** Brian: _"as soon as I save answers, it
saves, but the page should do something after that... it should close it up
and say 'Answer recorded'... right now, it just goes blank."_ `submitQuestions`
always redirected to the same `open=` URL, and the form rendered whenever the
event had any questions at all, regardless of what remained outstanding — a
successful save just re-showed the identical, now pre-filled form. The
focused panel stops rendering the questions form once nothing is left to
offer; its own top Alert reads **"Attending — Answer recorded"** in that
state, the same "then a plain acknowledgement" Q-21 asks for on the No side
too — one rule, built once, in both places.

**Correction round 4 (LAN-172-r4-F1): "nothing left to offer" means required
_or_ optional, not required alone.** Round 3 shipped that gate as
`outstandingRequiredQuestions === 0`. Brian's own approved rule for a mixed
event — required and optional questions together — is exactly that: the
panel closes once the required ones are answered, even if an optional one was
left blank. But for an event whose questions are **all** optional,
`outstandingRequiredQuestions` is structurally zero from the start, with no
required question ever to satisfy — so that same gate hid the form on every
visit, forever, for any such event. `W2-answer-an-invitation.md`'s own
Yes-path acceptance section is explicit that "optional questions remain
visibly optional"; this silently
made them invisible instead. The gate now falls back to "any question of any
kind still unanswered" specifically when the event carries no required
question at all, so an all-optional event's questions are shown (and can be
answered and saved) at least once, while a mixed event's approved behaviour —
collapsing once the required ones are done, optional or not — is unchanged.

**Correction round 5 (OWNER-LAN172-16): saving ends the interaction, not just
the form.** Brian: _"Once I click Save, the box should go away, and I should
just go back to the normal page."_ and _"If I click save or change to yes,
that should be at the end of it."_ Rounds 3 and 4 replaced the re-shown form
with an acknowledgement inside the still-open panel; Brian's own words go
further — the panel itself should close, returning the player to the ordinary
page with the result already reflected in its list. `submitNo`'s own Save
form, `submitQuestions`, and the panel's own "Change to Yes" now redirect to
the plain `/me/[token]` (no `open=`) on success, instead of reopening the same
panel. A failed save is not a success: `submitNo`'s `reasonError` path is
unchanged and still reopens the same panel with the error visible — closing
is the confirmation a write actually happened, never a way to hide that it
did not. `ChangeToYesButton` (the row's own control) always closes, since it
only ever revises an _existing_ standing answer; `MiniYesNo`'s one-tap Yes for
a _brand-new_ invitation is untouched and still opens the panel when there are
questions to ask, because that is the only place left to ask them once
`/a/[token]`'s own token has already been spent.

**Correction round 6 (OWNER-LAN172-19) reverses this round's own
`ChangeToYesButton` claim above.** Brian's later, explicit "one interaction"
model treats a changed answer exactly like a first one: any Yes or No records
immediately and opens _that_ answer's own follow-up in front of the player;
only **Save** ends the interaction. Round 5's "always closes, since it only
ever revises an existing standing answer" was the wrong rule for exactly the
mixed-questions case: driving a standing Yes to No and back to Yes recorded
the second Yes and then closed the panel on the very question it had just
made outstanding again, leaving the player to notice a separate row-level
"Answer questions" button on their own. `close=1` is removed from
`ChangeToYesButton` (the row) and from the panel's own Change-to-Yes button;
`changeToYes` (`src/app/me/[token]/actions.ts`) no longer reads any such
flag and always opens the panel — identical to `MiniYesNo`'s fresh-Yes
behaviour, never a special case. Only `submitNo`'s own Save (the reason
form) and `submitQuestions` still close on success; changing an answer,
first time or revised, is not a Save. The row's own **"Change answer"**
label (round 3, OWNER-LAN172-11, below) is untouched — a later finding
recommended reverting it to "Change to No" and Brian's own decision stands
against that; the row's underlying behaviour (recording the No immediately
and opening its reason field, never a silent, unexplained default) was
already correct and is now covered by test.

**Correction round 6 (OWNER-LAN172-20): the focused invitation renders
once.** With `?open=<id>`, the same invitation used to appear twice — once as
the rich focused panel above, and again as an ordinary row further down in
whichever of the five lists it belonged to, each with its own separate
controls. A player who had just answered could not tell from the page alone
whether that answer was recorded once or twice (it was always once — this was
a rendering choice, not a data bug). `src/app/me/[token]/page.tsx` now
filters the focused invitation out of all five lists (new, still-need-answer,
follow-up, answered, further-out) before deciding what each section has to
show; a section left with nothing once its one entry was the focused one
drops its own heading too, rather than rendering empty.

**Correction round 3 (OWNER-LAN172-11): the row's secondary control.** Brian:
_"Change to 'no' should just say 'change answer.' It should not say 'change to
no.'"_ `REQ-emphasis-points-at-yes` governs the control's fill and weight, not
its wording — the control stays unfilled exactly as before. Renamed to
**"Change answer"** everywhere it appears as the secondary, unfilled control
on an established Yes, converging on the wording `PLANS_CHANGED` already used
("change your answer"). `CHANGE_TO_YES` and the reason-management labels (Add
reason, Edit reason) are untouched — Brian named only this one control.

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
anything; `consumeAnswerTokenIn` re-proves the same match inside the write
transaction (`for update of t`) before recording anything, whatever `response`
override or reason `submitAnswer` passes it — round 5's "Change to Yes" and
"Plans changed?" shortcuts change _what_ gets recorded, never _whose_ token
resolved; `recordPlayerHomeAnswerIn` re-proves ownership inside the write
transaction for every durable-page write; `answerEventQuestionsIn` re-proves
the invitation belongs to the resolved `personId` before saving any question
answer, on both call sites that now use it (`/a/[token]`'s own submit and
`/me/[token]`'s focused panel); `readPlayerHomeIn` is scoped entirely by the
resolved `personId`. All of these are exercised in
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
- [x] A player's answer is standing without a second tap for a real,
      JS-capable browser that does anything at all with the page — the
      landing page's own script fires the POST's cookie-gated write on the
      first genuine interaction (`auto-submit.tsx`, correction round 6,
      OWNER-LAN172-17, interaction-gated by Q-30 in round 7 after
      LAN-172-r5-F1 established that firing on mount alone let an automated
      scanner complete the write with no human action); the GET itself still
      only reads. Rounds 1 through 5 shipped the page believing this and
      saying so, but never built the auto-submit that makes it true; round
      6's own unconditional version made it true for every visitor, human or
      not, which is what round 7 corrects.
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
- [x] **Correction round 2 (Q-22):** the answer link's fact block, social
      proof and other-invitations notice, the focused panel's same content,
      the four-section durable page in approved order, the single dominant
      row, side-by-side row Yes/No, and Q-20's 21-day horizon all render as
      specified above, compared state-by-state against
      `missions/packets/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/mockups/W2.html`'s
      `yesPage()`, `noPage()`, `inbox()` and `emptyPage()` — see the pull
      request for the exact states compared and their screenshots.
- [x] **Correction round 3, from Brian's second walkthrough:** the heading
      count is scoped to the 21-day horizon and never disagrees with the
      rendered near-term rows (`player-home.test.ts`); saving the focused
      panel's questions ends in "Answer recorded", not a re-shown blank form
      (`screens.test.tsx`); the on-page confirm button names what a Yes does
      next instead of reusing the WhatsApp message's own label
      (`screens.test.tsx`); the standing-No panel leads with the reason field
      and an `info`-severity acknowledgement, its Save button is renamed, and
      its placeholder no longer reads as a real answer; the row's secondary
      control reads "Change answer" — compared state-by-state against the
      mockup's `yesPage()`, `noPage()`, `inbox()` and the durable page's
      heading and focused panel — see the pull request for the exact states
      compared and their screenshots.
- [x] **Correction round 4 (LAN-172-r4-F1):** an event whose questions are
      all optional still offers them through the focused panel, on the first
      visit and every visit until they are answered, and still collapses to
      "Answer recorded" once they are — a mixed event's approved behaviour
      (collapse once the required ones are done, regardless of an unanswered
      optional one) is unchanged (`screens.test.tsx`).
- [x] **Correction round 5, from Brian's continued walkthrough (five
      findings):** the Yes landing on `/a/[token]` asks the event's own
      questions inline, in the same form as the confirm button
      (OWNER-LAN172-12); the No landing takes the reason itself, with "Give a
      reason and continue" and "Change to Yes" as its only two forward
      controls (OWNER-LAN172-13); the durable page's heading never denies
      live follow-up work (OWNER-LAN172-14); the heading's count and the
      landing page's other-outstanding sentence read the same horizon-scoped
      number and cannot drift apart (OWNER-LAN172-15); saving a reason, saving
      questions, or changing to Yes each end at the plain page, not a
      re-opened panel (OWNER-LAN172-16) — Q-11's release gate, cross-person
      isolation and `/me/[token]`'s own focused panel are all unchanged;
      compared state-by-state against the mockup's `yesPage()` and `noPage()`
      and the durable page's heading and focused panel, at desktop and true
      375px, including the post-save closed state — see the pull request for
      the exact states compared and their screenshots.
- [x] **Correction round 6, building the "one interaction" model in full
      (four findings):** `/a/[token]` auto-submits its own cookie-gated POST
      in a JS-capable browser (unconditionally on mount as first shipped;
      corrected to interaction-gated by round 7, below), so the WhatsApp tap
      alone records the answer, with the visible button unchanged as the
      no-JS fallback (OWNER-LAN172-17); a blank required question never
      blocks that submit, auto-fired or manual, because `QuestionField`'s
      `enforceRequired` is `false` on this surface alone (OWNER-LAN172-18);
      `changeToYes` no longer accepts or honours a `close` flag, so a
      revising Change to Yes opens the panel exactly like a fresh one, never
      hiding a newly-outstanding question behind a premature close
      (OWNER-LAN172-19); the `?open=` invitation renders exactly once,
      filtered out of its own row section rather than appearing there a
      second time (OWNER-LAN172-20). Q-11's release gate, cross-person
      isolation, and every round 1–5 finding above are unchanged and
      re-verified — see the pull request for the injection-proof cycle per
      fix and the desktop/true-375px states compared.
- [x] **Correction round 7 (Q-30, LAN-172-r5-F1): the auto-submit itself is
      gated on a genuine interaction, not fired on mount.** Correction review
      round 5 established that an unconditional mount-fire let any
      JS-executing automated visitor — a real, named population under
      `REQ-no-false-rsvp`, corporate security scanners that render full
      JavaScript — complete the cookie-gated write with no human action, a
      release-gate violation caught before merge. Brian's own chosen
      resolution (option (c) of three put to him): fire only after a real
      pointer, key, touch or scroll event, never on mount alone. Proved by
      test that the write does not fire from rendering alone, fires exactly
      once after a qualifying event, and stays correct under remount, React
      Strict Mode's double-invoked effect, and an unmount mid-flight; proved
      live, headless, against the real stack, that zero interaction records
      nothing at all while one genuine interaction records exactly one
      response. The GET, the cookie check, and the token's single use are
      unchanged. Left deliberately unaddressed: `/a/[token]`'s heading still
      asserts the token's own encoded answer before any write lands, which
      interaction-gating widens the window for — see this ticket's own Q-11
      section above and this round's receipt for the reasoning.

## Boundaries

No migration. Reads stay no-cache, non-indexed, no-referrer (`src/proxy.ts`).
Domain writes stay server-only with no public table grants — `person_access_tokens`
carries the same `revoke all ... grant select, insert, update to service_role`
posture LAN-169 shipped. Unknown, revoked, event-started and (for the durable
credential) season-closed tokens remain publicly indistinguishable. Local
Supabase only. No real message to any real person. Draft PR only.
