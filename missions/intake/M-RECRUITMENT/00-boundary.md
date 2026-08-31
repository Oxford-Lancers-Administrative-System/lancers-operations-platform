# Boundary — M-RECRUITMENT

- Portfolio mission number: 6
- Commissioned outcome: "**6 · Recruitment** _(v2 layer, 2026-08-26)_ — the recruit
  journey layered onto Mission 5's surfaces: four entry doors with
  dedup-before-create and the operator-review queue; the recruits list beside the
  roster; funnel identified → engaged → committed/converted with lapsed/declined
  exits; **the one-time notify** (a recruit gets exactly one message, ever — owner
  decision 2026-08-25: recruits are never chased); recruit-door WhatsApp opt-in
  evidence; recruitment events with the derived Recruits audience, person-scoped
  invitations and the recruits-on-top attendance sheet; the flip by
  President/VP/Secretary/GM. Builds the shared **signed-link → form substrate**
  with the recruit-stage field set (enumerated at intake); Missions 7/8 extend it"
  — quoted from the portfolio row.
- Portfolio row URL and observed version:
  [Lancers Current Project Status](https://app.notion.com/p/3bb488886d578126a88cdd747f590a01),
  Release One Mission Portfolio **v2**, restructure approved by Brian Schuster
  2026-08-26; page fetched 2026-08-28T14:48Z. Authority state: **Owner-approved
  direction**.
- Observed `main` SHA: `c69d544d92e5e246ee763008c1db492e8c7c7c60`
- Primary coverage: Task 09 (Recruitment & Squad Intake brief) — funnel side ·
  R2 (recruitment side) · Scope 4 (funnel half) · the Task 04 welcome-flow
  residual slice.
- Deliberately shared coverage:
  - The signed-link → form substrate is built here with the recruit-stage field
    set and **extended** by Mission 7 (onboarding field set) and Mission 8
    (consent/correction); at most one open request per person, ever.
  - The recruit contact rule — **never harsh**, owner amendment 2026-08-31 —
    **constrains** Mission 4's shipped chase machinery; this mission ships the
    capacity suppression that keeps the player escalation ladder off a recruit,
    the recruit-appropriate nudge that replaces it, and the `countByCapacity`
    recruit-count fix.
  - Recruits render on Mission 5's People surface as prospect-persons; the
    recruits list, funnel and notes are this mission's.
  - Per-door opt-in **evidence** is captured here; consent wording, lawful basis
    and retention remain Mission 8's (Clint).
  - Recruitment events reuse Mission 2's shipped event machinery, its `recruits`
    derived audience group and its attendance board — the recruitment side of
    each is this mission's.

## Subject ownership — the governing reading of this boundary

Brian's boundary direction, 2026-08-28, in his words:

> "The big thing I want you to know is that you own recruitment as a subject, as
> in anything related to recruitment. Anything that does this and touches this is
> yours. This means we need to be thinking about not just what goes into
> recruitment, but also the administration of this, the scheduling, the other
> tools that this may touch, and everything that this looks like. I want to make
> sure that when we go through all the workflows, we've covered everything that
> has to do with recruitment. You own the subject, not merely the workflows that
> are mentioned."

This is portfolio rule 1 applied — "a mission is a subject-matter lifecycle: it
owns one subject and handles everything related to that subject's lifecycle" —
and it is not a portfolio amendment. It governs how the in-scope list below is
built: the portfolio row's bullets are the **named minimum**, not the boundary.
The boundary is the recruitment subject, end to end, including the
administration of recruitment, the scheduling of recruitment, the recruitment
side of every tool recruitment touches, and what all of it looks like. Anything
in the inventory below that turns out to belong elsewhere is dispositioned
explicitly at Stage 2 with evidence; nothing drops out silently.

### Owner subject notes — 2026-08-28 (recorded verbatim, dump in progress)

Brian, restating the subject in his own words:

> "This is about the whole process in which recruits get added into the system.
>
> Sometimes we find recruits that we want to add in: people that we like, that we
> contact, and that we go in. Some people are added to the system proactively,
> where we get their names and say, 'Hey, you want to join? Pop their
> information.' They get a message sent out so there's a WhatsApp connection
> where they get added to the WhatsApp group, and then there's a QR code they can
> scan. There are multiple ways to get them into the group to see if they're
> there and whether or not they've been contacted.
>
> We want to get as many signals as we can on the recruit as possible. I'm not
> sure how many we can get, but there are signals to tell us how well they're
> doing. Recruits are going to be handled as a separate thing outside of
> onboarding, because onboarding is almost like they're a player. Recruits need
> their own thing where it's like, 'I see a recruitment board, a page, and I see
> information.' I see it being very onboarding-like, where it has its own page
> with recruits and people there, and some information there.
>
> I really think one of the things I want to get there should be notes that
> people take. I see a recruit, I see information, and I write notes there and
> stuff. I want to think through some of the details there."

And on Mission 5:

> "That 5 is still being built, so we're going to have to layer on top of
> anything that they build there. This is going to be a whole section that we
> need to have in."

This dump is **in progress**; the inventory below stays open until Brian says the
subject is down.

## In scope — the recruitment subject inventory

The row's named bullets are marked `[row]`; the items the subject-ownership
reading adds are marked `[subject]` so it is visible exactly what is being
approved beyond the row.

### A. Getting a recruit into the system

1. `[row]` The four entry doors of Task 09 §1.1 — QR/link self-entry, walk-up
   capture, operator manual add, WhatsApp community join — each capturing
   name + mobile with email optional.
2. `[row]` **Dedup-before-create at every door** (D7), with the operator-review
   queue for self-serve matches, no silent create and no silent merge.
3. `[subject]` **Administration of the capture doors themselves**: who mints and
   holds the QR/link, whether it is standing or per-recruitment-moment, how it
   expires or is revoked, where an unrecognised or dead link lands, and which
   roles may capture at each door.
4. `[subject]` The **walk-up door's** recruitment behaviour on `main` — it
   already mints a person and a `recruit`-capacity prospect with no interactive
   duplicate check. Reconciling that drift is this mission's, including what a
   coach at the touchline is and is not asked.

### B. The recruit's life in the pipeline

5. `[row]` The recruits list beside the roster: a visible, operator-only
   pipeline surface with notes as prose (D4, D9).
6. `[subject]` What that surface has to **do** as a working tool — find a
   recruit, filter and sort the pipeline, read one recruit's whole recruitment
   history in one place, and act on them from there.
7. `[row]` The funnel stages `identified → engaged → committed/converted` with
   `lapsed` and `declined` exits: triggers, actors, derived-versus-manual
   transitions, and the reversal rule (D4, D6).
8. `[subject]` **How `engaged` is actually derived** — the brief says "any
   recorded interaction: RSVP, event attendance, reply to the welcome message";
   what counts, what is observable on `main`, and what an operator may override.
9. `[subject]` **How `lapsed` is reached** — the brief has an operator mark it,
   with no automatic timeout ever. Whether anything surfaces the candidates, and
   where.
10. `[subject]` **Recruitment ownership and authority in the product**: the
    President as the named day-to-day pipeline owner (D9), who may capture, who
    may edit, who may flip, and what a coach or ordinary operator sees of the
    pipeline at all (D9's operator-only visibility rule).

### C. Talking to a recruit — never being harsh with one

**Owner amendment, 2026-08-28.** Brian: _"No, no one message ever. That's not the
rule. What we should do is that we're going to invite them to an event, and
they're a recruit. They should only get one message, right? One invite. They
don't get a chase."_ The rule is **recruits are never chased** — which is what
the 2026-08-25 owner decision and the portfolio row's own parenthetical say. The
gloss "a recruit gets exactly one message, ever", carried in the portfolio row
and in Task 09's amendment 2, is superseded as too tight: it forbids the
outreach, the form ask and the per-event invitations Brian describes below. A
recruit may receive the welcome, the recruit-stage ask, one invitation per event,
and any message a human chooses to send them. A recruit never receives a
reminder, an escalation, or a collection cadence.

**Owner amendment, 2026-08-31 — the rule is never harsh, not never chased.**
Brian: _"The rule for recruits is never 'chased.' It's getting the wrong signal…
We chase players; recruits sit in some other place. Let me put it this way: it
should never be harsh. That's the better rule… We should send polite reminders,
nudges, things like that. The app should be very open to allowing the person…
to send polite messages, follow-ups, things like that, and the messages should be
good. It should be easy… these are sales. This is sales prospecting. You don't
tell a client, you don't tell a potential person who's going to give you money
that they need to show up at a particular place and time. No, we need them to
like our team."_ This supersedes the 2026-08-28 amendment above wherever they
disagree. A recruit **may** be reminded, nudged and followed up with, politely
and as often as courtship warrants; what a recruit never receives is the player
escalation ladder, a collection cadence, or a message that tells them they are
required to be somewhere. Sending a good follow-up easily is a capability this
mission owns, not something that happens outside the system.

11. `[row]` **The welcome and community-group invite** at capture (D3), the
    per-event invitation, and the **polite reminders, nudges and operator
    follow-ups** the 2026-08-31 amendment allows. The operative form of the
    never-harsh rule is that the player escalation ladder never reaches a
    recruit and no recruit message carries obligation — not that the count of
    messages is capped.
12. `[row]` Per-door WhatsApp **opt-in evidence** recorded at capture, and the
    rule that the welcome never fires from a door without it (Task 09 §9.1).
13. `[subject]` **Administration of the recruit messages**: their templates and
    content, the community-group link one carries and how that link is rotated
    when it changes, what an operator sees when one fails to deliver, and what
    happens when delivery is down at the moment of capture (Task 09 §9.1's open
    welcome-flow mechanics, inherited from the walk-ups brief).
14. `[row]` The correction to Mission 4's shipped ladder: **capacity suppression**
    so the player reminder-and-escalation rung never reaches a recruit
    invitation, and the `countByCapacity` recruit-count fix (owner decision
    2026-08-26). The 2026-08-31 amendment narrows this to the _player_ ladder: a
    recruit-appropriate polite reminder is permitted and is this mission's to
    design, so the suppression must not be written as "recruits get no follow-up
    message".
15. `[subject]` The **whole-system sweep** that rule implies: every place a
    recruit could meet the player escalation ladder, be counted into a chase, or
    be swept into a collection cadence — each one either suppressed or evidenced
    as already unreachable. Never harsh is a system property, not a feature.
    Invitations, polite reminders, nudges and operator follow-ups are explicitly
    not harshness; the sweep looks for obligation and escalation, not for volume.

### D. The recruit-stage ask

16. `[row]` The shared **signed-link → form substrate** with the recruit-stage
    field set — football background, experience, gear ownership, referenced by
    Task 08 §4 and never enumerated; **enumerated at this intake** — riding the
    one-time welcome or the capture door itself, never followed up.
17. `[subject]` What the recruit sees and can do on that link: the form, the
    already-submitted case, the expired/revoked case, and the uniform
    no-information-leakage page the E1 precedent requires.
18. `[subject]` The substrate's shape as a **substrate** — the one-open-request
    rule, and the seam that lets Missions 7 and 8 add their field sets without
    re-minting a second token system on top of Mission 4's shipped
    person-token machinery.

### E. Recruitment events

19. `[row]` Recruitment events: the derived Recruits audience, person-scoped
    invitations and RSVP for recruits, and the recruits-on-top attendance sheet
    (D11), with turnout as the sum of attendance records (D8).
20. `[subject]` **Scheduling and running a recruitment event end to end** — a
    Freshers' Fair, a taster — as the recruitment operator experiences it:
    creating it, its type rules (the owner-locked 2-day RSVP deadline), choosing
    the Recruits audience, approving it knowing what it will send given rule 11,
    and working its attendance sheet on the day.
21. `[subject]` The **recruitment side of the calendar and its access tiers**:
    whether and how a recruitment event appears publicly, since the public
    calendar is exactly where a prospective recruit would look.
22. `[subject]` What a **recruit sees of an event** — the invitation, the RSVP
    surface, and whether the club-link participation view is appropriate for
    someone who is not a member.

### F. Leaving the pipeline

23. `[row]` **The flip** — President, Vice President, Secretary or GM declares a
    recruit committed; one audited action marks the prospect converted, creates
    the season membership, puts the person on the roster and opens onboarding.
    On the team ≠ active (D5).
24. `[subject]` **Where the flip is performed from**, given it normally happens
    out of the Monday review, and what leadership sees of the pipeline when they
    make that call.
25. `[subject]` The `declined` and `lapsed` ends of the subject: what the record
    keeps, what it stops doing, and — as a seam, not a policy — where Mission 8's
    retention rule attaches.
26. `[subject]` **The recruit at a season boundary.** `recruitment_prospects` is
    season-scoped on `main`. What happens to an unconverted recruit when a season
    ends is a recruitment-lifecycle fact; the season _mechanism_ is Mission 11's.

### G. Recruitment as data the club reads

27. `[subject]` **Leadership visibility of the pipeline** — the recruitment
    content of the Monday review and any pipeline counts. Mission 10 owns the
    report; the recruitment section's definition is this mission's.
28. `[subject]` How a **prospect-person renders on Mission 5's People surface**,
    which Mission 5 deliberately excluded ("nothing about the recruit process
    renders on a person record"). The recruitment side of that seam is settled
    here.
29. `[subject]` **Audit and history for recruitment** — every stage change, flip,
    reversal, duplicate resolution and opt-in evidence record, on the durable
    audit substrate that already exists.

### H. Added by the owner's 2026-08-28 subject notes

30. `[owner]` **Proactive sourcing as a first-class path.** The club finds
    someone it wants, reaches out, and enters them — "people that we like, that
    we contact, and that we go in". The row's "operator manual add" door
    understates this: sourcing, outreach and entry are one recruitment act, and
    the board has to show **whether a recruit has been contacted**.
31. `[owner]` **The WhatsApp group connection as a tracked outcome.** The recruit
    gets a message, gets added to the community group, and the QR is another way
    in — "multiple ways to get them into the group to see if they're there".
    What the system can honestly observe about group presence is an open
    feasibility question (see the questions below), not an assumption.
32. `[owner]` **Signals.** "We want to get as many signals as we can on the
    recruit as possible… there are signals to tell us how well they're doing."
    The inventory of every signal recruitment can honestly observe — message
    delivered, link opened, form submitted, RSVP, attendance, reply, contacted
    by an operator — with its date and its source, rendered so a human can read
    how a recruit is doing. Constrained by Task 09 §6: commitment signals are
    deliberately **never scored fields**.
33. `[owner]` **The recruitment board.** Not a list beside the roster but its own
    page — "a recruitment board, a page, and I see information" — deliberately
    onboarding-like in shape, holding the recruits, their signals and their
    notes. This supersedes the plainer reading of row item 5; the board is the
    mission's primary surface.
34. `[owner]` **Notes people take.** First-class on the board: an operator opens
    a recruit, reads what is known, and writes notes. Attribution, dating,
    editing and who may read them are details Brian has flagged for thinking
    through.
35. `[owner]` **Layering onto Mission 5's in-flight surfaces as its own section.**
    Mission 5 is being built now; this mission layers onto whatever it lands.
    The layering itself is scope — a named section of the mission, not an
    assumption that the base will fit.

### I. Added by the owner's second 2026-08-28 dump

> "Recruitment is going to be rather loosey-goosey. What I'd rather have is to
> start with a bunch of data, and we can almost copy how normal event attendance
> works, except for recruitment. I want to see them as one line. What we have as
> the recruitment table, I want to see it for the recruits themselves, except
> it's a recruitment stuff thing, like a bunch of signals.
>
> If we have a recruitment event that we invited a bunch of people to, and we
> invite recruits to that event, it shows who was invited and who showed up. Did
> they show up? We'll take attendance of those things just like we do at the
> normal events. If a recruit shows up and there's a recruit at the event, I want
> to know that they're there. You want everyone to see, 'Oh, this is a hot
> recruit. This is someone who's there,' and I want to see notes and stuff like
> that.
>
> What I think is that we should just grab whatever signals we can. If we maybe do
> a research sprint where we know what signals they have versus not, that might be
> helpful. But for now, let's just err on the side of 'we can't know that
> information,' but we can know if they accepted the WhatsApp. Accepting the
> WhatsApp invitation is a good first step, and if they filled out the
> information, that's a good signal. That's like, 'Hey, they're going through the
> process. That's good.'
>
> The president should see them and say, 'Hey, how are you doing?' and send them
> out to do stuff and see that. Proactive outreach is fine, and they get signed
> up. We may know that after a day, they get their proactive outreach for that,
> right? It's like, 'Hey, welcome to Lancers. We'd love to know some more about
> you. Consider taking 5 minutes to fill out this form,' right? It's basically a
> form that asks for details about them."

36. `[owner]` **The board's shape is the attendance table, for recruits.** One
    line per recruit, columns of signals — "almost copy how normal event
    attendance works, except for recruitment… I want to see them as one line".
    The shipped participation and attendance tables are the working model, so
    the surface is recognisable rather than invented. This refines item 33.
37. `[owner]` **Recruitment-event attendance is a first-class signal.** Invited
    versus showed up, taken exactly as attendance is taken at any event, visible
    on the event's own sheet and flowing back onto the board — "if a recruit
    shows up… I want to know that they're there". The reading a human then makes
    of it — "this is a hot recruit" — comes from the signals and the notes
    together, never from a computed field.
38. `[owner]` **A signal research sprint**, owner-suggested: establish what the
    platform can honestly observe about a recruit versus what it cannot, before
    the signal set is fixed. Its output is an intake input, not build scope.
39. `[owner]` **Conservative observability default.** Where it is not established
    that a signal can be read, the mission assumes it cannot. Two are recorded as
    good today: the recruit **accepted the WhatsApp**, and the recruit **filled
    out the form** — "they're going through the process".
40. `[owner]` **Operator-initiated outreach is permitted and recorded.** The
    President opening a recruit and asking how they are doing is an ordinary
    human act; the system records it as a signal and never treats it as a chase.
41. `[owner]` **A delayed recruit-stage ask** — roughly a day after capture,
    "Welcome to Lancers. We'd love to know some more about you. Consider taking
    5 minutes to fill out this form." Owner-proposed and not yet locked: the
    timing, and whether the ask is a second message or rides the welcome, are
    open for Brian's decision.
42. `[owner]` **"Loosey-goosey" is a design constraint, not an apology.**
    Recruitment is not a rigid funnel, and the product must not enforce one:
    stages are readable and adjustable by a human, signals accumulate without
    gating anything, and nothing about a recruit is blocked for want of data.
43. `[owner]` **Where the recruit messaging machinery lives, and how the
    recruitment cycle is administered.** Brian: _"One of the things we need to
    figure out here is how that message gets sent out, where that machinery
    lives, and how the administration of the recruitment cycle gets handled on
    the flexibility. I'm not sure where."_ Two halves, both this mission's to
    settle: what fires the welcome, the ask and the invitations, and on what
    trigger; and what an operator may change about a recruitment cycle — its
    timing, its content, whether a step runs at all, and whether a Freshers'
    push and a mid-season push are the same machine configured differently.
    Mission 4 owns the transport and the scheduler; recruitment owns what it
    sends, when, and who may change it.

### J. Added by the owner's 2026-08-31 amendment

44. `[owner]` **The operator's follow-up surface.** Composing and sending a
    polite message, reminder or nudge to a recruit from inside the application,
    quickly and with good default wording, from wherever the operator already
    is: the board, the recruit's own page, or an event. Brian: _"The app should
    be very open to allowing the person… to send polite messages, follow-ups,
    things like that, and the messages should be good. It should be easy,
    right?"_ What it looks like is designed at Stage 3; that it exists is
    settled. This is the item the never-harsh rule adds, and it takes the
    inventory from 43 items to **44**.

## Out of scope

- **Mission 7 · Onboarding:** the LAN-85 intake-at-scale composition (Task 09
  §2, D1) in every part — carry-forward seeding, returner-verification links,
  the §2.1 verification-link states, the D10 non-responder rule, CSV import and
  carry-forward, E.164 normalization as an intake step. Moved by the owner
  amendment of 2026-08-25/26. Also the onboarding checklist, activation, nudges
  and the bounded chase, the collection request, and formalwear's seasonal
  reask. Everything after the flip is Mission 7's.
- **Mission 5 · People & Roster:** the person record and its field inventory,
  the People and Roster surfaces themselves, correction, audited merge,
  add-or-link without membership, the missing-data queue's definition, the
  season bootstrap. This mission layers onto them and invents none of them.
- **Mission 8 · Consent, Privacy & Data Rights:** consent policy, wording,
  versioning and lawful basis; prospect/lapsed/declined retention rules;
  correction workflow; subject-access export; erasure and destructive removal.
  Recruitment records the evidence; Mission 8 says what it must mean.
- **Mission 4:** the transport, scheduler, template inventory and delivery
  states themselves. This mission constrains and corrects them for recruits; it
  does not rebuild them.
- **Mission 10:** the Monday review report and export machinery. Recruitment
  defines its recruitment content only.
- **Mission 11:** season lifecycle, creation, rollover, eligibility,
  offboarding — the mechanism behind item 26.
- **Mission 9:** football assignments, positions, squad groups, coach registry.
- **Mission 2:** the event, calendar, template and attendance machinery itself.
  Recruitment owns its recruitment behaviour, not the machinery.
- **Mission 1:** club roles, login grants and the role catalogue behind item 10.
- Legacy import of historical rosters, bulk spreadsheet import, statistics,
  public player profiles, and everything else on the Authority Manifest §8
  exclusion list.
- Real recruit data and real sends: LAN-86 (cutover) and LAN-101 (WhatsApp
  production) remain gates outside this mission.
- No Mission Lead DAG, work packages, worker assignment or implementation
  sequencing in this packet, and no execution before Brian merges a ready packet
  version.

## Reconciliation against `main@c69d544` (recorded, not silent)

The Task 09 brief was written 2026-08-15, before Missions 2 and 4 shipped. Four
of its named gaps are already closed, and one of its statements is drift:

- **The "Recruits" audience group exists.** Mission 2 shipped it (D46) —
  `src/lib/services/event-audience.ts:214` derives it from
  `recruitment_prospects` at `identified/engaged/committed`, and
  `src/lib/services/audience-selection.ts:136` offers it on Recruitment events
  alone. Task 09 §9.1 lists it as an unowned gap; it is not.
- **Person-scoped invitations at `recruit` capacity exist**
  (`invitation_capacity` includes `recruit`).
- **The signed-link person-token substrate exists.** Mission 4 shipped
  `player-answer-tokens`, `/a/[token]` and `/me/[token]`. This mission builds
  the **form/ask** layer on that machinery rather than minting a second token
  system; "built once in Mission 6" reads as the form substrate, not the tokens.
- **The walk-up door already ships, and its dedup drift is real.**
  `recordWalkUpAttendance` (`src/lib/services/attendance.ts:699`) always creates
  a new person and a `recruit`-capacity prospect with no interactive duplicate
  check — wider than Task 09 §3's LAN-110 coach-only exception. Recorded as
  drift by the 2026-08-26 owner amendment and reconciled at this intake.
- **The capacity-blind ladder is confirmed.** `scheduleEventLadderIn`
  (`src/lib/services/messaging-scheduler.ts:156`) inserts a reminder job for
  every invitation of the event with no capacity filter, and `countByCapacity`
  (`src/lib/services/event-approval.ts:757`) counts player, coach and committee
  only. Both are this mission's to fix.
- **No recruit surface exists.** There is no recruits list, no prospect capture
  route and no flip action anywhere in `src/app`; the only path that creates a
  prospect today is the walk-up form.

## Sequencing fact recorded at commissioning

The portfolio's next step for this row is "Intake after Mission 5", and the
default dependency order is M5 → M6. Mission 5's packet is **approved and merged**
(PR #96, `M-PEOPLE-AND-ROSTER` v1), which satisfies that gate for _intake_, but
its implementation has not started — LAN-182–187 are staged in Backlog and none
of Mission 5's surfaces exist on `main`. Two consequences, recorded rather than
assumed:

1. Mockups for screens that layer onto Mission 5 surfaces will be **drawn on
   both sides**, because those surfaces do not exist on `main` to photograph.
2. Mission 6 **execution** still depends on Mission 5's implementation landing;
   that is a packet gate, not an intake blocker.

- Split decision: no split. The recruit journey is one actor-visible outcome
  with one authority (Task 09), one owner (the President), and one acceptance —
  Brian walks a recruit from a door to the roster. The subject-ownership reading
  widens what the mission must cover; it does not create a second independently
  approvable outcome, and nothing here poses a safety, authority, readiness,
  dependency or outcome-coherence problem the Mission Lead's DAG cannot contain.
- Portfolio deviation: none. The boundary is the portfolio row's, read under
  portfolio rule 1 as the recruitment subject-matter lifecycle per Brian's
  2026-08-28 direction, with the `main` reconciliations above recorded as facts
  about implemented reality rather than as scope changes.
- Brian approval words: "You're approved"
- Approval date: 2026-08-28
