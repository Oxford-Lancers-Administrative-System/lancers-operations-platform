# Group assignments and cross-feature journeys

One row per walker. The groups follow the mission boundaries, so they rarely
move; the journeys are worth rewriting whenever the workflows have. Each walker
gets its own row, the [walker brief](walker-brief.md), and nothing about the
other groups.

Every journey crosses at least one group boundary on purpose. A group walked in
isolation proves each screen and none of the seams, and the seams are where the
sweeps have found the expensive defects.

The list below is the LAN-239 cut, which covered the whole map in six walkers.

## M1 — Operator administration (tag `M1W`)

`/operate/admin/operators`, invite, the operator record, roles
(`/operate/admin/roles`), assign and end a role, deactivate and reinstate,
rehome the email, audit evidence, onboarding a coach, the guide
(`/operate/admin/guide`), and the unlinked / inactive / unauthorised states
(UX-03, UX-04, UX-05).

**Journey:** invite a new operator → the invitation appears on the record →
assign a role → end it → deactivate → reinstate → rehome the email → every step
is in the audit evidence → then sign in as the coach (`coach.json`) and confirm
the coach seat sees attendance only and every operator route refuses correctly
(UX-97, UX-05) → the operator's own record shows the coach onboarding.

## M2 — Events and calendar (tag `M2W`)

List, editor, templates, CSV import, approval, amend, cancel, delivery,
attendance (operator and coach seat — use `coach.json` for the coach), the
public calendar (`/calendar`, `/calendar/[id]`, `/calendar/view`), subscription
and ICS, and event club links (`/e/[token]`, created through Share link — none
are seeded).

**Journey:** create an event from a template → approve it with players and
recruits in the audience → delivery shows one invitation per person → RSVP yes
on one player link and no on another (`/rsvp/[token]`) → amend the time → the
players' links show the amendment → record attendance as the coach → add a
walk-up → cancel a different event → the Monday report (`/operate/report`)
reflects all of it.

## M4 — Messaging, reminders and recovery (tag `M4W`)

`/operate/admin/messaging`, `/operate/admin/follow-ups`, delivery statuses on
events, the answer link (`/a/[token]`), the stop link (`/me/stop/[token]`),
recording an answer in person, chase and escalation, the player home (`/me`,
`/me/[token]`).

**Journey:** an approved seeded event with unanswered invitations → the
follow-ups queue → record one answer in person → the player answers another on
`/a/[token]` → a third player uses the stop link → the delivery page, the
follow-ups queue and the event record all agree on who answered, who was chased
and who stopped → the Monday report agrees.

## M5 — People and roster (tag `M5W`)

People list, person record, edit, merge, the missing queue, add a person, the
roster board, the membership record, activation, returner intake
(`/operate/roster/new`), CSV roster import.

**Journey:** add a returning player whose name matches a seeded person → the
duplicate candidates screen → choose "same person" → the merge → the missing
queue shows what is missing → edit to fill it → the roster board and the
membership record agree → the person is in the audience of the next approved
event → the Monday report counts them.

## M6 — Recruitment (tag `M6W`)

The board, the record, QR sign-up (`/join/[code]`), walk-up capture on an
event's attendance sheet, add by hand, duplicate resolution, the interest
questionnaire (player link), exits, the flip to onboarding, the recruit sends
and their spacing.

**Journey:** walk-up at a seeded upcoming event → the new recruit's record →
send the questionnaire → answer it on the player link at 375 → flip to
onboarding → the onboarding record shows the answers → the chase queue → the
roster.

## M7 — Onboarding (tag `M7W`)

The three arrival doors, the player questionnaire (`/me/[token]`, five steps, at
375 above all), the operator record (each item's own state list, claimed,
history, activity log), the chase queue and cadence, agreements, the
missing-data nudge.

**Journey:** an operator adds a player by hand → sends the onboarding link → the
player completes only three of five steps and abandons → the chase fires or is
queued → the player returns on the same link and finishes → the roster record
and the player record agree on every fact → change one item's state → the player
sees the change.
