# W4 — Say yes and fill in your details

- Purpose/intended outcome: The player gets one message and one link, and behind
  that link is **one screen that is both the consent board and the personal-details
  check**. They tick their agreement to be messaged, confirm what the club already
  holds, and fill what it doesn't. Afterwards their record is as complete as they
  can make it, and the club may lawfully message them from here on.
- Primary actor: **The player.** This is the mission's only workflow whose actor
  is not an operator, and there is no login anywhere in it.
- Trigger: `onboarding-opened`, fired by `W1`, `W2` or `W3`, sends the welcome.
  Every later follow-up and operator nudge carries **the same link to the same
  page** — they are re-entries, not new asks.
- Entry point: The link in the welcome message. There is no other way in: no
  navigation, no search, no login, no page on the operator side links here.
- Route/placement: **`/me/[token]/details`** — a new page on the player's existing
  season credential. See _The link is already on `main`_ below; this is the one
  real owner decision in the workflow.
- Controlling source: `S7`, `S8`, `S9`, `S10`; owned `R4-P`, `M2`,
  `T11-one-request`, `T11-states`, `T11-consent-gate`, `T11-streams-distinct`,
  `T11-A1`, `T11-A2`, `D6`, `T07-enforce`, `T07-exception`, `T07-season-scoped`,
  `T07-states`, `T07-permissions`, `T07-A-2026-08-26`, `PR7-welcome-consent`,
  `PR7-refuse-check`, `PR7-compiled-link`, `OD7-same-message`,
  `OD7-form-is-consent-board`, `OD7-oneway-tick`, `OD7-recheck-prefill`; shared
  `S25`, `S43`, `S44`; cited `R2-V` (W6), `R3-G` (W6), `R4-T` (W8),
  `T07-merge-precedence` (W7). Content and order come from the **approved
  `item-and-ask-inventory.md`**, which this workflow cites and does not re-decide.
- User-visible result: A page that says what was saved and what is still
  outstanding, and a record the club can now chase against.

## What this workflow does not decide

`item-and-ask-inventory.md` is approved. It already fixes **what the form asks
and in what order** — fifteen numbered asks, consent first, first name, last
name and mobile required. This specification cites that table. It decides the
**screen**: how the asks are grouped, how the page adapts to what is already on
record, what the states look like, and what happens on submit.

## Current `main` grounding

- Baseline `main@332bc6b`. **No collection form of any kind exists.** This is a
  new surface.
- **LAN-202 is not in the baseline.** The handoff flagged this and it is
  confirmed: there is no `/signup` route, no recruit form, nothing under
  `src/app` that collects a person's own details. LAN-202 was marked Done after
  `332bc6b` was cut, so Mission 6's form cannot be photographed or reused, and
  nothing below assumes it.
- **Nearest implemented route and shell: `/a/[token]`**, the answer link
  (LAN-172), with `/rsvp/[token]` (LAN-79) and `/me/[token]` behind it. All three
  are player-facing, signed-link, no-login, form-submitting pages, and they
  already establish every pattern this page needs:

| What W4 needs                   | What ships at `/a/[token]` today                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| The shell                       | `BANNER` = `LANCERS OPERATIONS`, grey ground, one `Paper` at `maxWidth: 720`, 48px controls |
| A privacy line at collection    | `PRIVACY_NOTE`, rendered on the page itself — `S43`'s shipped precedent                     |
| The uniform dead-link page      | `not-found.tsx`: `TERMINAL_HEADING`, `TERMINAL_PRIVACY_NOTE`, one `Close`, 404, no variant  |
| An already-recorded landing     | `ALREADY_RECORDED_HEADING` / `ALREADY_RECORDED_NOTE`                                        |
| Throttling and uniform timing   | `allowPlayerAnswerRequest`, `withUniformTerminalTiming`, `clientKeyFrom`                    |
| Field rendering                 | `QuestionField`, already reused across `/a` and `/me`                                       |
| A busy failure that isn't a lie | `BUSY_ERROR` / `BUSY_MESSAGE`                                                               |

- Reused patterns, and the departures: this page reuses all of the above
  verbatim. It departs in exactly one way — it is **long**, where every shipped
  player page is short. Fifteen asks do not fit the single-decision shape of an
  RSVP. That is the only new interaction problem this workflow poses, and
  `R4-P`'s "a minimal checklist at the top, then the form" is the answer to it.
- Desktop and 375px evidence: both sides of every screen photographed at a
  measured 1280 and 375 against the running application. Recorded in
  `acceptance/W4.md`.

## The link is already on `main`

The handoff expected the signed link to be Mission 6's substrate extended here
(`T11-A3`). On the baseline it is better than that: **`person_access_tokens`
already ships exactly the credential this workflow needs**, built for Mission 4's
chase (`20260825120000_messaging_schedule_and_chase.sql`) and resolved today by
`/me/[token]` through `resolvePersonTokenIn`.

| `T11-one-request` asks for                 | `person_access_tokens` already has                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| One open ask per person, **ever**          | `person_access_tokens_one_live_per_person_season` — a partial unique index          |
| Season-scoped, dying with its season       | `season_id` mandatory; the resolver requires an unclosed season                     |
| Revocable per person, reissue after        | `revoked_at` with a mandatory explained reason; revoking makes room for the reissue |
| No credential recoverable from the store   | digest-only, with a constraint refusing anything that is not a SHA-256              |
| Usable repeatedly, not burned on first use | `single_use = false`, `use_count`, `last_used_at`                                   |

So **the compiled ask is not a new token type.** One live durable credential per
person per season already _is_ "one open ask, ever", enforced by a database
index rather than by service code. The follow-up, the nudge and the welcome all
carry the same URL, which is why new outstanding facts join the open ask instead
of starting a second one: there is nothing to start.

**Recommended route: `/me/[token]/details`.** The player's one credential, two
pages: `/me/[token]` is their RSVP home, which ships; `/me/[token]/details` is
their record. `T11-streams-distinct` is satisfied where it is actually written —
**a collection message never carries an RSVP ask and an RSVP message never
carries a collection ask.** Each message links to its own page. The credential
underneath is shared because the club issues one credential per person per
season and the database permits exactly one.

The alternative is a separate top-level route with its own token table. It costs
a migration, a second resolver, a second revocation path, and a second live link
in the player's WhatsApp thread — and it would let a person hold two live links,
which is the thing `T11-one-request` exists to prevent. **This is the workflow's
one decision proposed for owner approval**; everything else here follows from
approved sources.

## What the substrate already gives us

Every fact **step 1** asks for has a column on `main`. Nothing the details page
collects requires inventing a place to put an answer. The two document steps are
a different matter, and have their own section below.

| Ask                                                                           | Where it lands on `main`                                                 |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Consent to be messaged                                                        | `season_messaging_consents` — one row per person per season, five states |
| First name, last name, preferred name                                         | `people.given_name`, `family_name`, `known_as`                           |
| Mobile, personal email                                                        | `contact_points`, `kind` + `scope = 'personal'`, `is_preferred`          |
| College, matriculation year, expected graduation, degree field, date of birth | `people`, all five added by the person substrate                         |
| Emergency contact, in five fields                                             | `person_emergency_contacts` — `given_name`, `family_name`, `relationship`, `phone`, `email`, one row per person |
| The checklist strip                                                           | `onboarding_items` → `onboarding_item_types`                             |
| The under-18 flag                                                             | derived in the person substrate; **never the date itself** on any list   |

`people.known_as` is listed above for the preferred name, and **is not on the
baseline** — the column does not exist at `332bc6b`. No ask in the approved
inventory needs it, and no screen renders it. It is named here only so a reader
does not go looking for it.

The `claimed` item state, per-item history and provenance are also absent, and
are owned by `W6` and `W11`. The ask's own state
(`invited · opened · submitted · …`) is absent and is owned here.

## The screen — a sequence, not one page

Owner direction, 2026-09-01. The first draft put all fifteen asks on one screen.
Brian split it:

> "I think the pages need to be split up into details, though, to make it a
> little bit different… the code of conduct needs to be its own page where we
> have the code of conduct on the page. We scroll to the bottom, and it says,
> 'Click I agree to the code of conduct'… You go to the next page… Bucs play
> should be a set of steps. Again, that's its own page as well."

**One link, five steps, still one open ask.** `T11-one-request` is untouched by
this: `person_access_tokens` holds one live durable credential per person per
season, and the sequence lives behind it. Nothing here creates a second link.

| Step | Page                   | What it is                                                                 |
| ---- | ---------------------- | ---------------------------------------------------------------------------- |
| 1    | Your details           | Consent, name and contact, academic facts, date of birth, emergency contact |
| 2    | *(read-back)*          | The mobile read-back, on the path that captured it                          |
| 3    | Code of Conduct        | The document, read, then agreed                                             |
| 4    | Photo release          | The document, read, then agreed                                             |
| 5    | BUCS Play, then Hudl   | Numbered steps, then "have you done it?"                                    |

`R4-P`'s minimal checklist strip sits at the top of every step and doubles as
the map: what is outstanding, and where in the sequence this person is.

### Step 1 — the details

Consent first (`OD7-form-is-consent-board`), then the asks in the approved
order, then **the emergency contact as five separate fields** rather than one
line — owner direction, 2026-09-01, and it matches what
`person_emergency_contacts` already stores:

| Field         | Column                                    | Asked for by Brian |
| ------------- | ----------------------------------------- | -------------------- |
| First name    | `person_emergency_contacts.given_name`    | yes                  |
| Last name     | `person_emergency_contacts.family_name`   | yes                  |
| Phone         | `person_emergency_contacts.phone`         | yes                  |
| Email         | `person_emergency_contacts.email`         | yes                  |
| **Relationship** | `person_emergency_contacts.relationship` | **not named** — the fifth column the table already carries. Shown on `W4-01` so it can be kept or dropped; the table takes either |

### Steps 3 and 4 — the two documents

Both pages are the same mechanism: the document on the page, scrolling, and an
agreement reachable only from the end of it. The agreement records **the person,
the exact version they saw, and the moment** — which is what makes it theirs
rather than a tick.

### Step 5 — BUCS Play, and Hudl

BUCS Play is numbered steps followed by "have you done it?", which records
`claimed`, not `complete` (`R2-V`, owned by `W6`). **Hudl rides on the same page
rather than taking a sixth**: it has no document and no steps of its own, and
its first half is the club's job — an operator invites, then the player accepts.
Brian was explicitly undecided here ("I do not know if Huddle should be");
splitting it into its own page is a one-line change if he wants it.

### How the sequence adapts

| Who opens it                   | What is different                                                                                                                                                                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An imported returner (`W1`)    | Step 1 pre-filled with whatever the CSV carried. Consent is asked.                                                                                                                                                                                       |
| A hand-added player (`W2`)     | The three required fields pre-filled; the rest blank. Consent is asked.                                                                                                                                                                                  |
| **A flipped recruit (`W3`)**   | Pre-filled from the recruit door and questionnaire A. **Consent is absent** — granted at the door this season, and the row is unique per person per season. Their gaps are the facts recruitment never asks: expected graduation, degree field, date of birth, and the whole emergency contact. |
| Someone with nothing left      | The already-complete page. No sequence.                                                                                                                                                                                                                  |
| Someone returning part-way     | The sequence resumes at the first step still outstanding. Steps already done are not re-asked, and an agreed document is not re-agreed unless its version changed.                                                                                        |

## What has no substrate, and is therefore new

The details in step 1 all have columns on `main`. **The two document steps do
not, and neither does a signature.** Established by reading the baseline rather
than assuming:

- **No object storage.** No bucket is configured anywhere; `supabase/config.toml`
  carries only a commented-out example.
- **No document anywhere.** No table holds a document, a policy text or a
  version of one; no `bytea`, `blob` or `base64` column exists in any migration.
- **No signature of any kind.** Nothing captures, stores or verifies one.
- **One file input in the whole application** — the event CSV import, which
  parses in memory and stores nothing.

So both document steps need substrate this mission adds: **a versioned document
text, and a dated per-person acceptance naming the version.** Neither needs an
object store, because neither needs a file.

**Where the text is administered is deferred.** Brian, 2026-09-01: "there
probably needs to be an administration page to handle that. I don't really want
to think about that right now." Recorded as an open decision below rather than
designed here; `W11` already owns per-season checklist configuration and is the
natural home. **This workflow does not depend on the answer** — it needs the
slot to exist and be versioned, not to know who fills it.

## Required actions

**Step 1 — the details page.**

1. **Open the link.** A side-effect-free GET. The ask moves `invited → opened`;
   nothing else is written, following `/a/[token]`'s Q-11 rule exactly.
2. **Tick consent** — where it is asked. One-way: the control that grants it
   offers no way to remove it (`OD7-oneway-tick`).
3. **Confirm or correct each pre-filled value; fill each gap**, including the
   emergency contact's five fields. Read-back applies on the mobile.
4. **Save and continue.**

**Steps 3 and 4 — the two documents.** For each: read the document on the page,
reach its end, and agree. The agreement records the person, the version and the
moment, and continues to the next step.

**Step 5 — the two off-system asks.** Follow the BUCS Play steps, then answer
"have you done it?"; answer the Hudl question. Both record `claimed`, not
`complete` (`R2-V`, owned by `W6`). Finish.

**Nothing in the sequence is required to advance it.** `R3-G` governs: nothing
gates, ever. A player may pass through all five steps having entered nothing,
declined both documents and answered neither off-system ask, and every page
takes it; the gaps stay outstanding and stay chased. The three required fields
are required to be _asked for_ and to be _chased_, never to be a barrier — and
that includes the two documents, which are asked for and chased like anything
else.

**Leaving part-way is normal.** Whatever a step saved is saved. Returning to the
link resumes at the first step still outstanding, and an already-agreed document
is not re-agreed unless its version changed.

## State transitions

**The ask** (`T11-states`, owned here, exercised by `W5` and `W8`):

| From        | To                 | On                                                      |
| ----------- | ------------------ | ------------------------------------------------------- |
| —           | `invited`          | The welcome, or any follow-up or nudge, is dispatched   |
| `invited`   | `opened`           | The link is opened. GET only, writes nothing else       |
| `opened`    | `submitted`        | The player submits                                      |
| `submitted` | `opened`           | They return through the same link — **`W5`'s workflow** |
| `opened`    | `corrected`        | A later change to an already-confirmed value — **`W5`** |
| any         | `already-complete` | Nothing is outstanding when the link is opened          |
| any         | `expired/revoked`  | The season closed, or the credential was revoked        |
| any         | `error`            | The submit could not be saved                           |
| per fact    | `refused`          | They decline to give one value — **`W5`**               |

**Consent** (`T07-states`, as shipped): `never_asked → asked` when the welcome
goes out; `asked → granted` on the tick, `source = 'qr_self_entry'`'s sibling for
a self-served page; `granted → withdrawn` **only by an operator**, never by this
page. Season-scoped throughout (`T07-season-scoped`): every new season re-asks.

**Checklist items**: the derived contact-and-academic item (inventory item 9)
completes when every required field is present. The Code of Conduct and photo
release complete on the player's confirmation. BUCS Play and Hudl go to
`claimed`. All of that is `W6`'s machinery; this workflow supplies the input.

## Handoffs

| To        | What crosses                                                                                          |
| --------- | ----------------------------------------------------------------------------------------------------- |
| `W5`      | The same page, opened outside the welcome moment. `corrected` and `refused` are W5's states           |
| `W6`      | Every value submitted, with player provenance, into the record and the activity log                   |
| `W7`      | A submitted value that contradicts an operator-confirmed, verified or derived one → `disputed`        |
| `W8`      | What is still outstanding after submit is what the queue ranks and the chase asks for next            |
| `W11`     | Which items exist, their labels and their verification class, all read rather than decided here       |
| `W12`     | The cadence the follow-ups run to                                                                     |
| Mission 4 | The welcome and every follow-up ride the pipeline, template-only. Nothing here sends anything by hand |
| Mission 8 | The wording in the consent, Code of Conduct and photo-release slots                                   |

**The dispute rule belongs to `W7`, not here.** This page never silently
overwrites a value the club confirmed; it raises `disputed — awaiting
verification`. What that looks like to the player is one line saying the club
will check — the resolution surface is `W7`'s.

## Dependencies and mission boundaries

| Seam                        | This mission's side                                                                       | The other side                                                     | Blocking?                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------- |
| Mission 4 · Communications  | The welcome and follow-up message class; the refuse-without-basis check and its exception | Transport, templates, delivery states, the scheduler               | Independently walkable — the page works without a message sent |
| Mission 5 · People & Roster | The values this page writes                                                               | `people`, `contact_points`, `person_emergency_contacts`, the queue | Not blocking; all shipped                                      |
| Mission 6 · Recruitment     | Reads what the recruit door captured                                                      | The door, the questionnaires, the consent grant                    | Not blocking; substrate is on `main`, surfaces are not needed  |
| **Mission 8 · Consent**     | Capture mechanics: the tick, its states, the season re-ask, the point-of-collection slot  | **The words in the slot**                                          | **Provisional, and it does not block** — see below             |
| Mission 3 · App Shell       | Requiring the policy at the point of collection                                           | The shell                                                          | Not blocking; `/a/[token]` already ships the pattern           |

**The one provisional handoff, restated at the workflow that actually renders
it.** This page is where the boundary's Mission 8 seam becomes visible: consent
wording, the Code of Conduct and the photo release are all Clint's words through
Task 07. This workflow owns the **slot** — versioned, dated, stored as theirs —
and walks with placeholder wording in a real slot. No Mission 8 decision changes
a state, a transition, a control or an acceptance here; it changes the text
inside three boxes. If that stops being true, it returns to Brian.

## Exceptions and recovery

- **Expired or revoked link, and an unknown token.** All three render one
  page — the shape that ships at `/a/[token]/not-found.tsx`: same 404, same
  heading, same "for privacy, we can't provide more information about this
  link", one `Close`, and no variant that could let the three diverge. Nothing
  leaks about why. **One shipped sentence does not come across.**
  `TERMINAL_BODY` reads "If the event has already started, response changes are
  closed", which is the answer link's business and untrue of a collection
  link; `W4-05` photographs that single substitution and changes nothing else.
- **The season closed.** The resolver already refuses; it renders as the same
  uniform page.
- **Already complete.** Nothing outstanding, so no form — the shipped
  `ALREADY_RECORDED` pattern, saying so plainly and pointing at their most recent
  message from the club.
- **The submit fails.** `BUSY_MESSAGE`'s shipped wording, the entered values
  retained, nothing recorded, the ask left at `opened`. `error` is a state of
  the ask, not of the record.
- **The player is under 18.** The derived flag stops the chase entirely: a
  flagged person is **not messaged at all** until a fresh owner decision defines
  under-18 handling. The date lands on the record; the flag stops the machine.
  Owned as a shared boundary with Mission 8 (`S44`).
- **No consent, or consent withdrawn.** The person is `unmessageable`. The link
  they already hold keeps working — a person who withheld consent may still fix
  their phone number — but nothing further is sent to them. The welcome is the
  single exception the refuse-without-basis check permits (`T07-exception`,
  `T11-consent-gate`), and it is permitted precisely because its purpose is to
  obtain the basis.
- **Two people merge.** Which consent row wins is `W7`'s open item
  (`T07-merge-precedence`), cited here because this page is what created both rows.

## Safety, privacy, consent, and authority boundaries

- **No login, ever.** One signed, revocable, season-scoped credential per person,
  carrying no session and exposing nobody else's information.
- **The page shows one person and only that person.** No squad list, no counts,
  no other name.
- **Date of birth is restricted.** It is collected here and never appears on a
  list, board or queue; only the derived under-18 flag does.
- **The privacy policy sits at the point of collection**, on this page, as
  `/a/[token]` already does with `PRIVACY_NOTE`.
- **Consent is one-way on the player's side.** The form cannot untick it —
  nobody switches off their own consent while updating a phone number. An
  operator can switch it off at any point on request, on the person's status,
  which is `W6`'s surface (`OD7-oneway-tick`).
- **Throttling and uniform timing** as shipped, so a terminal response cannot be
  distinguished by how long it took.
- **Free text is restricted.** Anything a player types in a reason or a note is
  four-role-group only and never reaches a report verbatim.

## Acceptance evidence

Eight screens, each photographed on both sides at a measured 1280 and 375
against the running application on the mission slot. Both sides of every screen
come from the same producer.

| Screen  | What it proves                                                                              |
| ------- | --------------------------------------------------------------------------------------------- |
| `W4-01` | Step 1: the strip as the map, consent first, the gaps, the emergency contact as five fields |
| `W4-02` | Step 1 for a **flipped recruit**: pre-filled, and **no consent step**                       |
| `W4-03` | The Code of Conduct on its own page, scrolled to the end, agreement below it                |
| `W4-04` | The photo release, same mechanism — and the e-signature decision, marked                    |
| `W4-05` | BUCS Play as numbered steps, then the claim; Hudl alongside                                 |
| `W4-06` | Done — what was saved, what is still outstanding                                            |
| `W4-07` | Already complete — the link opened with nothing left to give                                |
| `W4-08` | Expired or revoked — the uniform page, and the one sentence that had to change              |

Every screen is built on the `/a/[token]` shell, a real implemented route: the
current side photographs that page as it ships, the proposed side photographs
the same page transformed. `W4-02` and `W4-07` need the locally flipped recruit
from `evidence/W4-local-walk-data.md`, which must be re-run after any
`db:reset`.

The document text on `W4-03` and `W4-04`, and the four BUCS Play steps on
`W4-05`, are **placeholder and labelled as such on the screens themselves**.

Grounding: **screenshots**.

## Core decisions

| Decision                                                                                | Classification                  | Governing evidence or recommended default                                                                                                                                      | Status   |
| --------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| The form is the consent board; the tick is its first field, not a preamble              | locked                          | `OD7-form-is-consent-board`, boundary item 6                                                                                                                                   | settled  |
| Consent is one-way on the player's side; an operator switches it off                    | locked                          | `OD7-oneway-tick`, Brian 2026-09-01                                                                                                                                            | settled  |
| A flipped recruit sees no consent step this season                                      | locked                          | `season_messaging_consents` unique per person per season; `W3` acceptance                                                                                                      | settled  |
| What is asked, and in what order                                                        | locked                          | Approved `item-and-ask-inventory.md`; cited, not re-decided                                                                                                                    | settled  |
| First name, last name and mobile are the required set                                   | locked                          | Brian 2026-09-01, and `person-required.ts` on `main`                                                                                                                           | settled  |
| Nothing gates: a player may submit with every optional field blank                      | locked                          | `R3-G`                                                                                                                                                                         | settled  |
| One welcome template for every door                                                     | locked                          | `OD7-same-message`, `M2`                                                                                                                                                       | settled  |
| The welcome is the single message permitted before consent exists                       | locked                          | `T07-exception`, `T07-enforce`, `T11-consent-gate`                                                                                                                             | settled  |
| A minimal checklist strip at the top of every step, doubling as the map of the sequence | locked                          | `R4-P`, and Brian's direction of 2026-09-01 to split the form into pages                                                                                                       | settled  |
| The dead-link page reuses the shipped one — 404, heading, privacy line, one `Close`     | locked                          | `not-found.tsx` on `main`. Its body sentence is replaced because the shipped one talks about events; nothing else changes                                                      | settled  |
| Values arrive pre-filled and are confirmed rather than retyped                          | locked                          | `OD7-recheck-prefill`                                                                                                                                                          | settled  |
| A player's answer never silently overwrites a confirmed value; it raises `disputed`     | locked                          | Boundary item 14; resolution is `W7`'s                                                                                                                                         | settled  |
| The ask's state model, `invited` through `error`                                        | locked                          | `T11-states`; `corrected` and `refused` are exercised by `W5`                                                                                                                  | settled  |
| **The link is the shipped `person_access_tokens` credential, at `/me/[token]/details`** | **proposed for owner approval** | One live durable credential per person per season already enforces "one open ask, ever". A separate token table costs a migration and permits two live links. **Recommended.** | **open** |
| BUCS Play and Hudl answers record `claimed`, not `complete`                             | locked                          | `R2-V`, owned by `W6`                                                                                                                                                          | settled  |
| Read-back applies to the mobile captured here                                           | locked                          | Overview invariant                                                                                                                                                             | settled  |
| Under-18: the date is stored, the flag stops the chase entirely                         | locked                          | Overview invariant, `S44`                                                                                                                                                      | settled  |
| A person without consent keeps a working link but receives nothing further              | locked                          | `T07-enforce`; the link is a credential, not a message                                                                                                                         | settled  |
| How the step-1 asks are grouped into sections on that page                              | delegated to Mission Lead       | The inventory fixes content and order; grouping is presentation                                                                                                                | settled  |
| **The form is a sequence: details, Code of Conduct, photo release, BUCS Play + Hudl**    | locked                          | Owner direction, 2026-09-01, quoted in full above. One link, five steps, one open ask                                                                                          | settled  |
| **The emergency contact is five fields, not one**                                       | locked                          | Owner direction, 2026-09-01, and `person_emergency_contacts`' own columns                                                                                                      | settled  |
| **Whether `relationship` is asked for**                                                 | **proposed for owner approval** | Brian named four fields; the table stores a fifth. Shown on `W4-01` so it can be kept or dropped. **Recommended: keep it** — it is the field that makes the contact usable in an emergency, and the column already exists | **open** |
| **The two documents are a versioned text plus a dated per-person acceptance, not an uploaded or e-signed file** | **proposed for owner approval** | Brian asked directly, and the answer is that the application has no object storage, no document table and no signature capture of any kind. Version + moment + person needs none of that; a drawn or PDF signature needs all of it. **Recommended: the versioned-agreement mechanism**, with e-signature additive later | **open** |
| **Where the document text is administered**                                             | **proposed for owner approval** | Brian: "there probably needs to be an administration page to handle that. I don't really want to think about that right now." **Recommended: `W11`**, which already owns per-season checklist configuration. W4 needs only that the slot exists and is versioned, so this does not block it | **open** |
| **Whether Hudl gets its own page**                                                      | **proposed for owner approval** | Brian: "I do not know if Huddle should be." **Recommended: no** — it has no document and no steps, and its first half is the club's job. It rides on the BUCS Play page. Splitting it is one line | **open** |
| Whether a document page shows its version number to the player                          | delegated to Mission Lead       | The version is recorded either way; showing it is presentation                                                                                                                 | settled  |
| Field-level validation and error wording beyond the shipped `BUSY_MESSAGE`              | delegated to Mission Lead       | No approved source constrains it; nothing gates regardless                                                                                                                     | settled  |
| The exact `messaging_consent_source` value for a self-served page                       | delegated to Mission Lead       | The enum ships with three values; the shape is a source, not a policy                                                                                                          | settled  |

## Owed, and not blocking

**BUCS Play instruction copy, and Hudl's.** Task 10 defers both to Task 11,
which is this mission, and nobody has drafted either. Stewart described the BUCS
Play ask on 2026-08-11 — "giving Jamie Carter the App Store download link for
the app. He downloads it. He fills it out with some instructions in the text
message that say do this this this" — and that is as close to copy as exists.
`W4-05` carries four placeholder steps, labelled as placeholders on the screen.
They block no build and no walk; they block a real send.

**The Code of Conduct and photo release wording**, which is Clint's through Task
07. Both document panes carry labelled placeholder text at a realistic length.

None of these is an owner action under the five-condition test: Brian can settle
each inside normal intake whenever he chooses to write it.

## Brian approval

- Exact words:
- Date:
