# Operating the slice

The complete first operational workflow, as a walk somebody who did not build it
can perform by hand: enter a returning player, put a practice on the calendar,
confirm who it goes to, approve it, let the automation invite them, collect the
answers, assert that it happened, take the register, and read the Monday report.

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
9. [Assert that it happened](#9-assert-that-it-happened)
10. [Take the register as a coach](#10-take-the-register-as-a-coach)
11. [Read the Monday report](#11-read-the-monday-report)
12. [Check the three calendar presentations](#12-check-the-three-calendar-presentations)
13. [What this walk deliberately does not cover](#13-what-this-walk-deliberately-does-not-cover)
14. [Known limitations](#14-known-limitations)
15. [Brian's checkpoints](#15-brians-checkpoints)

---

## 1. Before you start

**Where this runs.** Against the **local** Supabase stack and the local
application only. Nothing in this document is performed against the hosted
project; § 15 lists every action that is Brian's, and no step below asks a reader
to take one.

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

**Expected.** You land on **/operate/roster**. The left sidebar shows **Roster**,
**Events** and **Report**. Bottom left it says who you are signed in as and
"Authorized operator".

The heading reads `Roster` and beneath it `Season 2026-27 · 42 memberships`.

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
created together." The three summary figures read `Confirmed`, `0 of 7`
onboarding items resolved, and `Returning`.

5. Scroll to **Membership status** and press **Activate membership**.

**Expected.** A dialog, **Activate with outstanding onboarding**, naming the four
required items that are outstanding — Subscription invoiced, Kit sorted, BUCS
Play registration, Comms groups joined — and requiring an override reason. This
is the confirmation step, not a veto: activation is allowed, and the reason is
recorded.

6. Type a reason and press **Confirm activation**.

**Expected.** **Status history** now shows four entries, each with a timestamp
and your name:

```
Created as carried forward
Carried forward → Confirmed      Returner verification completed (operator entry)
Confirmed → Onboarding           Onboarding started by the system; items generated for the season
Onboarding → Active              Activated with outstanding required onboarding: <your reason>
```

Four rows, not one. The intake performs the documented state machine rather than
inserting a finished membership.

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

4. Choose **Optional** attendance and **Yes** to Response requested.
5. Press **Save draft**.

**Expected.** The event detail page, headed `Draft · Wednesday, 14 October 2026 ·
19:00–21:00`, with the banner "A draft or pending event can carry no invitations,
responses or attendance. Nothing is sent until the designated approver approves
it." Audience reads **Chosen at approval**; Distribution reads **Nothing
distributed**.

**There is no Submit button, and that is correct.** Save creates a draft; a draft
goes to approval when the club wants the automation to go out. Only President,
Vice-President, Secretary and General Manager can manage or approve calendar
events, and any of the four may approve their own — the MVP has no separate
proposer.

---

## 6. Confirm the audience and approve

1. Press **Choose audience and approve**.

**Expected.** **Build event audience** — "Nothing is selected to begin with, and
there is no whole-roster default: the audience is stored as the explicit list you
confirm here." Group shortcuts offer Everyone active, All active players, All
active coaches and All active committee, with their counts.

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

Approval creates one invitation per confirmed audience member and queues one
delivery job for each. The application then dispatches them through the official
1:1 WhatsApp Business Platform adapter. **No step anywhere in this workflow asks
an operator to copy, send, post or mark a link as sent, and no such control
exists on any screen.**

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

### 7a. The safe local provider procedure

To see the rest of the walk without a Meta account, point the adapter at a
loopback stand-in. Nothing leaves the machine, no credential exists, and the
application is unmodified — it builds and sends the same request it would send to
Meta.

Save this as `local-graph-stub.mjs` somewhere outside the repository, or in the
git-ignored `.lancers-runtime/` directory:

```js
import http from "node:http";
let n = 0;
http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      n += 1;
      const p = JSON.parse(body);
      const link = p.text?.body?.match(/https?:\/\/\S+/)?.[0] ?? "(template mode)";
      console.log(`to=${p.to} link=${link}`);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ messages: [{ id: `wamid.localstub.${n}` }] }));
    });
  })
  .listen(4180, "127.0.0.1", () => console.log("stub on http://127.0.0.1:4180"));
```

Run it in its own terminal:

```bash
node .lancers-runtime/local-graph-stub.mjs
```

Add these to `.env.local` — every value is an obvious placeholder and none is a
secret:

```
APP_BASE_URL=http://localhost:3000
WHATSAPP_GRAPH_BASE_URL=http://127.0.0.1:4180
WHATSAPP_PHONE_NUMBER_ID=local-stub
WHATSAPP_ACCESS_TOKEN=local-stub-not-a-secret
WHATSAPP_TEMPLATE_NAME=event_invitation
WHATSAPP_MESSAGE_MODE=text
```

`WHATSAPP_MESSAGE_MODE=text` is read **only** when `APP_BASE_URL` is a loopback
address, and is parsed rather than pattern-matched, so a deployed environment
cannot reach it however its variables are set.

Now press **Retry delivery** on the repair screen.

**Expected.** The stub's terminal prints one line:

```
to=447700900901 link=http://localhost:3000/rsvp/<43-character token>
```

The phone number the operator typed as `07700 900901` was normalised to E.164 by
the application, and the RSVP link exists **only in that message**. The repair
screen now reads **Attempted**, Token **Live**, and Retry **Not retryable —
Waiting for the provider to confirm delivery**. That is the honest state: Meta
accepting a message is not Meta delivering one, and only a verified webhook moves
it to Delivered.

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

Open the link the stub printed. It is the link a player would have received; it
is not recoverable from any screen, and nobody reads it out of the application.

**Expected, and it is designed for a phone.** A card headed with the event type,
the event name, the date and time, then Player, Venue, Response deadline —
"Monday, 12 October at 18:00 · Late responses accepted until start" — and Current
answer — "No response · Only you can see this". Two buttons: **I'm attending**
and **I'm not attending**.

There is no login. The link is the credential.

1. Press **I'm not attending**.

**Expected.** A **Not attending** step with "Choose a reason before saving Not
attending" and a required **Reason** field. A blank or whitespace-only reason is
refused.

2. Type a reason and press **Save not attending**.

**Expected.** **Your response is saved** — "You can change this answer until the
event starts, including after the stated response deadline."

At 375px every field stacks, both buttons run the full width, and nothing is
clipped or needs sideways scrolling.

---

## 9. Assert that it happened

Back in the operator's browser, open the event.

**Expected before you press anything.** A panel headed **Confirm what happened**:
Event status **Approved**, Occurrence **Not yet asserted — Never inferred from
time**, Attendance **Unavailable — Opens only after Mark occurred**. And the
sentence "This is a human assertion and is required before attendance. A coach
who records attendance cannot make it."

The passage of a date never marks an event as having happened. Somebody says so,
and the record names them.

Press **Mark occurred**.

**Expected.** The panel becomes **Attendance is open**, with an **Attendance**
button and a **Correct this to not held** link.

---

## 10. Take the register as a coach

Attendance is recorded by an explicitly authorized coach — Head Coach, Offensive
Coordinator or Defensive Coordinator — from a surface that carries nothing else.

Sign out and sign in as `brian.daniel.schuster+coach@gmail.com`, the second local
login `db:start` provisions, with the same machine-local password.

**Expected immediately.** The sidebar says **Attendance** and nothing else. There
is no Roster, no Events, no Report. The banner reads "A register opens once an
authorized operator has marked the session occurred. Coach attendance access does
not include Mark occurred or Mark not held."

Open the practice from the list. Best viewed at phone width; that is what it is
for.

**Expected.** **Runbook Michaelmas practice attendance · Occurred · coach
recorder view**, and the banner "Only event context, player identity, standing
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
**Gregorian / Oxford term** switch. All three show the same event records on the
same actual dates.

**Gregorian**, October 2026: a conventional month grid with previous/next and a
go-to-month control, each event on its real date, a status and type key, and days
carrying more than one event showing all of them.

**Oxford term**, Michaelmas 2026-27: the club's term card. Week rows down the
side with their exact Gregorian ranges — `−1st week 27 Sep – 3 Oct 2026`,
`0th week 4 – 10 Oct 2026`, `1st week 11 – 17 Oct 2026` — and Sunday to Saturday
across. The practice you created sits in **1st week, Wednesday 14 October**,
alongside the seeded 20:00 practice on the same day. An event recorded as not
held appears struck through.

Nothing in either calendar creates an audience, an invitation, an RSVP or a
delivery record; they are projections of the same events, and term and week are
derived from the date rather than entered beside it.

---

## 13. What this walk deliberately does not cover

Performance and load. Anything against the hosted project. Amending or cancelling
an already-approved event — that workflow has no implementation owner yet and is
a pre-pilot gap rather than something this walk quietly satisfies. Adding a
recipient after approval, which is unavailable by design; retry and reissue act
only on an invitation that already exists and cannot change the approved
audience.

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
- **No scheduled dispatch.** A job left undispatched stays Queued and is picked
  up when a person presses Retry; there is no cron, no sweep and no scheduler
  behind it.
- **Turnout is wrong on any event with a walk-up** — see § 11. Reported, not
  corrected here.
- **The Monday report grid logs a hydration mismatch** in the browser console
  when an RSVP reason tooltip is rendered (`src/app/operate/report/page.tsx`,
  `CellValue`). The page renders and behaves correctly; the console error is
  visible in development. Reported, not corrected here.

**Automated WhatsApp delivery is not on this list.** It is built, it runs, and an
operator copying, sending, posting or marking a link as sent is not an accepted
path in any environment, at any stage. What a machine without credentials lacks
is the credentials, and the application says so in those words.

---

## 15. Brian's checkpoints

Every action below is a human one, is Brian's alone, and no agent performs any of
them. A reader of this repository must never infer one from its contents.

| #   | Checkpoint                 | What it means                                                                                                                                                                                                                                                                                    |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Merged migrations**      | Nothing in this issue adds a migration. Before a hosted walk, confirm every migration named by the merged slice PRs has been applied to the one production database, in order, per [`migration-runbook.md`](migration-runbook.md).                                                               |
| 2   | **Reference data**         | `public.roles` is created by the local seed, which is local only. How the role vocabulary reaches hosted is Brian's decision — see [`pilot-data-manifest.md`](pilot-data-manifest.md).                                                                                                           |
| 3   | **Pilot setup SQL**        | Each hosted scenario is installed by hand from `scripts/pilot/<issue>/setup.sql`, in the order given in [`../scripts/pilot/lan-82/README.md`](../scripts/pilot/lan-82/README.md). No agent runs one against hosted.                                                                              |
| 4   | **Provider configuration** | The club's Meta business portfolio, WhatsApp Business Account, Cloud API access, approved template and webhook secrets (LAN-101). Secrets go to GCP Secret Manager by Brian; no value is ever printed to verify it.                                                                              |
| 5   | **Application deployment** | Merging to `main` builds and deploys a Cloud Run revision. Confirm `/api/health` reports `status: ok` and `secretsLoaded: true`.                                                                                                                                                                 |
| 6   | **Feature verification**   | Perform this walk against hosted with the synthetic scenarios, and retain the evidence.                                                                                                                                                                                                          |
| 7   | **Consolidated cleanup**   | Run every scenario cleanup in the order in [`../scripts/pilot/lan-82/README.md`](../scripts/pilot/lan-82/README.md), then `verify-clean.sql`. It raises if any scenario row survived; it prints the pilot foundation's counts, and comparing those with `pilot-data-manifest.md` is yours to do. |
| 8   | **Real-data gate**         | Real roster data and real club operations stay prohibited in every environment until LAN-86 authorizes them.                                                                                                                                                                                     |

**Commands Brian must run for the local walk: none beyond § 2.** Everything in
§§ 3–12 happens in a browser.
