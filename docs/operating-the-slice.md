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
> The per-issue hosted scenarios this walk once relied on — `scripts/pilot/lan-74`
> … `lan-110`, with `lan-82`'s consolidated cleanup and `verify-clean.sql` — were
> retired on 26 September 2026 without ever being applied (ADR 0016's amendment,
> LAN-436). There is therefore no cleanup script with a handle on a row a hosted
> walk creates. Before walking this against hosted, agree with Brian how the rows
> it creates will be removed, and follow
> [`pilot-data-runbook.md`](pilot-data-runbook.md) for any new scenario.

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
roster" and "May add recruits". Recruiting also carries **May move recruits to
Joined** (No / Yes, help line "Moves them onto the roster as Onboarding.") after
Event details (LAN-505, Brian 2026-10-16). It replaced the fixed rule that only
the President, Vice-President, Secretary and General Manager could move a
recruit to Joined, and the migration switched it on for those four. The IT
Officer holds it at Yes as well, like everything the General Manager holds
(Brian, 2026-10-19), and on that fixed seat it stays Yes; every other seat
starts at No. A press saves at once; the Notice reads the
change back and the seat's **History** gains an "Access changed" entry. **Copy
access from another seat** (choose the seat, read every line that would
change, confirm) and **Grant everything** each write one History entry listing
every changed line. On the three fixed seats every line prints its value with
no control. At 375px each group folds to its summary. A template added later
arrives at Manage for the fixed seats and None for every other. An operator
holding several seats holds the highest level any of them grants, from their
next request. The eleven roster group colours (Attendance, Slate by default, since LAN-457) are edited from **Edit categories**,
beside Add players on the roster, by the same three seats; the board, the
player and prospect records and the recruitment board draw from them. The
sidebar follows: Roster, People and Missing data with any roster category at
View; Recruitment with any recruiting category at View or May move recruits to
Joined; Events with any template
at View or an attendance capability; Follow-ups with any template at View; the
Messaging schedule with any template at Manage. Report appears only for the
seats that hold the report (the core four and the IT Officer), never as a grant
line; the rest of Administration is unchanged. Events of a template at None appear nowhere — not
on the list, the calendar, Follow-ups or by typed URL; View shows everything in
the event, including the Event info link; Manage adds every create, edit,
delete, send, approve, delivery and chase control and that template's messaging
schedule (LAN-431). Attendance recording is unchanged for every seat: the
Attendance line governs the player record's Attendance section and the roster
board's Attendance group (LAN-457), and nothing else.

**Moving a recruit to Joined (LAN-505).** The recruit's status control, on the
board, the phone card and the recruit record, offers exactly what the seat can
do. May move recruits to Joined offers Joined, whatever the Recruit details
level — with Recruit details at None the status alone is sent so the switch has
something to act on. Recruit details at Edit offers every other status; without
the switch, Joined is not offered and the open control's last line reads
"Moving to Joined needs the May move recruits to Joined permission." With
neither, the status reads with **Read only** beside it. The server refuses the
move to Joined for a seat without the switch, whatever the page showed.

**A seat holder is always an operator (LAN-434, Brian 2026-09-26; relaxed for a
phone-only holder by LAN-459 below).** On a
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

**A phone number or an email (LAN-459, Brian 2026-10-02).** Email whenever the
club has one, even with a phone number; WhatsApp only when a phone number is all
it has. Seating a person with no email but a mobile (Assign role, Replace role,
or **Invite operator** with the Email left blank and a Phone given) no longer
refuses: the panel reads **Operator account: Created when they send their
details** and **Details request by WhatsApp to** the number, with an optional
**Login email** that still invites by email if typed. The seat is written with
no account and stands from that moment, and the same submit sends one WhatsApp
message — the approved `onboarding_chase_v2` template — whose button opens
`/onboarding/<t>` on a single-purpose `operator_details` link. It obeys
lights-out (held until 07:00) and the sending allowance like any other send, and
is refused for a person who refused or withdrew messaging this season (a coach
with no consent record is sent it). The link opens the **operator details
form**: Personal information only — First name and Last name (prefilled,
required), Middle name and Known as (optional), Mobile phone and Personal email
(required, prefilled from what the club has), Date of birth (optional); no
emergency contact, no student questions and no "Not now". A college address is
refused in Personal email. Saving it records the details, revokes the link, and
— with no operator step — opens the account and sends the sign-in invitation to
the email they gave; the page then reads **Details saved** with **Sign-in
invitation sent to** that address. They sign in with their details complete.
An email the club already holds — on another person's record, or as another
account's sign-in — is refused on the link form with one sentence, **This email
cannot be used. Give another.**, whichever it is; the signed-in form keeps the
specific reason. The journey ends with the seat and with the account: ending a
person's last seat (End role, or Replace role handing it on), even with an end
date of tomorrow, cancels any request still waiting and revokes any live link,
and a request or link for someone who no longer holds or is due a seat sends
nothing and opens nothing. Once the person has an operator account, by whatever
path (Send invitation after an email is added, say), the link is revoked and is
dead.
An operator invited by email instead meets the same form at `/me/details` the
first time they sign in, whenever their personal facts (first name, last name,
mobile, personal email — the required-fields check at an operator's rung) are
incomplete, and `/operate` sends them back to it until they are. A recruit or
player who is also an operator is asked only for what is missing. The seat's
Current holder line reads **Details requested**, **Details request not
delivered**, or **Details received · <email>** — the address the invitation went
to, so an operator can see it and deactivate the account if it is wrong — and a
holder the club has only a phone number for has **Send details request**, which
sends the message again with a fresh link. The Messaging queue lists each one as
**Operator details request**, under Onboarding. The invitation link lasts 24
hours and is resent with Send invitation, as before.

**The email an operator is created with is classified (LAN-462, Brian
2026-10-02).** Invite operator stores the address on a new person as **College
email** when the Oxford rule accepts it (it ends in ox.ac.uk, or .edu) — for a
coach who is not a student too — and as **Personal email** otherwise, never as
"Email · not classified". Seating a person (or inviting an existing one) who has
no email on record copies the login email onto them the same way; a person who
already has an email is left as they are. If the person already has a preferred
email of that kind, that one stays preferred and the new address is kept as a
second one. Emails stored unclassified before this are corrected once by the
owner-run script in the LAN-462 pilot directory. Anything the application sends
an operator by email goes to the address on record, whichever kind it is.

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
governs that section and the board's Attendance group — recording attendance on an event is unchanged. On People and a person's record
(LAN-462: **Personal information**, then **Student information**, then
Restricted), the names, the student facts, Restricted, Where they stand,
Messaging and What changed read as Person; the mobile, both emails and the
emergency contact as Contact & emergency, each row drawn only where its line
allows; Their seasons as Membership. Student information shows for anyone who
has ever been a player or a recruit, or once any student fact (college email,
college, matriculation year, expected graduation, degree, subject, student number,
BAFA registration number) is recorded; on Correct this record it is present for
every person, closed for anyone else, so a non-playing coach's BAFA number can
still be entered. The missing-data rules are unchanged; Correct this record needs Edit on Person or
Contact & emergency and edits only those; Add a person needs Edit on Person;
Merge needs every roster and recruiting line at its maximum. On a prospect's
record Personal questionnaire, How to reach them, Who they are, Restricted,
Where they stand and Their seasons read as Person information; Recruitment,
Notes, What changed and Status history as Recruit details; Recruitment events
as Event details. The record header's status is text, not a pill. Every write
re-checks its own category at Edit on the server. **Add players** appears only
with "May add to the roster" (Bulk import also keeps `roster_bulk_import`);
**Add recruits** (Add one recruit, Bulk import recruits) and **QR code** only with "May
add recruits"; their pages and actions refuse without it.

**Dietary preference (LAN-502, Brian 2026-10-15).** The player's onboarding
details step (`/onboarding/<t>`, under Who you are, after Personal email) asks
**Dietary preference**, one of **Vegan**, **Vegetarian** or **No dietary
requirements**, required like the other details: left unanswered, the step stays
with **Dietary preference is required.** under the choice. The answer is stored
on the person (`people.dietary_preference`), so it carries across seasons. It is
shown in the person record's Personal information and the player record's Person
section, and the operator sets or changes it on **Correct this record** (a
reason is needed to change an answer already recorded, as for every person
fact). The roster board has a **Dietary preference** column in the Person group,
read as Person, routed to the person record like the other Person columns,
sortable and filterable by each answer or by **Not recorded**. Everyone who
onboarded before it was asked shows **Not recorded**: it is not part of the
required facts, so it adds nothing to Missing data, opens no completed
questionnaire again and never triggers a chase. `agent_readonly` cannot read the
column — a diet can disclose a belief — so it is on the hidden list in
`scripts/production/agent-readonly.sql`.

**College and degree are fixed lists (LAN-512, Brian and Stewart 2026-10-29;
replaces LAN-494's Degree type with Other).** Wherever a person's college or
degree is entered — the onboarding details step, Correct this record (which is
also where the roster's and Missing data's college and degree are corrected),
the recruitment hand-add, the QR and tokenised sign-up doors, and the recruit
and roster imports — the answer comes only from the University's own lists:
there is no free text and no Other. Each is a type-to-search box (typing
filters the list; only a listed entry can be chosen).

- **College**: the 39 constituent colleges and 5 permanent private halls, names
  as the University writes them ("St Catherine's College", "Christ Church",
  "The Queen's College", "Blackfriars"), plus Ripon College Cuddesdon, listed by
  the University as an external college. All Souls College is included.
- **Degree**: the award letters (37), "DPhil — Doctor of Philosophy" and so on,
  the six most common first (DPhil, BA, MSc, MPhil, MSt, MBA), then the rest
  alphabetically.
- **Subject**: filtered to what the University offers with the letters chosen
  (BA offers its undergraduate subjects, MSc its MSc courses, MBA only
  "Business Administration"); changing the letters clears a subject they do not
  offer. The pair is stored on `people.degree_type` and `people.degree_field`.
  Where the University names a course by the award alone the subject is the
  research's proposal (MPP Public Policy, EMBA Business Administration
  (Executive), BCL Civil Law, MJur Law, DM Medicine, DClinPsych Clinical
  Psychology); the doctoral training programmes are DPhil under their own names.

The lists and their sources are in `src/lib/services/oxford-academic.ts`. The
onboarding details step now asks for the degree letters as well as the
subject, both required like the college. Validation is on input only: the
database holds no list, so a free-text value already on file stays readable and
is shown as it is on the record. A form opening on such a value shows "On file:
<value>. Not in the list." beside the empty box and refuses the save until a
listed entry is chosen; an import refuses the row naming the cell, and accepts a
listed name in any case or punctuation ("st. anne's college"). LAN-513's
one-time cleanup moves the existing values onto the lists.

**The roster's Attendance group (LAN-457, Brian 2026-10-02).** On the wide
board (and a phone on its side) an **Attendance** group sits immediately right
of Availability with three read-only columns: **Mandatory**, **BPS** and **All
events**, each `attended/counted · percentage` (`9/9 · 100%`). Each sorts; a
player with nothing counted shows a dash, last in either direction. Each figure
is coloured by its rounded percentage (Brian, 5 October 2026): 80–100 % green,
60–79 % amber, below 60 % red, in the theme's success, warning and error
colours; a dash stays uncoloured (`attendanceBand`, the same scorer). There is
no filter, the phone cards are unchanged, and the group shows
only to a seat with View on the Attendance line. Its **BPS** is strength and
conditioning attendance (any event of type Strength and conditioning); the
Membership group's BPS Yes/No is a different column and is untouched. The rule,
for one player this season: an event counts once it has happened (approved,
dated today or earlier), the player was invited as a player, and the register
marks them Present, Late or Absent; Present and Late are attended. Excused is
left out entirely (ten mandatory, nine attended, one excused reads `9/9`); an
unexcused Absent counts against; an invitation never messaged (no WhatsApp
consent, or the event started before the send) counts as excused; an event
with no register mark is left out; availability excuses nobody. The player
record's Attendance section heads with the same three figures from the same
read, the same rule and the same colour bands, over the whole season — they no longer follow the
list's filters, so the record and the board always agree; "N attendants not
recorded" beside them still reads the filtered list. The list itself now shows
every messaged invitation, including one still pending because the player never
answered; an invitation never messaged is not listed. Since Brian's visual
review (5 October 2026) the group wears its own stored colour (Slate unless
changed in **Edit categories**), its columns carry no "view" caption (there is
no Edit level for attendance anywhere), and the record's Attendance section
sits directly after Availability, in the board's order.

**The sign-up code page (LAN-428, Brian 2026-09-26).** Recruitment → **QR
code** opens with three numbers for the live code: **Visits** (times
`/join/<code>` was opened with a `GET`; a `HEAD` or a request labelled as a
prefetch or preview is not counted, but an unfurler's plain `GET` is),
**Partial** (records the partial save created through it since it was minted,
completed or not) and **Completed** (finished sign-ups on it, less the club's
twelve test sign-ups; the stored count is unchanged). With no live code there
are no numbers. On the public form a partial record starts once first name,
last name and the first mobile box (seven or more digits) are typed, and it
stores that number as typed whether or not the confirm box is filled or agrees
(Brian's decision, 2026-09-28, replacing LAN-425's rule that withheld an
unconfirmed mobile from a partial). A retyped number is patched onto the
partial; **Sign me up** still requires the confirmation, and on completion the
confirmed value is the one kept. The partial still has no consent row, so the
welcome is the only message that can go to it. Everything else is as LAN-425
built it. A recruit who agreed to WhatsApp messages out loud is
recorded from their record's **Record consent** (LAN-371): the required **How
consent was given** note says it was verbal, and the consent row keeps who
recorded it and when, audited to that operator. It never grants anything on its
own.

**Bulk import recruits (LAN-487, Brian 2026-10-07).** Recruitment → **Add recruits**
is a menu of **Add one recruit** and **Bulk import recruits**. The import is the
roster import's door for recruits: download the empty template, upload,
read the proposal, answer possible duplicates, confirm, read the result. It
only adds. The template's columns are the hand-add's fields; first name, last
name and mobile are required; `opt_in` takes `gave_it`, `passed_on`, `public`
or `other` or their full labels, any case, or blank, and anything else refuses
the row. Each row is checked with the roster's duplicate check on first name,
last name, known as, college email, personal email and mobile (last nine
digits); one person holding the mobile is that person, any other match asks
the roster's Same person / Different person question, and an unanswered row is
refused. A current player is refused; a recruit already in this season is
reported as already there with nothing written. Every other row is written by
the hand-add's own write, so it gets the recruit record (source `CSV import`,
or `CSV import · <opt-in label>`), opt-in evidence and note, the welcome cycle
and the audience group rule; the proposal shows how many will be added to
event audiences. "Different person" over a matching contact records the
reason `Confirmed different in recruit import, line N`. A later line repeating
an earlier line's person, mobile or email is refused naming the earlier line.
The file is never stored; the digest, size and row limits are the roster's.

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

**The Roster and Recruits boards sort by up to three keys** (LAN-495, replacing
LAN-426's phone select). A **Sort** button, **Sort (n)** once keys are set,
sits beside **Filters** on a phone, upright or on its side, and opens a bottom
sheet; on a desktop it ends the pinned filter row and opens a dialog. The sheet
has three rows, **Sort by**, **Then by**, **Then by**, each a field and an
order, then **Clear** and **Done**. Changes apply as they are made; Done only
closes. A field chosen in one row is not offered below it, and choosing None
removes that row and moves the later rows up. Orders are worded by type: A–Z /
Z–A for text, Oldest first / Newest first for dates, Low–High / High–Low for
numbers.

- **Fields** are First name, Last name, the pinned Player or Recruit column, and
  every column this viewer can see, in board order, including columns inside a
  folded group. A column hidden from the viewer is never offered. A label two
  columns share names its group (`Membership · BPS`), a special-teams cell its
  squad, an event's RSVP and Attendance the event.
- **Comparison:** numbers numerically, text with en-GB numeric collation, First
  contact by instant, and an empty value last in either direction. A
  multi-valued cell sorts by its first value in the column's option order.
  Status stays alphabetical by its label, with no ladder of its own. Every tie
  ends on display name, then record id, so the order is the same on every
  device.
- **Clear** returns to the board's default: Player A–Z on the Roster; ladder
  order, then newest first contact, on Recruits.
- A **Sorted by** bar under the toolbar shows numbered chips (`1 Status A–Z`),
  so the order is readable when those columns are scrolled off screen;
  removing a chip moves the later keys up. The Filtered by bar's **Clear all**
  clears the search and filters, not the sort.
- **A column heading** changes key 1 only and keeps keys 2 and 3; a second tap
  flips its direction. Every sorted column shows its arrow.
- **One order everywhere:** the cards, the sideways table and the desktop table
  read the same keys, so rotating changes the layout only. The keys are in the
  address bar as `?sort=status:asc,college:asc,lastName:asc` and remembered per
  board in this browser, restored in every layout when the address carries
  none. An older `?sort=status&dir=desc` link still reads as one key, and a
  linked or remembered key this viewer can no longer see is dropped quietly.

**A phone on its side gets the table** (LAN-427). "On its side" is judged by
height, not width (Brian, 2026-09-28): landscape and at most 500px tall, which
covers 667×375 through 956×440 — a modern phone sideways is 852–956px wide,
above `md`, so the earlier width rule gave it the desktop page. The one rule is
`SIDEWAYS_PHONE_QUERY` in `src/theme-tokens.ts`, used by the operate shell and
both boards. On a phone on its side:

- the shell shows the phone top bar and hamburger instead of the sidebar, with
  only the phone gutter around the page; the top bar scrolls away with the page;
- Roster and Recruits put their heading on one line — title, count and the page
  actions (Edit categories / Add players; QR code / Add recruit);
- the toolbar is one row, **Filters** and **Sort**, with the search box
  and every filter select inside the Filters bottom sheet;
- the desktop table follows directly, with every heading's sort, funnel filter
  and editable cell working as on a desktop and the Player or Recruit column
  pinned while it scrolls sideways by touch. It has no vertical scroll box of
  its own: the page scrolls as a whole, so its column headings scroll away with
  the page rather than sticking.

Rotating back upright restores the cards. Desktops, tablets (upright, or on
their side and taller than 500px) and phones upright are unchanged.

Follow-ups (`/operate/admin/follow-ups`) keeps its own toolbar and scrolling
page rather than the boards' treatment. On a phone on its side, and at any
width below `lg` (1200px), the search box has its own full-width row and the
Status, When and date-range filters share the row beneath it, wrapping when
they do not fit. From `lg` up all five sit in one row; upright below `sm`
every control has its own row.

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
On a Recruitment event they keep the gentle cadence — one invitation, at most
one follow-up, never an escalation (REQ-two-ladders, REQ-never-harsh), and one
reminder before the event if they answered Yes (below). On
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
**Retry**, and both escalations to the office — everything but the four kinds
below. A recruit event reminder that 07:00 would deliver at or after its event's
start is dropped instead (below). Held means queued: nothing is
dropped, marked sent or spent against the attempt ceiling, and an operator
action overnight reads **Queued — sends at 07:00** — on **Retry**, **Reissue**,
the recruitment and onboarding **Send** buttons, the Missing-data nudge and the
Follow-ups chase alike — rather than the sending-allowance wording, which stays
for a daytime hold. A **Retry** on a failed delivery that is held, overnight or by
the sending allowance in the day, puts the delivery back to **Queued**, so the
first sweep once it is allowed sends it (LAN-442).

Exactly four kinds go at any hour. Three because an operator pressed Send on
them and the news cannot wait: a **cancellation notice**, a **change notice** and
a **question change**. The fourth is the **attendance sheet** email (below),
because it goes an hour before an event and an early event would otherwise get
none (Brian 2026-10-02).

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

The chase and the **Nudge** reach a player who has recorded no messaging consent,
on the same rule as the onboarding welcome: only a refusal or a withdrawal for
the season stops them, and an under-18 flag stops every path (LAN-496, Brian
2026-10-11). A player records consent on the questionnaire the chase asks them
to finish, so requiring it first left anyone who had not started unreachable. A
refused nudge reads **This person has declined messaging contact, so no chase
can be sent.** A chase the provider accepted but that was concluded without a
receipt (LAN-472's pre-webhook messages) counts as sent, so the next chase is
spaced from it rather than waiting on it.

### The attendance sheet, an hour before the start

One hour before an approved event starts, one email headed **Attendance sheet:**
and the event's name goes to the holder of the **General Manager** seat, the
holder of the **President** seat, and every **coach who answered Yes** to that
event (an invitation as Coach whose current answer is Yes), with a link to the
event's attendance page (LAN-465, Brian 2026-10-02). A coach who said No, or has
not answered, gets nothing; nor does anybody invited as a player. It is
hard-coded — no screen controls it — and it is email only, to whichever email
the person has on file, college or personal.

"One hour before" is the first sweep at or after that mark: the sweep runs every
five minutes, so the email can arrive up to five minutes after it. Each person
gets one per event, even if they qualify twice (a President who also coaches and
said Yes). A coach who answers Yes inside the last hour gets their copy on the
next sweep; after the start, nobody does. A cancelled event sends nothing, and
neither does an event with no start time. A moved event moves the send: an email
declared before the move waits for the new one-hour mark, including one already
held back from a coach who said No, so it does not sit in the queue as waiting.
Who receives it is read
again at the send: a coach who changes Yes to No, or a seat holder whose seat
has ended, after the email was declared is not sent it. The email stays waiting
rather than cancelled, and each sweep checks again until the start: a coach who
goes back to Yes before the start gets it once on the next sweep. Lights-out does not
hold it (Brian 2026-10-02): it goes at its one-hour mark at any hour, so an
event starting at 06:30 gets its sheet at 05:30.

The link opens the page for anyone allowed to record attendance — the General
Manager, the President and every coaching seat hold that capability, and the
register opens six hours before the start — but only once they are signed in. A
recipient with no active operator account (a coach seated before LAN-434 who
was never invited, or an invitation still pending) reaches the sign-in page,
not the sheet. These emails appear on the **Messaging queue** as **Attendance
sheet**.

### The recruit event reminder

A recruit who answered **Yes** to a Recruitment event gets **one WhatsApp
reminder** before it, saying what, when and where: "Hello {name}, a reminder
that {event} is on {when}. Venue: {venue}. See you there." (LAN-464, Brian
2026-10-02; template `recruit_event_reminder_v1`). Nobody else gets it — not a
recruit who said No or has not answered, not a player, a coach or the
committee.

The time is the recruit cadence's third control, **Reminder**, on the
Recruitment row of **Administration → Messaging schedule**, right of
**First inv.** and **One follow-up**: hours before the event, **1** by default.
**0** (or blank) turns it off. Like the other two it is frozen onto an event when
the event is approved, so a change affects events approved afterwards; events
approved before LAN-464 have no reminder. Moving an approved event moves its
reminder with it.

Who gets it is decided when the reminder moment arrives, on the first sweep at
or after it (up to five minutes later): a recruit invited as a recruit whose
current answer is Yes, **given at or before the reminder moment**, who has
season messaging consent and is still in recruitment. A Yes that arrives after
the moment gets no reminder. The answer, recruitment status and consent are all
read again just before it sends: a recruit who changed to No in between is
stood down, one who left recruitment (an exit or the flip to the roster) has it
cancelled with every other queued message, and a cancelled event sends nothing.
One per recruit per event, whatever happens to the event afterwards.

Lights-out holds it like any other recruit send: a reminder due between 22:00
and 07:00 goes at 07:00, as long as 07:00 is still before the event starts. If
it is not — an event at 07:30 with a two-hour reminder sends at 07:00; an event
at 07:00 with a one-hour reminder sends nothing — the reminder is dropped rather
than sent late. On the **Messaging queue** these read **Recruit reminder**, and
a dropped one is **Cancelled** with **Quiet hours ran past the event start.**
under its time.

### Messages: email any audience, with attachments

**Messages** (`/operate/messages`, its own entry in the navigation after
Events; LAN-514, Brian and Stewart 2026-10-29, a first pass for Brian's
review) sends one email, with files attached, to people already in the
system. Email only — never WhatsApp. It opens for the seats that administer
delivery (`delivery_administration`: President, Vice-President, Secretary,
General Manager, IT Officer); the send action checks that capability again on
the server.

**The list** shows every message, newest first: when it sends or sent, the
subject (and how many files), the audience (the groups ticked, or **Chosen by
name**), how many people it was queued for, who sent it, and **Scheduled**,
**Sending** or **Sent**. A message opens on its own page: the body, the files
with their sizes, and every recipient with their delivery state in the
club's usual words (Queued, Attempted, Delivered, Failed…), with the reason
where one was recorded. The recipients are the chosen people who had an
email, so their names are listed only for a seat that reads Contact &
emergency, as the event review names who is unreachable; any other seat sees
the count.

**New message** is one page in three steps:

1. **Audience** — the event audience builder itself (the group bands, the
   search, Capacity and Unit, one row per person), its per-person detail
   narrowed to the sender's roster and recruiting grants as the event builder
   narrows it (LAN-423). The send resolves the chosen keys against that same
   narrowed catalogue, so a key the page did not offer is refused. A person
   with no current email is marked **Not reachable · No email**, and a recruit
   with no granted season messaging consent **Not reachable · No consent**, as
   their event invitation would be; both marks show only to a seat that reads
   Contact & emergency, and the send refuses them either way.
2. **Email** — subject (200 characters), message (20,000; each line one
   paragraph, no images), and **Attach files**. Files go up as they are
   chosen, in 4 MB pieces, with a progress bar; the running total reads
   `12.4 MB of 29.9 MB`. Resend takes 40 MB per email after base64 encoding,
   so the files may total about 30 MB; a file that would take the total over
   is refused with "The attachments are too large to send by email." At most
   ten files.
3. **Send** — **Send now** or **Schedule** (a date and a 24-hour time, club
   time). Below it, **Recipients · N** names everybody it will reach and **Not
   reachable · M** names who it will not, before anything is sent. The button
   reads **Send to N people** or **Schedule for N people**.

**What happens.** One `club_messages` row, its files claimed, and one email
job per reachable person (`notification_jobs`, `other`, keyed
`club-message:<message>:<person>`), with an audit row. Send now is due at once
and goes on the next scheduler tick (every five minutes); a scheduled message
is due at its time. From there it is an ordinary message: it appears in the
**Messaging queue** as **Message**, waits through lights-out (22:00–07:00) like
every other non-urgent message, is paced and capped by messaging safety, and
each copy is recorded as a delivery attempt with Resend's own receipt. At send
time the email is re-read from the person's record, and a recruit's consent is
read again, so a Stop in between is honoured.

**Locally**, the delivery sink writes each email to
`.lancers-runtime/delivery-sink/` as the JSON record, the rendered `.html`, and
a `-attachments/` folder holding each file as sent.

Not in this pass: per-group variants of one message, cancelling a scheduled
message, editing one, and WhatsApp.

### The Messaging queue: every message in one place

**Administration → Messaging queue** (`/operate/admin/messaging-queue`,
directly above Messaging schedule; LAN-468, Brian 2026-10-02) is every message
the application has sent, is sending or will send — events, recruitment and
onboarding together — rather than one event at a time. It opens for the seats
that already administer delivery (`delivery_administration`: President,
Vice-President, Secretary, General Manager, IT Officer) and is read-only.

**Expected.** Four tiles: **Queued** (with **Due now** or the next due time
under it), **Attempted**, **Delivered today** and **Failed today**, the last two
with **Yesterday** under them. The lights-out line while 22:00–07:00 applies,
and a warning when any message is held. Filters **When** (opens on **Today**;
Yesterday, Last 7 days, Next 7 days), **Status**, **Channel** and **Message**
type. The list — fifty a page, cards on a phone — shows the time, who it is
to (linked to the person where the viewer may open people), the message type,
the channel, the event it belongs to and the status; no message text and no
personal link. One status the event's Delivery screen never needs: **Not sent
— event passed** (queued against an event that has started or is no longer
approved, so no sweep will ever send it). A message withheld for want of season
consent reads **Withheld — no consent**.

A message the scheduler refuses just before sending it, on purpose, reads
**Withheld** (LAN-483): a recruit who has already completed that track, a
recruit who is no longer a prospect, no messaging consent, a membership that has
gone. Nothing went to a provider and asking again gives the same answer, so it
is final, has no Retry and no next attempt, and is counted under neither
**Failed today** nor the event's **Failed** or Needs attention — on this page,
the event's Delivery screen or the person's record. It is recognised by the
attempt's shape, not its wording: never accepted, no provider message id,
requested and concluded in the same instant. Two refusals of the same shape
stay **Failed** and under Needs attention, because a person fixes them and
presses Retry: no usable number or email (**Not dispatched — no channel**) and
an event with no start time. A provider's own refusal or a bounced email stays
**Failed**; **Retryable** is kept for a provider failure that another attempt
might fix.

**Unknown** (LAN-501) is a message that was sent and whose outcome will never
arrive: its latest attempt was concluded and no delivered or failed result was
ever recorded for it. The first of these are the WhatsApp sends made before
delivery receipts were subscribed, which LAN-472 concluded on 5 October 2026.
It is worked out from that state, not from the reason's wording, so any later
conclusion without an outcome reads the same. An Unknown message is not counted
under **Attempted**, **Delivered**, **Failed** or Needs attention — on this
page, the event's Delivery screen or the person's record — and has no Retry;
nothing is resent. **Attempted** therefore counts only messages whose outcome
can still arrive.

One thing the page computes rather than reads. **A queued message's "Sends
07:00"** under its time is worked out when the page loads, from the lights-out
hours, because the database does not record that a message was held overnight —
reload after 07:00 and it reads differently.

**Delivered comes from the provider's own receipt, on both channels.** A
WhatsApp message moves from Attempted to Delivered when WhatsApp confirms it.
An email does the same when Resend reports it (LAN-484, `/api/webhooks/email`):
**Delivered** means the recipient's mail server accepted it, not that it reached
the inbox rather than spam. A bounce, or an email Resend could not send, reads
**Failed** — final, never Retryable, because the same email to the same address
gets the same answer — and counts under Needs attention. A delay changes
nothing, and a spam complaint is acknowledged and changes nothing. An accepted
email Resend has not reported on reads **Attempted**, and stays there: the
sweep that concludes a silent message after `WHATSAPP_MESSAGE_TTL_HOURS` (720
by default) applies to WhatsApp only (LAN-480), because the thirty-day window
and the "assume it was dropped" rule are Meta's. Emails sent before the receipt
webhook was set up stay **Attempted**.

**Read cost** (measured on production through `npm run prod:inspect`, 2 October
2026, 1,029 jobs): the summary and a day's page each run in about 6 ms on the
server and a seven-day page in about 11 ms, scanning the jobs table without an
index. That grows with the table; no index was added because nothing here calls
for one yet.

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

| Control                 | Value                                        | What happens                                                        |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------------------- |
| Shared pacing           | 50 admitted attempts per rolling 5 minutes   | extra messages wait, then go on their own                           |
| Per person, per number  | 1 admission per rolling 5 minutes            | the next one waits                                                  |
| Player or recruit limit | 10 per 24 hours, 30 per 7 days               | that recipient is held until somebody resumes it                    |
| Operator limit          | 50 per 24 hours, 150 per 7 days              | that operator is held until somebody resumes it                     |
| Emergency stop          | 3,000 admitted attempts per rolling 24 hours | all messaging pauses until somebody resumes it                      |
| Capacity warning        | 2,400 in 24 hours                            | a warning; nothing stops                                            |
| Provider cooldown       | 5 provider-side faults in 5 minutes          | that transport rests for 5 minutes, then one probe, then 10, 20, 30 |
| Queue warning           | oldest waiting over 60 minutes               | a warning; nothing stops                                            |

**Operators have their own limit (LAN-503, Brian 2026-10-16).** Anyone holding
a committee or coaching seat at the moment of the send is an operator, and is
sent staff messages — attendance sheets, chase escalations — on top of a
player's. Their ceiling is 50 in 24 hours and 150 in 7 days, applied to the
person and to the number or address that send goes to. Everybody else, players
and recruits, keeps 10 and 30, and a send to anybody else at a number still
counts every message there against 10 and 30. Taking up or leaving a seat moves
the person between the two on their next send; a hold already latched stays
until somebody resumes it.

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
present in the audience, in the order **Recruits, Players, Coaches** — a
capacity nobody was invited under shows no block at all, so a practice with no
recruits shows Players and Coaches only. **A committee-only invitee is counted
under Players** (LAN-440, Brian, 2026-09-26), **except one holding the General
Manager or IT Officer seat on the event's date, who is counted under Coaches**
(LAN-466, 2026-10-02) — someone invited as a player stays under Players
whatever seat they hold. Only the blocks move: the participation table's
**As** column reads them as Player, and its **As** filter offers Recruit,
Player and Coach, with Player matching them too (an old `?as=committee` link
opens on Player), and sorting by **As** puts them among the players; the stored capacity, the audience builder,
the invitation and Distribution still say committee. Each block reads:

| Line  | What it says                                                                       |
| ----- | ---------------------------------------------------------------------------------- |
| Name  | Recruits, Players or Coaches                                                       |
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

**Each block is itself a dropdown that names everybody it counts** (LAN-458,
Stu, 2026-09-30; Brian, 2026-10-01 and his visual review of 2026-10-05; LAN-481,
Brian, 2026-10-06 and his walk of 2026-10-07). There is no separate Attendance
card: clicking or tapping a **Recruits**, **Players** or **Coaches** block, or
pressing Enter or Space on it, opens it in place, inside the same card below its
bar, and the chevron turns down; clicking it again closes it. Every block is
closed on arrival, and each opens on its own. Where the blocks sit side by side
an opened one grows downward and its neighbours keep their own height. A person
sits under the capacity the blocks count them under — the same function decides
both, so a General Manager or IT Officer invited only for that seat is under
Coaches (LAN-466) and any other committee-only invitee under Players (LAN-440) —
and the names in a block always add up to its numbers. Each block holds three groups,
**Yes**, **No** and **No response**, each headed with its count (`Yes · 12`) and
listing every invitee's full name alphabetically. Every name is shown — there
is no "show more" — and a walk-up, who was never invited, is not listed. Yes
and No sit side by side as two equal columns at every width, a phone included,
with No response full width below them (its names in the same two columns). The
dropdown is on the operator's event page only: on the public **Event info link**
page the blocks do not open and carry no names.

**Once the event has occurred, its attendance sits directly below the RSVP
cards** (LAN-504, Lancers call, 2026-10-16; Brian's walk, 2026-10-22). On an
approved event whose date has passed, a second row of cards appears, one per
group the RSVP cards show and in the same order. The cards are titled by group
and kind: **Players — Responses**, **Coaches — Responses**, **Players —
Attendance**, **Coaches — Attendance** (and Recruits). An upcoming event's page
has nothing new. Each attendance card reads:

| Line     | What it says                                                                      |
| -------- | --------------------------------------------------------------------------------- |
| Title    | `Players — Attendance`                                                            |
| Headline | `2 attended / 2 expected`                                                         |
| Values   | **Present**, **Late**, **No-show** and **Excused**, each a count                  |
| Bar      | Present (green), Late (amber), No-show (red), Excused (grey), across the expected |

**Attended** is Present plus Late. **Expected** is everyone who said yes plus
anyone the register marked Present or Late who did not (a walk-up, somebody who
said no, somebody who never answered). One coach who said yes, with two coaches
recorded present, reads `2 attended / 2 expected`, both Present. Somebody who
said yes and has no register mark counts as a **No-show**; there is no "not
recorded" count. The four counts add up to expected and the bar has no empty
remainder. Somebody who is not expected (said no or never answered, and not
marked Present or Late) is in no count, including an Excused one. There is no
percentage (D62, D74). **No-show** is the register's **Absent**. The groups and
the committee fold are the RSVP cards' own; a walk-up is counted under the group
their record carries. The counting is `src/lib/services/event-attendance-progress.ts`.

Like the Responses cards, each attendance card is a dropdown, closed on arrival,
that opens in place below its bar onto the names: **Present** top left, **Late**
top right, **No-show** bottom left, **Excused** bottom right (one column on a
phone, in that order), each headed with its count (`Present · 2`) and listing
names A–Z. The public **Event info link** page does not show the attendance
cards. Cross-tabs such as "said yes but didn't show" are later reporting work.

**The audience is grouped Yes, then No, then No response** (LAN-439, client
QA, 2026-09-26), in the desktop table and the phone rows alike. The chosen sort
column still orders the people inside each group, and a walk-up sits with No
response. On a phone each person is one compact row: the name and capacity on
the first line, then Answer, Attendance, Delivery, Invitation sent, any reason
and every question answer as labelled pairs sharing lines — every fact the
desktop row carries, several to a line. The public **Event info link** page
keeps its own order and card layout.

**The filters above it are one-tap buttons** (LAN-511, Brian and Stewart,
2026-10-29), in the calendar's idiom, under the heading **Filter Everyone
asked**: the name search, then one row each for **As** (Recruit, Player, Coach,
Walk-up), **Answer** (Yes, No, No answer), **Attendance** and, at the operator
tier, **Delivery** (Needs attention, each state, Not delivered, Nothing queued).
Every choice is visible; the chosen one is filled; a second tap on it clears
that row; one choice per row, as the dropdowns allowed. Each row wraps at
desktop and scrolls sideways in one line on a phone. The URL parameters are
unchanged (`as`, `answer`, `att`, `delivery`, `q`, `by`), so old links still
work. **Group by** and **Clear filters** sit on the last line. The same bar
serves the club's **Event info link** table, without Delivery.

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

### 10a. Group the register by coaching, position or warmup group

LAN-497 (build spec approved by Brian, 16 October 2026). A **Group by** select
sits in the register's toolbar beside **Filters**, and on a sideways phone the
toolbar is one row. Its options are **None** and each of **Coaching group**,
**Offensive position group**, **Defensive position group** and **Warmup group**
that the viewer's role holds View on, by the roster access categories
`coaching`, `offensive`, `defensive` and `warmup`. There is no new permission.
A viewer holding none of the four sees no **Group by** at all; that includes the
Head Coach, OC and DC seats as seeded, which hold no roster grants until the
owner gives them some in the role editor.

The service enforces it: `readAttendanceBoard` takes the viewer's grants, reads
a family's assignment table only when that family is granted, and returns group
values for granted families only.

**None** is the register as described above. Choosing a family turns the sheet
into one collapsible section per value somebody holds, in the roster's own
vocabulary order (for example Offensive Line, Quarterbacks, Runningbacks, Wide
Receivers), each with its count and names A–Z. A player in several groups of
that family is under **each** heading; every copy is the same attendance record,
so a tap on either copy saves once and both copies show the committed value.
Everyone with no value in that family (unassigned players, coaches, committee,
guests, recruits) is in one final section, **No <family>**, for example **No
warmup group**, closed on arrival. Every group section opens on arrival, and
**Walk-ups** stays last and open. RSVP stays on each row's own line and is not a
section while a family is chosen. Section counts are per section and can add up
to more than the head count; the operator's headline counts stay event-wide.

Search, RSVP and Attendance filters work as before and combine with Group by. A
search opens every section. **Clear filters** keeps the family.

The choice is in the link (`?by=coaching|offensive|defensive|warmup`) and is
remembered in this browser for this viewer: a first visit opens on **None**, and
a later visit to a link without `by` opens on the last choice. A family in a
link that the viewer may not see is ignored, and the register opens on **None**.

**On the event page too.** The same select sits in the **Everyone asked** filter
bar, after the Answer, Attendance and Delivery buttons (there is no Filters
sheet on that page). It is the same component, the same families, the
same permission gating and the same `by` link parameter, and it shares the
register's remembered choice (one browser key per viewer), so choosing on
either page applies to both. With a family chosen the table splits into the
register's collapsible sections: **Coaches** first as their own section, then
one section per value somebody holds, then **No <family>** last and closed on
arrival. Each section header shows its count and, on an occurred event only,
"<attended> attended / <expected> expected" counted from the rows the section
shows. Columns, sort and filters are unchanged and apply within each section;
**Clear filters** keeps the family. The service (`readEventGroupValues`) reads
only the chosen family, and only for a viewer who holds it.

### 10b. What the coach cannot reach

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

**A game prints HOME or AWAY as its own first line** (LAN-475, Brian and
Stewart, 2026-10-02). On both arrangements, and on the phone agenda and week
cards, a tile for an event of the **Game** template that has Home or Away set
reads `HOME` (or `AWAY`) on a line above its ordinary `14:00 vs Brackenridge
Bulls` line. The seeded fixtures carry the side they were seeded with; the two
unconfirmed BUCS fixtures and the draft Hilary week 4 game carry none and print
no extra line. To set it, open a Game draft's **Edit**: a **Home or Away** choice
sits under **Type**, unselected until you pick one, and only for the Game
template the migration seeded — a template the club creates later does not get
it. A draft saves without it; **Choose audience and approve** on a Game draft
without it shows "This event has no Home or Away yet. Add it and approve when
you are ready." and **Approve event** refuses with the same sentence. Moving a
draft off the Game template clears it. The public calendar view prints the same
line on an approved game (section 12b). The name is never changed: the list, the
event page, the public list and event page, the subscription feed, RSVP pages,
messages and reports all show the name alone. An approved game's side is not changeable on
**Change event**.

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

**A draft is shown as its name and when, and nothing else** (LAN-463, Stu and
Brian, 2026-10-02). It stays on the list, the calendars and the subscription feed,
but its where, required equipment, description and joining link are withheld —
read as nothing from the database, not hidden after loading — and the list and
event page show no Where for it at all. Nothing marks it as a draft on these
pages. In the subscription feed (`/calendar/feed.ics`) a draft's entry carries
its name, its date and time, the line "Details to be confirmed. They may
change." in place of the description, and `STATUS:TENTATIVE`. Approving it
fills in the same entry with everything on the subscriber's next refresh: the
same `UID`, a later `SEQUENCE`, `STATUS:CONFIRMED`.

`/calendar/view` gives the same two calendar arrangements with the same tiles: an
approved Game event prints `HOME` or `AWAY` on its own line above its name, as
on the operator calendar (LAN-475). A draft game prints no such line here, since
a draft is its name and when only. The public list, the public event page and
the subscription feed show the name alone. Nothing on any of these
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
Messaging, Roster, People and data, Operators and roles, and Reports, then a
link to the existing **How administration works** page and, last, **Compliance
and user protections**.

**Compliance and user protections** (LAN-467, Stu and Brian, 2026-10-02; its
own page at `/operate/admin/guide/compliance` since Brian's visual review of
2026-10-05, no longer a section of How administration works) is a plain
account of personal data, messages, people's time, and access and security,
for a reader at the club or the university: the guide's page shell, then one
open section per heading. It keeps the audience it had on How administration
works (President, General Manager, IT Officer). Each statement is pinned by
`src/app/operate/admin/guide/content.test.ts` to the code it describes. It
leaves who is responsible for the data, and retention, to the privacy notice.

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

| #   | Checkpoint                 | What it means                                                                                                                                                                                                                                                               |
| --- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Merged migrations**      | Nothing in this issue adds a migration. Before a hosted walk, confirm every migration named by the merged slice PRs has been applied to the one production database, in order, per [`migration-runbook.md`](migration-runbook.md).                                          |
| 2   | **Reference data**         | `public.roles` is created by the local seed, which is local only. How the role vocabulary reaches hosted is Brian's decision — see [`pilot-data-manifest.md`](pilot-data-manifest.md).                                                                                      |
| 3   | **Pilot setup SQL**        | None checked in: the slice's scenarios were retired on 2026-09-26 (ADR 0016's amendment). A new hosted scenario follows [`pilot-data-runbook.md`](pilot-data-runbook.md) and is installed by hand from `scripts/pilot/<issue>/setup.sql`. No agent runs one against hosted. |
| 4   | **Provider configuration** | The club's Meta business portfolio, WhatsApp Business Account, Cloud API access, approved template and webhook secrets (LAN-101). Secrets go to GCP Secret Manager by Brian; no value is ever printed to verify it.                                                         |
| 5   | **Application deployment** | Merging to `main` builds and deploys a Cloud Run revision. Confirm `/api/health` reports `status: ok` and `secretsLoaded: true`.                                                                                                                                            |
| 6   | **Feature verification**   | Perform this walk against hosted and retain the evidence. **Read § 1's hosted box first**: no retained cleanup script can find the rows a hosted walk creates.                                                                                                              |
| 7   | **Consolidated cleanup**   | Run the cleanup of every scenario recorded as active in [`pilot-data-manifest.md`](pilot-data-manifest.md), in reverse order of installation. None is active today.                                                                                                         |
| 8   | **Real-data gate**         | Real roster data and real club operations stay prohibited in every environment until LAN-86 authorizes them.                                                                                                                                                                |

**Commands Brian must run for the local walk: none beyond § 2.** Everything in
§§ 3–12 happens in a browser.
