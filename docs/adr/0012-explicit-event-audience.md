# 0012 — The confirmed event audience is a relation; its non-emptiness is not

**Status:** Accepted · **Date:** 2026-08-10 · **Relates to:** [0008](0008-relational-mapping-conventions.md)

## Context

An independent verification of the schema baseline found that the frozen model's
**audience definition** had no physical representation. The baseline recorded
`audience_confirmed_at` and `audience_confirmed_by_person_id` on `events` —
metadata saying _that_ an audience was confirmed, with nothing saying _who_.

Two things followed from that, and both were real:

- Invariant **P7** requires `never-invited` to be reportable. With invitations as
  the only population, an absence has no row, so the reporting view could
  express four of the five states and silently omitted the fifth.
- The database could not distinguish **"outside the audience"** from **"in the
  audience and accidentally not invited"**. The first is not the club's concern;
  the second is an approval defect the weekly review needs to see.

The first event vertical slice would have had to invent the missing structure,
which the implementation ticket's definition of done explicitly rules out.

## Decision

**`event_audience_members` is the resolved audience** — one row per participant
the approver confirmed, anchored by the same capacity rule as invitations and
attendance (player → season membership, everything else → person).

**An invitation must be resolved from an audience member of the same event, in
the same capacity, for the same participant.** `invitations.audience_member_id`
is `not null` and bound by a composite foreign key. To make that binding cover
the participant as well as the event, both tables carry a stored generated
column `participant_id = coalesce(season_membership_id, person_id)`: a composite
key over the two nullable anchor columns would be skipped entirely whenever
either was null, under `MATCH SIMPLE`. Such a foreign key cannot use
`on update cascade`, which is fine — neither an audience member's id nor a
participant's identity is ever updated in place.

**The audience may be populated before approval.** It is the thing the approver
reviews, so requiring an approved event would have been circular. Drafts still
carry no invitations, responses or attendance.

**Invariant E1 is split.** E1a — an approved event records a date, a type, an
approver and an audience confirmation — remains a check constraint. E1b — the
confirmed audience is non-empty — is **service-layer enforced** and documented
as such.

## Why E1b is not enforced in the database

"At least one row exists in another table" has no declarative form in
PostgreSQL. Two options were considered:

- **A constraint trigger.** Rejected: the architecture record is explicit that
  changeable workflow must not be buried in triggers, and the implementation
  ticket's correction instructions ruled it out by name.
- **A back-reference from `events` to a representative audience member**, made
  mandatory from approval onward by a check. This _is_ declarative and would
  have closed the gap: the pointed-at row cannot be deleted, so the audience
  cannot become empty. It was rejected because it invents a modelling artifact
  the frozen model does not have — "the audience member that witnesses the
  confirmation" — and because a pointer to one member reads as if it means
  something about that member, which it does not. It remains available if the
  club later wants the guarantee at the database level; it is one column, one
  foreign key and one check.

The approval transaction in the TypeScript service layer inserts the audience
and flips the status together, and must refuse an empty one. A test asserts that
the _database_ accepts an approved event with an empty audience, so that nobody
reads the E1a check as proving more than it does.

## Consequences

- P7's five states are all derivable. `invitation_response_state` starts from
  the audience and left-joins invitations.
- A new exception view, `uninvited_audience_members`, surfaces people who were
  confirmed and never asked. It is deliberately **not** merged into
  `nonresponse_queue`: Requirement 6 automates chasing people who did not
  answer, and someone who was never asked is a different problem with a
  different owner.
- Adding a late invitee means adding them to the audience and inviting them in
  one transaction — which is what register D3 already described.
- The audience, the invitation, the RSVP and the attendance record remain four
  separate facts. Attendance still has no foreign key to any of them, so
  invariant P6's walk-up is unaffected.

## Decision history relocated from source (LAN-300)

### src/app/operate/events/[id]/audience-builder.tsx — module header

> UX-40 — choosing who an event is for.
>
> ## What this component owns, and what it deliberately does not
>
> It owns a tick list and nothing else. Pressing **Review** posts the selection
> to `saveEventAudienceAction`, which stores it against the draft and redirects
> to the confirmation. The confirmation and the empty-audience refusal are
> server-rendered from the stored rows, not from state in here.
>
> That split is the fix for what Brian found: the first version kept the whole
> audience in this component, so **Edit draft** and back threw it away. A
> component that holds the only copy of something valuable will eventually lose
> it. Now the database holds it and this screen is a way to change it.
>
> ## Selection starts from what is stored — which since D47 may be the template's
>
> `initialKeys` is the audience already stored on the draft. Two things put
> people there: the operator's own saved work, and the type's template, which
> supplies a default audience when the draft is created. Both are stored rows by
> the time this screen opens, so this component does not know or care which.
>
> That is the reversal D47 makes to LAN-77, and it is narrower than it looks.
> ADR 0012's rule is that the _system_ never implies an audience, and nothing
> below implies one: there is still no default group, no whole-roster fallback,
> and no "if none selected then everyone". A template's default audience is a
> choice the club made once, on purpose, and the sentence under the heading says
> which template made it so the approver knows what they are checking.
>
> ## Group buttons are toggles, and say what they will do
>
> A lit button means every one of that group's people is currently ticked;
> pressing it again clears them. The lit state is computed from the selection
> rather than remembered as "which buttons were pressed", because the two
> disagree the moment somebody unticks one person out of a group — and the
> button then has to stop claiming the whole group is in.
>
> The count on each button is **people**, not rows. Brian's instruction: the
> club knows what "everyone active" means, and the screen should not explain its
> own arithmetic. See `groupSize`.
>
> ## One row per person — LAN-294
>
> The catalogue is one row per _capacity_, and this screen used to render it
> one-to-one, so Bertram (player, President) and Caspian (player, three
> committee seats) each appeared twice. Brian, 2026-09-10, opening the picker on
> a practice event: a person appears once, however many roles they hold.
>
> So the list is `audiencePeople(candidates)` — the same collapse
> `resolveSelection` applies to the write, computed by the same rule, so the
> screen cannot come to a different answer than the transaction. A tick carries
> **all** of that human's keys in and out together, which is what leaves the
> group buttons behaving exactly as they did when there were two rows: press
> _All active committee_ and Bertram's committee key goes in; press it again and
> that key alone comes back out, and he stays in as a player.
>
> The count under the list was already people rather than rows, and still is.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/events/write.ts — applyTemplateAudienceIn header (LAN-77 reversal)

> D47 — the type's template supplies a default audience, which arrives with the
> event already set, visible and editable.
>
> This reverses LAN-77's shipped "the audience begins empty", and the reversal
> is narrow and worth stating precisely: what the _system_ still never does is
> imply an audience nobody chose. A default audience is a choice the club made
> once, deliberately, on the template — so the approver checks it rather than
> rebuilding the same thirty-two names every Wednesday. ADR 0012's rule that the
> stored audience is an explicit resolved list is untouched, and is the reason
> this resolves the groups to people here rather than storing a live query.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/event-audience.ts — file header (D47 reversal, groups source, event-date effective test)

> ## The one rule this module exists to serve, as D47 narrowed it
>
> `docs/adr/0012-explicit-event-audience.md` and Brian's 12 August
> clarification said selection begins empty and nothing is ever implied. **D47
> reverses half of that, deliberately and narrowly**, and LAN-154 is where the
> reversal lands: a type's template supplies a default audience, which arrives
> with a new event already set, visible and editable, so the approver checks
> rather than builds the same thirty-two names every Wednesday.
>
> What survives unchanged is the part ADR 0012 was actually about. There is
> still no whole-roster fallback and no "if none selected then everyone"
> anywhere here or in anything that calls it: an audience that nobody put there
> is still empty, and approval still refuses it. What the club configured once,
> on purpose, on the template, is not the system implying anything.
>
> The stored audience is still an explicit resolved list. A group is a way of
> selecting people, never a live query that changes underneath an approved
> event — which is why `createEventDraft` resolves the template's groups to
> people at the moment the draft is created.
>
> ## Where the groups come from
>
> All five derived groups are read from current authoritative domain data, not
> from a stored list somebody has to maintain:
>
> - **Active players** — the season's `active` memberships.
> - **Active coaches** — role assignments effective then whose role code is
>   one of `COACH_ROLE_CODES`. Register D8 puts coaching staff on the season,
>   but not everything scoped to a season coaches — see that constant.
> - **Active committee** — `committee_year`-scoped role assignments effective then.
> - **Everyone active** — the de-duplicated union of the three.
> - **Recruits** — open prospects in `recruitment_prospects`, offered on a
>   Recruitment event alone (D46).
>
> "Effective" is the domain's own definition and not a status column:
> `effective_from <= date < effective_to`, per register D11 and invariant S4,
> which is what makes a mid-year handover resolve to the person holding the seat
> rather than to whoever held it first.
>
> ## …and why that date is the event's, not today's
>
> The obvious implementation asks who holds a seat _now_, and it is wrong in the
> ordinary case. The club plans a season before it starts: in the seeded club on
> 13 August 2026 the 2026-27 coaches are appointed from 1 September and players
> have no position assignments until 27 September, so a catalogue built "as of
> today" for an October practice offers **no coaches at all** and no playing
> units — silently, with an empty tab that looks like a club without coaching
> staff.
>
> The question an audience builder is actually asking is "who holds this seat
> when the event happens", so the effective-date test runs against the event's
> scheduled date. A draft with no date yet falls back to today, which is the only
> honest answer available and costs nothing: invariant E1a already refuses to
> approve a dateless event, so no audience resolved that way can be written.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/event-audience.ts — module header

> ## The one rule this module exists to serve, as D47 narrowed it
>
> `docs/adr/0012-explicit-event-audience.md` and Brian's 12 August
> clarification said selection begins empty and nothing is ever implied. **D47
> reverses half of that, deliberately and narrowly**, and LAN-154 is where the
> reversal lands: a type's template supplies a default audience, which arrives
> with a new event already set, visible and editable, so the approver checks
> rather than builds the same thirty-two names every Wednesday.
>
> What survives unchanged is the part ADR 0012 was actually about. There is
> still no whole-roster fallback and no "if none selected then everyone"
> anywhere here or in anything that calls it: an audience that nobody put there
> is still empty, and approval still refuses it. What the club configured once,
> on purpose, on the template, is not the system implying anything.
>
> The stored audience is still an explicit resolved list. A group is a way of
> selecting people, never a live query that changes underneath an approved
> event — which is why `createEventDraft` resolves the template's groups to
> people at the moment the draft is created.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/event-audience.ts — module header

> ## …and why that date is the event's, not today's
>
> The obvious implementation asks who holds a seat _now_, and it is wrong in the
> ordinary case. The club plans a season before it starts: in the seeded club on
> 13 August 2026 the 2026-27 coaches are appointed from 1 September and players
> have no position assignments until 27 September, so a catalogue built "as of
> today" for an October practice offers **no coaches at all** and no playing
> units — silently, with an empty tab that looks like a club without coaching
> staff.
>
> The question an audience builder is actually asking is "who holds this seat
> when the event happens", so the effective-date test runs against the event's
> scheduled date. A draft with no date yet falls back to today, which is the only
> honest answer available and costs nothing: invariant E1a already refuses to
> approve a dateless event, so no audience resolved that way can be written.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/event-audience.ts — RECRUIT_ARM

> D46, at the level approval actually invites from — LAN-295.
>
> Recruits are read from the funnel rather than from the roster, because that is
> where a prospect lives: modelling them as provisional memberships would
> pollute the roster with people who never commit (model §1.2).
>
> Joined is excluded because a joined prospect IS a member and appears under the
> player capacity; disengaged, declined and void are excluded because D45 says
> inactive people are never invited, somebody who said no is exactly that, and a
> void row is not a person to invite at all (LAN-201).

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/event-audience.ts — listAudienceCatalogueIn

> ## `eventType` is required, and it is what keeps recruits off a practice
>
> D46 puts recruits on a Recruitment event alone, and Brian restated it on
> 2026-09-10: "Recruits should only ever be selectable and only ever be
> available for a recruitment event. Every other event, they're non-factors."
> Before LAN-295 that rule lived only in `AUDIENCE_GROUPS` — the _Recruits
> button_ was withheld, while the recruits themselves stayed in the catalogue as
> individually tickable rows that `resolveSelection` would happily resolve and
> approval would happily invite.
>
> So the gate is here, in the read every one of those paths shares, and it is a
> required parameter rather than an optional filter: a caller that forgets it
> does not compile. On a non-Recruitment event a recruit is not merely hidden —
> they are not in the catalogue, so their key resolves to nothing and
> `saveEventAudience` refuses the selection outright.
>
> The class is the event's own `events.event_type`, never a template's name.
> After LAN-265 an operator names templates freely and every template they
> create is `practice` class, so a name is not something a rule can key on.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.
