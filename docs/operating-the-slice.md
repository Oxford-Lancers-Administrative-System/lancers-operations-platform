# Operating the slice

The complete first operational workflow, as a walk somebody who did not build it
can perform by hand: enter a returning player, put a practice on the calendar,
confirm who it goes to, approve it, let the automation invite them, collect the
answers, watch the register open by itself, take it as a coach, and read the
Monday report.

This is the manual counterpart to `tests/slice-walkthrough.test.ts`, which walks
the same path through the service layer in one automated run. The test proves the
hand-offs; this proves a person can follow them. Both are the slice's acceptance.

It is also the script for the first hosted demonstration, and the basis of later
training material — so it is written for a reader who knows the club and not the
code.

**Contents**

1. [Before you start](#1-before-you-start)
2. [Start the environment](#2-start-the-environment)
3. [Sign in](#3-sign-in)
4. [Enter a returning player, and activate them](#4-enter-a-returning-player-and-activate-them)
5. [Put the practice on the calendar](#5-put-the-practice-on-the-calendar)
6. [Confirm the audience and approve](#6-confirm-the-audience-and-approve)
7. [Automated WhatsApp delivery](#7-automated-whatsapp-delivery)
8. [Answer as a player](#8-answer-as-a-player)
9. [Watch the register open by itself](#9-watch-the-register-open-by-itself)
10. [Take the register as a coach](#10-take-the-register-as-a-coach)
11. [Read the Monday report](#11-read-the-monday-report)
12. [Check the three calendar presentations](#12-check-the-three-calendar-presentations)
13. [What this walk deliberately does not cover](#13-what-this-walk-deliberately-does-not-cover)
14. [Known limitations](#14-known-limitations)
15. [Brian's checkpoints](#15-brians-checkpoints)

---

## 1. Before you start

**Where this runs.** Against the **local** Supabase stack and the local
application only. Nothing in §§ 2–12 is performed against the hosted project;
§ 15 lists every action that is Brian's, and no step below asks a reader to take
one.

> ### If you are walking this against hosted, read this first
>
> § 15 checkpoint 6 sends Brian through the same walk against the **one
> production database**, and there the names below are not free text. Every row
> the application creates during a hosted walk must carry its scenario's
> `PILOT-` sentinel, because that sentinel is the **only** handle the cleanup
> scripts have on a row a script did not write:
> `scripts/pilot/lan-74/cleanup.sql` finds application-created people by
> `PILOT-LAN-74` in the surname or known-as, and `scripts/pilot/lan-76/cleanup.sql`
> finds application-created events by `PILOT-LAN-76` in the name.
>
> So on hosted, and only on hosted:
>
> | Step | Type this instead                        |
> | ---- | ---------------------------------------- |
> | § 4  | Last name **`PILOT-LAN-74`**             |
> | § 5  | Event name **`PILOT-LAN-76 slice walk`** |
> | § 10 | Walk-up last name **`PILOT-LAN-74`**     |
>
> A row created without one cannot be removed by any script in this repository,
> and `scripts/pilot/lan-82/verify-clean.sql` will report the database clean
> while it survives — the sweep looks for sentinels, and an unmarked row has
> none. That is not a gap in the sweep; it is what the ownership rule in
> [`pilot-data-runbook.md`](pilot-data-runbook.md) exists to prevent.
>
> **And read [`../scripts/pilot/lan-82/README.md`](../scripts/pilot/lan-82/README.md)
> § "What the hosted walk cannot clean up" before you start**, because one step
> of this walk creates something no cleanup can remove whatever you name it.

You need Node 20.9 or later (22 recommended), npm 10+, a running
Docker-compatible runtime, and this repository checked out. Nothing else — no
Meta account, no credential, no cloud access.

**Time.** About twenty minutes end to end once the stack is up. The stack itself
takes a few minutes on a cold start.

---

## 2. Start the environment

Run each line from the repository root, one at a time, and read the output.

```bash
npm ci
```

```bash
npm run db:acquire -- LAN-82
```

```bash
npm run db:start
```

`db:start` does everything: it starts the containers, applies every migration,
loads the deterministic synthetic dataset, creates the local review login, links
it to a Person, and links a second login for the coach surface. Watch it print
the dataset summary — 52 people, 110 events, 4,892 invitations — and then the two
`Linked …` lines.

If you want a completely fresh database at any point:

```bash
npm run db:reset
```

Then start the application:

```bash
npm run dev:slot
```

It prints the address. On the primary slot that is <http://localhost:3000>.

> **The RSVP step needs one more thing.** Automated delivery talks to Meta's
> Graph API, and a local machine has no Meta credentials — so out of the box the
> invitation is queued and honestly reports that it was never sent. § 7 sets up a
> loopback stand-in so the whole path runs locally. Do that before § 6 if you
> want to see the RSVP page.

---

## 3. Sign in

Open <http://localhost:3000/login>.

Sign in with the local review account. Its address is
`brian.daniel.schuster@gmail.com`; its password is machine-local state that
`db:start` provisions, and is never written down here or anywhere else in this
repository.

**Expected.** You land on **/operate/roster** — the season's squad as a
twenty-column board (LAN-186). Who reaches it is a seat's access grants since
LAN-429: on a freshly seeded database the President, Vice-President, Secretary,
General Manager and IT Officer hold every roster and recruiting line at Edit
and every template at Manage, and every other seat holds None. The left sidebar
lists only what the signed-in account's seats reach — it is drawn from the same
grants and capabilities every page gates on (see "Who sees what" below), so it
never offers a page that then refuses. Bottom left it says who you are signed
in as and "Authorized operator".

**Emailed links wait for a press (LAN-441).** An invitation or password-reset
email's link opens a page with one button — **Set up your account** or **Reset
your password** — and spends nothing on opening, so an email security scanner
that pre-opens links leaves it usable. The press exchanges the one-time token
and lands on **Choose a new password**. An expired, spent, wrong-type or
malformed invitation lands on **This invitation link cannot be used**; a reset
link in the same state on **This reset link cannot be used**. Nothing in the
address says why.

**Who sees what (LAN-429, LAN-430).** Access is edited on a seat's page
(Administration → Roles → a seat) by the President, General Manager and IT
Officer, whose own access is fixed. The page's **Access** section, under
Current holder, lists four groups — Roster, Recruiting, Event templates and
Adding people — one line each: None / View / Edit on eleven roster categories
and on Person information and Recruit details, None / View on Attendance (the
Roster group's last line) and on Event details,
None / View / Manage on each event template, and No / Yes on "May add to the
roster" and "May add recruits". A press saves at once; the Notice reads the
change back and the seat's **History** gains an "Access changed" entry. **Copy
access from another seat** (choose the seat, read every line that would
change, confirm) and **Grant everything** each write one History entry listing
every changed line. On the three fixed seats every line prints its value with
no control. At 375px each group folds to its summary. A template added later
arrives at Manage for the fixed seats and None for every other. An operator
holding several seats holds the highest level any of them grants, from their
next request. The ten roster group colours are edited from **Edit categories**,
beside Add players on the roster, by the same three seats; the board, the
player and prospect records and the recruitment board draw from them. The
sidebar follows: Roster, People and Missing data with any roster category at
View; Recruitment with any recruiting category at View; Events with any template
at View or an attendance capability; Follow-ups with any template at View; the
Messaging schedule with any template at Manage. Report appears only for the
seats that hold the report (the core four and the IT Officer), never as a grant
line; the rest of Administration is unchanged. Events of a template at None appear nowhere — not
on the list, the calendar, Follow-ups or by typed URL; View shows everything in
the event, including the Event info link; Manage adds every create, edit,
delete, send, approve, delivery and chase control and that template's messaging
schedule (LAN-431). Attendance recording is unchanged for every seat: the
Attendance line governs only the player record's Attendance section, and the
roster board has no attendance columns.

**A seat holder is always an operator (LAN-434, Brian 2026-09-26).** On a
seat's page (Administration → Roles → a seat, which a person record's **Assign a
role** also opens), **Assign role** and **Replace role** say which account case
applies once a person is chosen, before the submit. **Operator account: Created
with this role** with **Invitation to** the person's recorded email, or a
required **Login email** field when they have none — the application never
invents an address. An existing account reads its state (Active, Invitation
pending, Deactivated) with **Unchanged**, or **Stays deactivated**; it is not
touched. The submit writes the assignment and the pending account together and
then sends the invitation, as **Invite operator** does; both are audited to the
seating operator, and a failed send leaves the seat and the account with
**Delivery failed** and a Resend on the operator's record. A holder seated
before this change reads **No operator account** on the Current holder line
with **Send invitation**, which opens the account and sends the invitation the
same way. Invite operator and the Operators page are unchanged.

**Working the roster and recruits within the grants (LAN-432).** The roster
board, a player's record, People, a person's record and Missing data open for
any seat that reaches Roster; the recruitment board and a prospect's record for
any seat that reaches Recruitment. On the board a group at None has no columns,
no filters and no card chips; at View its values are text and its column
caption reads "view"; at Edit it is as before. With None on Person a row is the
name alone. With None on Contact & emergency the Contactable indicator carries
no number and the 375 card has no Call. On a record every section stays in its
place: a section at None is its head with a lock, cannot be opened, and nothing
of it is sent to the browser. The player record's sections read Person, Contact
& emergency (Mobile phone, Personal email, Emergency contact — its own section
after Person), Onboarding (and Onboarding activity), Membership, Availability, the five
assignment groups and Kit; Their other seasons and Status history read as
Membership; Attendance reads as its own Attendance line (None / View), which
governs only that section — recording attendance on an event is unchanged. On People and a person's record, Who
they are, Restricted, Where they stand, Messaging and What changed read as
Person, How to reach them (and the emergency contact) as Contact & emergency,
Their seasons as Membership; Correct this record needs Edit on Person or
Contact & emergency and edits only those; Add a person needs Edit on Person;
Merge needs every roster and recruiting line at its maximum. On a prospect's
record Personal questionnaire, How to reach them, Who they are, Restricted,
Where they stand and Their seasons read as Person information; Recruitment,
Notes, What changed and Status history as Recruit details; Recruitment events
as Event details. The record header's status is text, not a pill. Every write
re-checks its own category at Edit on the server. **Add players** appears only
with "May add to the roster" (Bulk import also keeps `roster_bulk_import`);
**Add recruit** and **QR code** only with "May add recruits"; their pages and
actions refuse without it.

**The sign-up code page (LAN-428, Brian 2026-09-26).** Recruitment → **QR
code** opens with three numbers for the live code: **Visits** (times
`/join/<code>` was served for it; page loads, link previews included),
**Partial** (records the partial save created through it since it was minted,
completed or not) and **Completed** (finished sign-ups on it, less the club's
twelve test sign-ups; the stored count is unchanged). With no live code there
are no numbers. On the public form a partial record now starts only once first
name, last name and a confirmed mobile are all typed; everything after that is
as LAN-425 built it. A recruit who agreed to WhatsApp messages out loud is
recorded from their record's **Record consent** (LAN-371): the required **How
consent was given** note says it was verbal, and the consent row keeps who
recorded it and when, audited to that operator. It never grants anything on its
own.

The heading reads `Roster` and beneath it `Season 2026-27 · 42 players · 20
columns`.

---

## 4. Enter a returning player, and activate them

1. Press **Add player**.
2. Enter a first name, a last name and a phone number. Use something you will
   recognise — `Runbook Walker`, `07700 900901` — and leave the email blank.
3. Press **Check for matches**.

**Expected.** A screen headed **Review possible matches**, reading "No existing
person matches the supplied names or contact details", and a note that "The
operator must make an explicit choice. The system never silently merges or
silently creates a person."

4. Press **Confirm this is a new person**.

**Expected.** **Returning player added** — "Person and 2026-27 membership were
created together." The three summary figures read `Onboarding`, `0 of 7`
onboarding items resolved, and `Returning`.

5. Scroll to **Membership status** and open the select.

**Expected.** A plain dropdown over all five statuses — Onboarding, Active,
Inactive, Departed, Archived — no dialog, no reason field, no confirmation.
LAN-186's owner walkthrough removed the activation-override dialog and every
other status-specific control: any status may become any other, outstanding
required onboarding items included, and nothing is asked about them.

6. Choose **Active**.

**Expected.** The status changes immediately — no second step. **Status
history** now shows two entries, each with a timestamp and your name:

```
Created as onboarding
Onboarding → Active
```

Two rows, not one: intake and activation are still two distinct events, but
neither carries a reason any more.

---

## 5. Put the practice on the calendar

1. **Events** → **Create event**.
2. Name it `Runbook Michaelmas practice`, leave Type as **Practice**, set the
   date to **14 October 2026**, start **19:00**, end **21:00**.

**Expected, as soon as the date is entered.** A derived line appears:

> **Wednesday, 14 October 2026** — Michaelmas 2026-27, Week 1

The Oxford term and week are computed from the date. There is no term field and
no week field to type; that is deliberate.

3. In **Venue**, type `University Parks`.

**Expected on a machine with no address provider configured.** The helper text
under the field reads "Address search is not set up here. Type the venue
yourself." Typing the venue by hand is the supported path and the draft saves
normally. With a provider configured the same field offers suggestions.

4. Leave **Optional** attendance as the Practice template set it, and leave the
   **Questions** section as it arrived.
5. Press **Save draft**.

**Expected.** The event detail page, headed `Draft · Wednesday, 14 October 2026 ·
19:00–21:00`, with the banner "A draft or pending event can carry no invitations,
responses or attendance. Nothing is sent until the designated approver approves
it." Audience reads **Not chosen yet** on a type whose template names no default
groups, and the resolved headcount on one that does (D47); Distribution reads
**Nothing distributed**. A **Questions** panel lists what this event asks beyond
"Are you coming?", and **Delete this draft** sits at the foot of the page.

**There is no Submit button, and that is correct.** Save creates a draft; a draft
goes to approval when the club wants the automation to go out. Only President,
Vice-President, Secretary and General Manager can manage or approve calendar
events, and any of the four may approve their own — the MVP has no separate
proposer.

---

## 6. Confirm the audience and approve

1. Press **Choose audience and approve**.

**Expected.** **Build event audience**. The sentence under the heading names the
template that supplied the default audience — "The Practice template invites all
active players. Check it, change it, or add people by hand" — or says "Choose who
this event is for" where the template names no groups (D47, reversing LAN-77's
"nothing is selected to begin with").

**The picker is checklist bands** (LAN-414, State of the App call and Brian's
visual review, 2026-09-22). Every category is a folding band in the roster
board's own band idiom, using exactly the board's band colours, and inside it
every group is a **tick-box row**. **General** and **Coaching assignments**
arrive open; the other three arrive folded, and a band that has groups ticked
in it says how many on its header.

The pills that were here until 2026-09-22 are gone. Brian, on the built
screen: "I think the pills don't make sense because when I click one pill
that's all active, everything lights up. I think it should be more: I click a
group, I see how many people there are and which groups I collect or not."

| Category             | What it offers                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| General              | Whole club, All roster players, All active coaches, All active committee, Onboarding, All Active BPS                                                                           |
| Coaching assignments | Three bands of its own, each folding separately: **Coaching groups**, **Offensive position groups** and **Defensive position groups**, one row per value of that roster column |
| Warmup assignments   | One row per warmup small group — Kings, Raider, Bear, Phoenix, Cavalier, Blue, Gold, Lancer                                                                                    |
| Special teams        | One row per squad — Kick Return, Kickoff, Punt, Punt Return, Field Goal, Field Goal Block                                                                                      |
| Recruits             | All active recruits, Identified, Engaged, Committed                                                                                                                            |

Every row carries the group's own head count in **people**, and at its right
either **Selected**, **Included**, or `adds N`:

- **Selected** — this row is ticked.
- **Included** — every person in this group is already reached by what is
  chosen, so ticking it would add nobody. An empty group never reads Included;
  it reads `adds 0`, because there is nobody in it to already have.
- `adds N` — ticking it would bring N people the selection has not reached.

**A tick box is ticked because somebody ticked it, and nothing else ever moves
it.** Tick Whole club and the narrower rows below it do not
tick themselves: they say **Included**. Overlap is only ever a number. Untick a
wide group and anyone a narrower ticked group still claims stays in. A sticky
line at the top of the picker reads `<n> groups · <m> people`, and the
resolved-people list below it is unchanged — an operator still sees exactly who
the selection reaches, by name, before saving.

A coaching or warmup row resolves to everyone whose current-season roster row
holds that value; a squad row resolves to everyone holding **any** slot in that
squad, starter or any backup (Stewart: "If you have an assignment in kick
return, you need to get a message… even if they're backup three"). The same
catalogue and the same picker are what the template editor offers for a default
audience; the approval review and the event's own audience panel name the chosen
groups under the same category and sub-category headings, in the same words.

**Recruits are offered on every event type** (LAN-416, Brian, Stewart and
Clint, 2026-09-22), amending D46/LAN-295's "a Recruits group appears on a
Recruitment event alone". Between the pure recruiting events and the first team
practices there is a run of mixed events a good recruit who is not yet Joined
had no way onto. Clint: "the type of an event pertains to what's actually going
to happen at the event, not who's invited." A recruit is reachable **only**
through the four Recruits rows — no General group and no assignment sub-group
ever includes one, so ticking Whole club on a Training event adds no
recruits at all. Declined, disengaged, voided and joined recruits are never
offered and never resolve; somebody who has Joined is a player and arrives
through the player groups.

**Whole club and All roster players include people mid-onboarding**
(LAN-415, Brian and Stewart, 2026-09-22). This reverses LAN-388's "Onboarding is
never folded into Active": Stewart, "when I hit all active players that should
include the onboarding player"; Brian, "Onboarding is an administrative status
internally… it's more of a marker to Clint." A rookie still finishing their
items is on the team, and an operator ticking either row means everyone.
**Onboarding stays as its own group**, because it is still the only way to reach
_only_ those people — an onboarding-only social, in Brian's example. All active
coaches and All active committee are unchanged: onboarding is a player fact, and
no coaching seat or committee seat carries one.

**The two labels are _Whole club_ and _All roster players_** (Brian's walk,
2026-09-23). LAN-415 first left them reading "Everyone active" and "All active
players" on the reasoning that the count beside each would make the inclusion
visible; his visual review of 2026-09-22 decided it would not and spelled the
rule out — "Everyone active and onboarding", "Active and onboarding players" —
and his walk the next day found that spelling it out cost more than it bought:
long enough to wrap in a band row, and "and onboarding" reads as an extra
cohort bolted on when the point is that these are the widest groups there are.
_Whole club_ is every membership carrying a player, coach or committee
capacity, active or mid-onboarding, and never a recruit; _All roster players_
is the player half of it. What each resolves to is unchanged, and the
resolved-people list below the picker is what names exactly who. The keys, the
storage and the resolution are untouched by any of the three rounds.

Nothing is backfilled. An event approved before this ships, whose audience is
either of those two groups, picks up its mid-onboarding people through
LAN-392's live rule on the scheduler's next pass, and they are invited under
that event's own rules.

The list is **people, one row each** (LAN-294): somebody who plays and also
coaches or sits on the committee appears once, with every role on the row's
second line, and the tick takes them in or out as a whole. Open recruits are in
the list on every event type since LAN-416, with a Recruits entry in the
Capacity filter wherever there is one to show.

**Which chase a recruit gets is the event's decision, not theirs** (LAN-416).
On a Recruitment event they keep the gentle cadence — one invitation and at
most one follow-up, never an escalation (REQ-two-ladders, REQ-never-harsh). On
any other event type there is no gentle cadence configured, so a recruit is
invited and chased exactly as a player is for that type. Brian: "only
recruitment events get that special status. Every other, I don't have to
change." The consent gate is untouched and applies to every recruit send on
every type: without a granted season consent the row and the invitation are
written and the message is withheld.

2. Search for `Runbook`, tick **Runbook Walker**, press **Review 1 selected**.

**Expected.** The approval review, showing:

| Field              | Value                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------- |
| Confirmed audience | `1`                                                                                      |
| No longer active   | `0`                                                                                      |
| RSVP deadline      | **Monday, 12 October 2026 at 18:00** — "Set from the club's rule for this kind of event" |
| Distribution       | **Automated 1:1 WhatsApp** — "Begins only after approval"                                |

The deadline is not typed and cannot be overridden per event. It comes from the
club's configured rule for the event type: a practice closes **two days before,
at 18:00** Oxford time. The other configured rules are two days for strength and
conditioning, chalk, recruitment, meetings and anything else; **five** days for a
social; **seven** for a fixture, a camp and Varsity. All at 18:00.

Read the sentence above the buttons: "The audience is frozen once approved — this
workflow has no way to add, remove or re-send afterwards."

3. Press **Approve event**.

**Expected.** **Event approved — 1 invitation created**, and "Nothing has been
delivered yet. Each invitation has a queued job waiting for automated delivery,
and delivery status will follow from the results of those jobs."

---

## 7. Automated WhatsApp delivery

Approval creates one invitation per confirmed audience member and **commits the
whole messaging plan**: the invitation, two WhatsApp reminders and an email, each
as a job carrying its own moment. The application dispatches them through the
official 1:1 WhatsApp Business Platform adapter and, on the email rung, through
Resend. **No step anywhere in this workflow asks an operator to copy, send, post
or mark a link as sent, and no such control exists on any screen.**

### What approval does, and what the anchor holds back

LAN-169 changed what approval means — Brian, 2026-08-22: "Yes, approval commits
the plan rather than sending." The audience still freezes at approval and
nothing can be added afterwards; only the **moment of dispatch** moved.

The invitation goes at `max(now, event start − invitation lead)`, where the lead
is five days for a practice and ten for a game. So:

- **A practice a fortnight away sends nothing today.** Its jobs are queued with
  a `scheduled_for` nine days out, and the sweep collects them when that arrives.
- **A practice two days away goes immediately**, because the rule never sends
  into the past and never delays an event that is already close. The approval
  panel says so in those words.

Reminders then count **forward** from the invitation on a 24-hour cadence, in a
fixed order that is not configurable: WhatsApp, WhatsApp again, email, and then
an escalation to whoever currently holds the President's seat, twelve hours
after the response deadline.

### Lights-out, 22:00 to 07:00

Nothing automated is sent from **22:00 to 07:00**, club time (Europe/London,
whatever the recipient's own zone), on every night including the two
clock-change nights (LAN-433, Brian 2026-09-26: "It's just not good form with
students"). The plan's times do not move — the panel still shows the rung's real
moment, and says **Automated sends wait 22:00–07:00.** — but a message whose
moment falls in the window is held until 07:00. That covers everything: an
invitation that would otherwise go the moment an event is approved, reminders,
event and onboarding nudges, the recruitment and onboarding messages, the
onboarding chase, a retry whose backoff lands overnight, an operator's
**Retry**, and both escalations to the office. Held means queued: nothing is
dropped, marked sent or spent against the attempt ceiling, and an operator
action overnight reads **Queued**.

Exactly three kinds go at any hour, because an operator pressed Send on them
and the news cannot wait: a **cancellation notice**, a **change notice** and a
**question change**.

At 07:00 the held messages go through the ordinary sweep, under the ordinary
pacing — a large overnight pile drains over the following ticks rather than
arriving at once — and every dispatch-time check runs first. A reminder whose
invitee answered in the night is withdrawn rather than sent, an onboarding chase
for a player who finished in the night is dropped, and a rung for an event that
has since started or been cancelled is not sent. The queue-age warning counts a
held message from 07:00, not from its rung.

To see it locally, run the ticker after 22:00 against an approved event whose
invitation is due: nothing reaches the sink, and the invitation's job stays
`pending` until the first tick at or after 07:00.

### What the onboarding chase counts

The automated onboarding chase asks a player only while **their own
questionnaire** has something left — the same test that decides whether their
link reads **There is nothing left to fill in** (LAN-437). That is their
details, emergency contact and consent, the Code of Conduct and photo release
until complete, and BUCS Play and Hudl until the player claims them. The five
items the club completes — kit, subs invoiced, subs paid, comms groups and photo
— never trigger a chase; they keep the player on **Missing data** exactly as
before. The same test runs again when a declared chase is dispatched, so a
player who finishes in between is not sent it, and a player who finished after
their last chase is not counted in the office's "chases have run out" message.
An operator's **Nudge** is not re-checked; it is the operator's own decision.

### Nothing advances unless something sweeps

The ladder is driven by `POST /api/scheduler/messaging`, authenticated by
`SCHEDULER_TRIGGER_TOKEN`. Cloud Scheduler makes that request in the deployed
environment. **On a developer machine nobody does**, so run the ticker beside
`npm run dev`:

```bash
npm run messaging:ticker
```

Without it, an approved event's invitation sits at its anchor, no reminder is
ever sent, and nothing escalates — which looks exactly like a broken ladder and
is not one. The ticker refuses any target that is not loopback.

Open **Delivery** from the event.

**Expected on a machine with no WhatsApp credentials.** Four tiles —
Audience `1`, Delivered `0`, Queued `0`, Failed `1` — and the banner "Operators
never copy, send or post invitations manually. Delivery telemetry does not imply
an RSVP." Press **View diagnostics**, then **Open selected issue**, and the
repair screen reports:

> **Retryable.** Safe provider reason: Automated delivery is not configured on
> this deployment, so nothing was sent. Missing settings: APP_BASE_URL,
> WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_TEMPLATE_NAME. This
> needs the club's administrator, not an operator — the invitation is unchanged
> and can be retried once it is set up.
>
> Retry: **Retryable**, 0 attempts of 5 used. Token: **Not yet issued**.
> Fallback: automated email / calendar — and the screen says in as many words
> that no hand-send action of any kind exists here.

Nothing was attempted, so nothing was spent: the attempt ceiling is untouched and
pressing Retry after configuration is a complete repair.

### 7b-0. Messaging safety, and why a message may be waiting

**LAN-394, Brian 2026-09-17.** Every send in the application — the seven
dispatchers, an operator's Retry, a reissue, a nudge, a chase, a recruitment ask
— passes one admission guard before it reaches a provider. Nothing is off by
default; the guard is on from the first deploy with the values below.

| Control                | Value                                        | What happens                                                        |
| ---------------------- | -------------------------------------------- | ------------------------------------------------------------------- |
| Shared pacing          | 50 admitted attempts per rolling 5 minutes   | extra messages wait, then go on their own                           |
| Per person, per number | 1 admission per rolling 5 minutes            | the next one waits                                                  |
| Person or number limit | 10 per 24 hours, 30 per 7 days               | that recipient is held until somebody resumes it                    |
| Emergency stop         | 3,000 admitted attempts per rolling 24 hours | all messaging pauses until somebody resumes it                      |
| Capacity warning       | 2,400 in 24 hours                            | a warning; nothing stops                                            |
| Provider cooldown      | 5 provider-side faults in 5 minutes          | that transport rests for 5 minutes, then one probe, then 10, 20, 30 |
| Queue warning          | oldest waiting over 60 minutes               | a warning; nothing stops                                            |

**What this looks like while you are walking the slice.** A message the guard
holds back is **queued**, not failed. It keeps its attempt count, it keeps its
link, it writes no failure reason, and it goes out on a later tick without
anybody pressing anything. The place it says so is **Messaging safety**, at the
bottom of Administration → Messaging schedule.

Three consequences worth knowing before they surprise you:

- **A backlog drains at about 25 messages a tick, not 50.** The shared allowance
  is 50 in any rolling five minutes and the scheduler ticks every five minutes,
  so a tick's own admissions are still inside the window when the next tick
  starts and only the rest of the allowance is left. In steady state that
  settles at about half the headline rate — roughly 25 a tick, about 300 an
  hour. A backlog of 350 first messages therefore takes something over an hour
  to clear rather than half of one, and 1,250 takes most of a morning. Nothing
  is lost and nothing needs pressing; it is slower than the table alone reads.
- **One person gets one message every five minutes.** An event whose invitation,
  first reminder and email rung are all overdue for the same player drains one
  rung per tick, not three in one. That is the point: a recovered backlog must
  not arrive all at once.
- **The automatic email fallback for a failed WhatsApp waits too.** It is a
  second message to the same person seconds after the first, so it is paced like
  any other. It is created immediately and sent on the next tick.

**What the section shows, in the order it shows it.** Brian, 18 September 2026:
this is an emergency page, and somebody arriving at it has two jobs — stop a
runaway, and find and clear a blockage. So it opens on **Messaging status** — a
Status row carrying exactly one of **Sending normally**, **Messages waiting**,
**Provider cooling down**, **Paused** or **Emergency stop** on the application's
own status chip, then Reason, By and Last change, then the one control. Then
**Messages sent** — how many were sent in the last five minutes, hour and 24
hours, each against its ceiling, reading **Nearing limit** at 80 % of one and
**At limit** at it. Then **Waiting** — what is due now, and one row per blocking
cause with the act that clears it. Then **People held back**, one person line per
held person or number with their own Resume. The limits table and the recent
changes are below those, and the limits are collapsed.

Every element is a component the application already uses elsewhere — Brian, the
same day: "The UX at the top is completely invented. We should find UX we already
use in the app and do that." The page's `Section`, the record pages' label–value
rows, the one status-chip vocabulary, the schedule form's own fields and action
bar, and the boards' person-line card.

**Pausing and resuming.** The control is at the top of Messaging safety and is
held by the President, Vice-President, Secretary and General Manager only — not
the IT Officer, who can see the state but not change it. Each needs a reason, and
a one-tap preset — **Runaway sends**, **Provider outage**, **Testing** — is a
complete one; the free-text field beside it adds to whichever preset was chosen.
Each is recorded against the operator's name. There is no "send all now" and no
"clear counters": resuming a scope clears the hold, not the usage, so a scope
resumed while its allowance is still spent simply waits again.

### 7a. The safe local provider procedure

**Corrected by LAN-181, F-L3.** This section used to have you run a hand-rolled
stub HTTP server and point the adapter at it with `WHATSAPP_GRAPH_BASE_URL`.
LAN-169 replaced that with a **local delivery sink** built into the
application itself, chosen automatically by runtime detection whenever
`APP_BASE_URL` is loopback and the runtime is not deployed — never by a flag,
and never reachable from a real deployment however its variables are set. There
is no separate process to run and no `WHATSAPP_GRAPH_BASE_URL` to set.

Add these to `.env.local`, once, after `npm run db:start`/`db:reset` has
already written the database connection, the Supabase keys and the review
login — every value below is an obvious placeholder and none is a secret (see
`docs/local-development.md`'s own copy of this recipe for where each line
comes from):

```
APP_BASE_URL=http://localhost:3000
SCHEDULER_TRIGGER_TOKEN=local-only-not-a-secret
WHATSAPP_PHONE_NUMBER_ID=local-stub
WHATSAPP_ACCESS_TOKEN=local-stub-not-a-secret
WHATSAPP_TEMPLATE_NAME=event_invitation
EMAIL_API_KEY=local-stub-not-a-secret
EMAIL_FROM_ADDRESS=Oxford Lancers <events@lancers.example.org>
```

`APP_BASE_URL`'s port has to match the one `db:start` printed for your slot —
`3000` above is the primary slot's. There is no recipient allowlist to set:
LAN-287 removed both, so this walk's own player is messaged because the domain
says they are eligible, and locally the message lands in the delivery sink
rather than on a handset. Restart `npm run dev` after editing `.env.local`: it
is read once, at startup.

Now press **Retry delivery** on the repair screen.

**Expected.** The repair screen reads **Attempted**, Token **Live**, and Retry
**Not retryable — Waiting for the provider to confirm delivery**. That is the
honest state: Meta accepting a message is not Meta delivering one, and only a
verified webhook moves it to Delivered.

An hour later, that same row reads **Not delivered** (LAN-411) — on the event's
own table, and on Follow-ups as that person's Status. It is a label over
Attempted, derived at read time and never stored, for a WhatsApp send Meta
accepted and has said nothing about since: that is what happens to a member who
has never accepted WhatsApp's terms, and Meta reports it only by silence. The
delivery page's summary keeps its four tiles and adds a warning notice counting
them. Nothing about the chase changes — no pause, no per-person mark — and the
label disappears by itself if a late `delivered` callback arrives. The seed
carries exactly one deliberate example; `npm run db:seed` prints it under
**Delivery states to look at** as "Not delivered (accepted, then silence)".

The sink wrote the rendered message to
`.lancers-runtime/delivery-sink/<timestamp>-<provider-message-id>.json` —
gitignored, one file per attempt, the real payload the application built and
would have sent to Meta. Read the newest one:

```bash
ls -t .lancers-runtime/delivery-sink/ | head -1 | xargs -I{} cat .lancers-runtime/delivery-sink/{}
```

Its `payload.template.components` array carries two `button` entries, index
`0` (**I'm attending**) and index `1` (**I'm not attending**), each with one
`parameters[0].text` — a token suffix, `y.…` or `n.…`. A Meta URL button sends
only that suffix; the approved template holds the fixed base in front of it, and
LAN-343 made that base say which answer it is: `/a/yes/` for button `0` and
`/a/no/` for button `1`. The token's own first character picks the same one — a
`y.` token belongs under `/a/yes/`, an `n.` token under `/a/no/`, and presenting
either at the other base resolves to nothing. § 8 needs the Yes one, so prepend
`APP_BASE_URL` and `/a/yes/` to the `y.` suffix to get the link a player's phone
would have shown as a button:

```
http://localhost:3000/a/yes/y.9c5ed16b-eef2-49ae-b871-27e0766bbde9.8wgtsjuzY6y9…
```

The phone number the operator typed as `07700 900901` was normalised to E.164
in the payload's own `to` field (`447700900901`), and the RSVP link exists
**only in that message** — it is not recoverable from any screen, and nobody
reads it out of the application.

### 7b. Against the real provider

Verifying against Meta itself is a separate, authorized action and is **Brian's**
— see § 15. The approved approach is official 1:1 WhatsApp Business Platform
messaging through the Meta Cloud API, with a recipient override and text mode
available only on loopback because Meta's test number cannot reach the club's
synthetic numbers. The provider contract itself — the exact Graph request, every
response code, and webhook signature verification — is pinned by
`src/lib/delivery/whatsapp-cloud.test.ts`, and
`tests/slice-walkthrough.test.ts` asserts that the walk produces a request
conforming to it.

---

## 8. Answer as a player

Open the Yes link § 7a built from the delivery sink file. It is the link a player
would have received; it is not recoverable from any screen, and nobody reads it
out of the application.

**Expected, and it is designed for a phone.** The page does not ask the question
again — the player already answered it by pressing a button in WhatsApp, so this
is a confirmation. A card headed with the event type, then **You're attending**,
the event name with its date and time, then Player, Venue, Response deadline —
"Monday, 12 October at 18:00 · Late responses accepted until start" — and Your
answer — "You're attending". Under "This secure page records only your response.
Other players' responses are never visible." come the event's own questions, if
it asks any, under **A couple of questions for this event**; then one full-width
button — **Save options** when there are questions, **Go see other events** when
there are none — and beneath it, quietly, **Plans changed? You can change your
answer.**

There is no login. The link is the credential. Opening it writes nothing at all,
which is what makes it safe to paste into WhatsApp: the button below is the write.

1. Press that button.

**Expected.** The answer and any options are recorded in one go, and the player
is handed their own events page for the season — `/events/<durable token>`,
minted by that press — with this event's panel already open and its standing
answer reading **Attending**.

2. Now open the **No** link from the same sink file: the `n.` suffix, under
   `/a/no/`. It is a second, separate credential, so the Yes above did not
   consume it.

**Expected.** **You're not attending — no reason given** — the press already
recorded the No, and the page never suggests otherwise. Then "The club plans
numbers, transport and coaching from these responses. Tell the club why if you
can.", a **Reason** field, and two controls: **Give a reason and continue**, and
**Change to Yes** carrying the emphasis. A blank reason is accepted, not refused;
the recorded reason stays "No reason given" until the player types one.

At 375px every field stacks, the buttons run the full width, and nothing is
clipped or needs sideways scrolling.

---

## 9. Watch the register open by itself

Back in the operator's browser, open the event.

**Expected, at the top of the page: response progress by capacity** (LAN-420,
Stewart's "OPS EVENTS UPDATES" of 2026-09-22, change 2). One block per capacity
present in the audience, in the order **Recruits, Players, Coaches,
Committee** — a capacity nobody was invited under shows no block at all, so a
practice with no recruits shows Players and Coaches only. Each block reads:

| Line  | What it says                                                                       |
| ----- | ---------------------------------------------------------------------------------- |
| Name  | Recruits, Players, Coaches or Committee                                            |
| Value | `16 yes · 6 no / 39`, labelled **Said yes · Said no / Invited**                    |
| Bar   | Three segments: yes, the unanswered remainder, no — widths proportional to invited |

**One value line, not two figures** (Brian's walk, 2026-09-23). The three
numbers are one sentence about one population and the denominator belongs to
both halves, so they are read on one line rather than stacked as two metrics.

**The bar is the three answers at their true widths.** Yes runs in the theme's
success green from the left, no in the error red from the right, and the people
who have not answered are the pale track left between them — so one no in ten
is a red tenth on the right, and the gap is the chase. **There is no colour
gate.** Round 2 coloured the whole bar red, orange or green at 50 % and 75 %;
that reading is dropped, because the gap already carries it and a threshold
disagreed with the numbers at the edges — an event where everybody had answered
and half said no went green.

The block counts **invitations**, not the roster, so somebody added to an
approved event raises that capacity's denominator. Somebody invited under two
capacities is counted once, under the first of Recruits, Coaches, Players,
Committee. Nothing explains the bar in words. The same blocks head the public
**Event info link** page, from the same component, so the operator and whoever
the link was sent to are reading the same numbers.

**Invited and Said yes are no longer tiles of their own**, because each block
says both and their totals are the whole event's.

**There is no Showed tile on this page at all** (Brian's visual review,
2026-09-22): "Remove the Showed / Invited card entirely. The register panel
below it stays; attendance is still recorded there." Stewart had moved it below
the Audience and distribution section; seeing it there Brian took it out. His
walk of 2026-09-23 took it off the public **Event info link** page as well, so
the number is now on neither participation surface: who turned up is an
operator's figure, kept where it is acted on, and the link is read by people
deciding whether to come. The **register panel** is still in its position and
is still where attendance is recorded, and Showed / Invited is unchanged where
it still appears — on the operator's list of events and on the register itself,
where it keeps its D74 shape (`— / 37` before any register is saved, `0 / 37`
once one is saved with everybody absent, never a percentage). This amends
D62 / D73 / D74; `docs/ux/slice-ux.md` § 5 carries the amendment.

Nobody is asked whether it happened. LAN-151 retired that decision with both of
its screens (D30): an event has occurred once its date has passed and it was not
cancelled, and the register opens on its own schedule — about six hours before
the event starts, and it never closes afterwards (D71, D72).

**Expected, for a practice that is still more than six hours away.** A panel
headed **The register is not open yet**, naming the moment it will be — "It opens
on 14 Oct 2026, 14:00." — and no way through to a board.

**Expected, once that moment has passed.** The same panel reads **Attendance is
open**, with the sentence "Record who was there, and correct it whenever you need
to." and an **Attendance** button.

If you are walking this in one sitting and do not want to wait for the buffer,
move the practice's date back a day on the edit screen; the panel changes on the
next load. Nothing else about the event changes, and no column records that it
happened — because none exists.

Beside the stored status the heading also carries the derived one: an approved
event whose date has passed reads **Approved · Occurred**, and the events list
shows `Occurred` in its Status column and offers it as a fourth filter value
beside Draft, Approved and Cancelled.

---

## 10. Take the register as a coach

Attendance is recorded by an explicitly authorized coach — Head Coach, Offensive
Coordinator or Defensive Coordinator — from a surface that carries nothing else.

Sign out and sign in as `brian.daniel.schuster+coach@gmail.com`, the second local
login `db:start` provisions, with the same machine-local password.

**Expected immediately.** The sidebar says **Attendance** and nothing else. There
is no Roster, no Events, no Report. The list is this season's sessions in two
sections — **Upcoming**, today first, then **Earlier** — and a session whose
register has not opened yet says **Attendance not open** on its own card. There
is no standing banner above the list explaining the rule.

Open the practice from the list. Best viewed at phone width; that is what it is
for.

**Expected.** **Runbook Michaelmas practice attendance · Coach recorder view**,
and the banner "Only event context, player identity, standing
RSVP state and attendance are shown. RSVP reasons, contact, availability and
administration are omitted."

Expand **Everyone else**.

**Expected.** `Runbook Walker · RSVP: Not attending`. **The reason they gave is
not shown, and is not in the page.** It is operator-group information; the coach
sees the answer, not the explanation.

1. Press **Late**.

**Expected.** `Saved · <your name> · <time>` under the row, immediately.

2. Press **Present**.

**Expected.** The same line, updated. This is a correction: the row now holds
Present, and the audit trail keeps the Late that preceded it together with who
changed it and when. Nothing is deleted.

3. Press **Add walk-up**, and enter a first name, last name and phone.

**Expected.** The form warns "They are added to recruitment as somebody to follow
up, and recorded at this event. This does not put them on the roster or create a
membership", and notes "Recorded as Present. Correct it on their row afterwards
if you need to."

4. Press **Add walk-on**.

**Expected.** "Walk-on recorded. They are in recruitment as somebody to follow up,
and were not put on the roster", and a new **Walk-ups** group — "Turned up
uninvited, recorded present, to reconcile" — containing them, tagged
`Walk-up · never invited` and `Walk-on · in recruitment`.

### 10a. What the coach cannot reach

Still signed in as the coach, type these addresses directly. Hidden navigation is
not an authorization boundary, so this is worth doing by hand.

- `/operate/roster`
- `/operate/report`

**Expected for both.** **You do not have access to this action** — "Your operator
profile is active, but your current role assignments do not permit this action.
Attendance recording is the only operator surface open to a coaching assignment.
This action requires a club role that carries general operator access.
Authorization is enforced by the service action independently of whether a
navigation item was visible."

A coach whose seat has been given any access grant (LAN-429) is no longer a
narrow recorder: they get the ordinary shell with the destinations their grants
open, and attendance recording is unchanged. With no grant they see exactly the
above.

An ordinary player's account, and a coach whose seat has ended, reach neither the
read nor the write; `tests/slice-walkthrough.test.ts` and
`tests/coach-attendance-boundary.test.ts` prove both at the service boundary,
where a screen cannot be the thing being tested.

---

## 11. Read the Monday report

Sign back in as the operator and open **Report**.

Set the reporting date to **15 October 2026** — the Thursday after the practice,
so the practice falls in the look-back week — and press **Show report**.

**Expected.** **Last week's events, 8 – 14 October**, a row per event, and among
them:

| Event                       | Asked | Yes | No  | Silent | Turned up | Turnout |
| --------------------------- | ----- | --- | --- | ------ | --------- | ------- |
| Runbook Michaelmas practice | 1     | 0   | 1   | 0      | 2         | 200%    |

with `1 walk-up` beneath the name. One person asked, who said No; two people
present, because the walk-up turned up as well.

> **The 200% is a real defect, not a quirk of this walk.** Turnout divides those
> who turned up by those who were asked, and a walk-up is in the first number and
> not the second. Any event with a walk-up reports above 100%. It is recorded in
> § 14 and reported to Brian rather than corrected here — this issue integrates
> the slice and does not change its metric definitions.

You will also see the seeded week around it, including
`Come-and-try flag session · 2 approved, never invited` — the approval defect the
report surfaces separately from people who simply have not answered, because they
are different problems with different owners.

Press **Show report** a second time.

**Expected.** A second version is filed. The first is not rewritten: its stored
content, its `generated_at` and its `data_as_of` are byte-for-byte what they
were, and the new version records that it supersedes it. "What leadership saw on
the 12th" stays answerable.

At 375px the report is legible: the table scrolls sideways inside its own
container rather than the page, and a bottom navigation bar replaces the sidebar.
Long event names wrap to several lines, which makes rows tall.

---

## 12. Check the three calendar presentations

**Events** shows a **List / Calendar** switch, and inside Calendar a
**Calendar View / Oxford View** switch. All three show the same event records on
the same actual dates — they are three arrangements of one query.

**Calendar View**, October 2026: a conventional month grid with previous/next and
a go-to-month control, each event on its real date, a type key, and days carrying
more than one event showing all of them.

**Oxford View**: one continuous academic year rather than three term cards. It
runs Long Vacation into Michaelmas into Christmas Vacation into Hilary into
Easter Vacation into Trinity into the next Long Vacation, in one scroll, with a
**Jump to** control at the top and no season selector. Week rows down the side
carry their exact Gregorian ranges — `−1st week 27 Sep – 3 Oct 2026`,
`0th week 4 – 10 Oct 2026`, `1st week 11 – 17 Oct 2026`, then
`Christmas Vacation 1 6 – 12 Dec 2026` — and Sunday to Saturday across. The
practice you created sits in **1st week, Wednesday 14 October**, alongside the
seeded 20:00 practice on the same day. A cancelled event appears struck through.

Vacation weeks are numbered forward from 1 and a vacation belongs to neither
adjacent term, which is the club's own way of reading its year.

Nothing in either arrangement creates an audience, an invitation, an RSVP or a
delivery record; they are projections of the same events, and term and week are
derived from the date rather than entered beside it.

---

## 12b. Read the same calendar with no account at all

Sign out, or open a private window, and go to **`/calendar`**.

The same events, at the public tier: name, type, date, term and week, and where.
No status column, no invited count, no said-yes count, no attendance. Open one
from the list and the event page states the whole record — type, when, where,
term and week, mandatory or optional, required equipment, description, and, on an
online event, the joining link — and nothing about people.

The joining link is published deliberately (Brian, 2026-09-09, reversing the
earlier never-public rule). The calendar itself stays open, with no password: the
protection lives on the meeting, which requires its own passcode. The event
editor warns the operator of that whenever the delivery mode is online.

`/calendar/view` gives the same two calendar arrangements. Nothing on any of these
pages asks you to sign in, and reading them creates no record of any kind.

---

## 12c. The club link, and how long it lasts

**Event info link** on an approved event's page issues `/e/<token>` — the
shared squad page a coach posts into the team WhatsApp group. Anyone holding it
sees names, RSVP status, decline reasons and question answers, with no account
and no sign-in. It shows no delivery state and no joining URL.

**It expires seven days after the event** (Brian, 2026-09-16, LAN-354). The
panel says so beside the link. Nothing is stored: the seven days are counted
from the event's own end — or its start, where no end is recorded — as read at
the moment the link is opened, so moving a fixture to a later date brings its
link back until seven days after the new date. On day eight the link shows the
same "this link does not open anything" panel an unknown token gets, and says
nothing about the squad. There is no revoke action, and no other token type
changed.

---

## 12d. Read the operator playbook

Still signed in as an operator holding one of the four core seats — President,
Vice-President, Secretary or General Manager — open **Guide** in the sidebar,
under Administration.

**Expected.** An index of eight workflows: Recruitment, Onboarding, Events,
Messaging, Roster, People and data, Operators and roles, and Reports, plus a
link to the existing **How administration works** page, which is unchanged.

Open any one of them. Each page is the same four bands: a flowchart (a committed
SVG under `public/guide/`, with the same diagram written out beneath it), the
numbered steps with what the app does between them, the rules that bind that
flow, and where to look when something is wrong. **Operators and roles** carries
one extra band, a seat-by-capability table generated from
`src/lib/auth/capabilities.ts` at render time.

Signed in as the **IT Officer**, the Guide entry is absent from the sidebar and
`/operate/admin/guide/workflows` refuses. That is LAN-399's decision, not an
oversight: the audience is the core four. The IT Officer keeps every other
Administration entry, including How administration works.

---

## 13. What this walk deliberately does not cover

Performance and load. Anything against the hosted project. Editing and
cancelling an already-approved event, which LAN-156 built and which
[`docs/ux/tickets/LAN-156-amend-and-cancel.md`](ux/tickets/LAN-156-amend-and-cancel.md)
describes — this walk does not step through it. One thing about it is worth
stating here, because it changed: since LAN-419 an approved event has **one**
edit. **Edit event** opens one page holding the amendable details and the
questions together, and one press saves both; the separate Edit questions
button is gone and `/operate/events/<id>/edit` forwards there. What each half
does is unchanged — a detail change goes through the amendment path and its
notify decision, a question change sends nothing for a wording fix and voids
and re-asks a changed question. Since LAN-422 the page judges "future" as the
save does — on the date before or after the edit — so moving a past event into
the future starts the notify tick on, and turning it off asks for the same
confirmation the save requires; a confirmed silent save queues no notices.
Adding a recipient after
approval, which is unavailable by design; retry and reissue act only on an
invitation that already exists and cannot change the approved audience, and an
amendment does not change it either.

---

## 14. Known limitations

Genuinely absent from the slice today:

- **No reminders and no escalation.** The nonresponse queue is computed and
  shown; nothing chases anybody. Requirement 6's reminder machinery is a later
  slice.
- **No email or SMS alternative in use.** The automated email and calendar
  fallback is the approved policy and is described on the delivery screen, but
  this slice exercises WhatsApp.
- **No export.** Not to a spreadsheet, not to PDF, and the report is not emailed
  or distributed anywhere.
- **No recruitment intake.** A walk-up creates a prospect to follow up; there is
  no workflow that turns one into a member.
- **No season close.** Nothing archives a season or carries memberships forward.
- **No real data, anywhere.** Every environment is synthetic until the pre-pilot
  gate in [`migration-runbook.md`](migration-runbook.md) is passed.
- **Turnout is wrong on any event with a walk-up** — see § 11. Reported, not
  corrected here.

**Automated WhatsApp delivery is not on this list.** It is built, it runs, and an
operator copying, sending, posting or marking a link as sent is not an accepted
path in any environment, at any stage. What a machine without credentials lacks
is the credentials, and the application says so in those words.

**Scheduled dispatch is also not on this list.** `POST /api/scheduler/messaging`
raises what is overdue, dispatches what is due, and answers with counts — see
§ 7 and `docs/deployment.md`'s § Messaging scheduler. Cloud Scheduler calls it
every five minutes on a deployed revision (LAN-168 item 0); locally,
`npm run messaging:ticker` does. A job waiting for someone to press Retry means
the sweep itself is not running, not that dispatch is unscheduled.

---

## 15. Brian's checkpoints

Every action below is a human one, is Brian's alone, and no agent performs any of
them. A reader of this repository must never infer one from its contents.

| #   | Checkpoint                 | What it means                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Merged migrations**      | Nothing in this issue adds a migration. Before a hosted walk, confirm every migration named by the merged slice PRs has been applied to the one production database, in order, per [`migration-runbook.md`](migration-runbook.md).                                                                                                                                                                                        |
| 2   | **Reference data**         | `public.roles` is created by the local seed, which is local only. How the role vocabulary reaches hosted is Brian's decision — see [`pilot-data-manifest.md`](pilot-data-manifest.md).                                                                                                                                                                                                                                    |
| 3   | **Pilot setup SQL**        | Each hosted scenario is installed by hand from `scripts/pilot/<issue>/setup.sql`, in the order given in [`../scripts/pilot/lan-82/README.md`](../scripts/pilot/lan-82/README.md). No agent runs one against hosted.                                                                                                                                                                                                       |
| 4   | **Provider configuration** | The club's Meta business portfolio, WhatsApp Business Account, Cloud API access, approved template and webhook secrets (LAN-101). Secrets go to GCP Secret Manager by Brian; no value is ever printed to verify it.                                                                                                                                                                                                       |
| 5   | **Application deployment** | Merging to `main` builds and deploys a Cloud Run revision. Confirm `/api/health` reports `status: ok` and `secretsLoaded: true`.                                                                                                                                                                                                                                                                                          |
| 6   | **Feature verification**   | Perform this walk against hosted with the synthetic scenarios, and retain the evidence. **Read § 1's hosted box first**: every row you create must carry its `PILOT-` sentinel, or no cleanup can find it and `verify-clean.sql` will call the database clean while it survives. One step creates something no cleanup can remove at all — see `scripts/pilot/lan-82/README.md` § "What the hosted walk cannot clean up". |
| 7   | **Consolidated cleanup**   | Run every scenario cleanup in the order in [`../scripts/pilot/lan-82/README.md`](../scripts/pilot/lan-82/README.md), then `verify-clean.sql`. It raises if any scenario row survived; it prints the pilot foundation's counts, and comparing those with `pilot-data-manifest.md` is yours to do.                                                                                                                          |
| 8   | **Real-data gate**         | Real roster data and real club operations stay prohibited in every environment until LAN-86 authorizes them.                                                                                                                                                                                                                                                                                                              |

**Commands Brian must run for the local walk: none beyond § 2.** Everything in
§§ 3–12 happens in a browser.
