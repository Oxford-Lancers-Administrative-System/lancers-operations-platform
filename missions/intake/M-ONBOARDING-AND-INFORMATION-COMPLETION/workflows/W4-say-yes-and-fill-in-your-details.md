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

Every fact the form asks for has a column on `main`. Nothing in the fifteen asks
requires inventing a place to put an answer.

| Ask                                                                           | Where it lands on `main`                                                 |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Consent to be messaged                                                        | `season_messaging_consents` — one row per person per season, five states |
| First name, last name, preferred name                                         | `people.given_name`, `family_name`, `known_as`                           |
| Mobile, personal email                                                        | `contact_points`, `kind` + `scope = 'personal'`, `is_preferred`          |
| College, matriculation year, expected graduation, degree field, date of birth | `people`, all five added by the person substrate                         |
| Emergency contact                                                             | `person_emergency_contacts`, one per person, structurally locked down    |
| The checklist strip                                                           | `onboarding_items` → `onboarding_item_types`                             |
| The under-18 flag                                                             | derived in the person substrate; **never the date itself** on any list   |

**What has no substrate, and is therefore this mission's to add:** the `claimed`
item state, per-item history and provenance, the versioned wording slot the Code
of Conduct and photo release are read from, and the ask's own state
(`invited · opened · submitted · …`). The first three are owned by `W6` and
`W11`; the ask's state is owned here. The mockups mark what is proposed rather
than drawing it as if it shipped.

## The screen

`R4-P`: **a minimal checklist at the top, then the form.** One page, one submit.

**1 — The strip.** A short line of what is outstanding, with the count. Not the
full checklist, not per-item history — that is `W6`'s record, on the operator
side. Its job is to answer "why am I here and how much is this" before the
player scrolls.

**2 — Consent, as step one.** A single tick, with the privacy line beside it and
the season named. `OD7-form-is-consent-board`: the form _is_ the consent board,
so this is not a preamble to the form, it is the form's first field.

**3 — The fifteen asks, in the approved order**, grouped as the inventory groups
them: who you are (name, mobile, email); where you study (college, matriculation,
graduation, degree); the two restricted facts (date of birth, emergency contact);
the two you read and agree to (Code of Conduct, photo release); the two you go
and do (BUCS Play, Hudl).

**4 — Confirm, don't retype.** `OD7-recheck-prefill`: every value the club
already holds arrives in the field, and the ask is to confirm it. A person with a
complete record ticks their way down the page. A person with gaps sees the gaps.

**5 — One submit**, and a result page that says what was saved and what remains.

### How the page adapts

| Who opens it                 | What is different                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| An imported returner (`W1`)  | Name and whatever the CSV carried are pre-filled. Consent is step one and unticked.                                                                                                                                                                                                                                                              |
| A hand-added player (`W2`)   | The three required fields are pre-filled; everything else is blank. Consent is step one and unticked.                                                                                                                                                                                                                                            |
| **A flipped recruit (`W3`)** | Pre-filled from the recruit door and questionnaire A. **Consent is absent** — they granted it at the door this season and `season_messaging_consents` is unique per person per season, so there is nothing to ask. The four recruitment never asks — expected graduation, degree field, date of birth, emergency contact — are the visible gaps. |
| Someone with nothing left    | The already-complete state. No form.                                                                                                                                                                                                                                                                                                             |

**The flipped recruit's missing first step is the single most important thing
the mockups have to show**, because it is the one place where the three doors
produce visibly different screens, and `W3` settled it without rendering it.

## Required actions

1. **Open the link.** A side-effect-free GET. The ask moves `invited → opened`;
   nothing else is written, following `/a/[token]`'s Q-11 rule exactly.
2. **Tick consent** — where it is asked. One-way: the control that grants it
   offers no way to remove it (`OD7-oneway-tick`).
3. **Confirm or correct each pre-filled value; fill each gap.** Read-back applies
   on the mobile, as it does on every mobile-capture path in the mission.
4. **Read and confirm the Code of Conduct; read and sign the photo release** —
   each a page of wording from a versioned slot, then a dated confirmation
   stored as theirs.
5. **Answer the two off-system asks** — BUCS Play and Hudl — as "have you done
   it?", which records `claimed`, not `complete` (`R2-V`, owned by `W6`).
6. **Submit once.** The ask moves to `submitted`.

**Nothing here is required to proceed.** `R3-G` governs: nothing gates, ever. A
player may submit with every optional field blank and the page accepts it; the
gaps simply stay outstanding and stay chased. The three required fields are
required to be _asked for_ and to be _chased_, not to be a barrier.

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

Five screens, each photographed on both sides at a measured 1280 and 375 against
the running application on the mission slot. Both sides of every screen come from
the same producer.

| Screen  | What it proves                                                                      |
| ------- | ----------------------------------------------------------------------------------- |
| `W4-01` | The form as an imported returner opens it: the strip, consent as step one, the gaps |
| `W4-02` | The same page for a **flipped recruit**: pre-filled, and **no consent step**        |
| `W4-03` | Submitted — what was saved, what is still outstanding                               |
| `W4-04` | Already-complete — the link opened with nothing left to give                        |
| `W4-05` | Expired or revoked — the uniform page, and the one sentence that had to change      |

`W4-01`, `W4-03`, `W4-04` and `W4-05` are built on the `/a/[token]` shell, which
is a real implemented route: the current side photographs that page as it ships,
and the proposed side photographs the same page transformed. `W4-02` needs the
locally seeded flipped recruit from `evidence/W3-local-walk-data.md`, which must
be re-run after any `db:reset`.

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
| A minimal checklist strip at the top, then the form                                     | locked                          | `R4-P`                                                                                                                                                                         | settled  |
| The dead-link page reuses the shipped one — 404, heading, privacy line, one `Close`     | locked                          | `not-found.tsx` on `main`. Its body sentence is replaced because the shipped one talks about events; nothing else changes                                                      | settled  |
| Values arrive pre-filled and are confirmed rather than retyped                          | locked                          | `OD7-recheck-prefill`                                                                                                                                                          | settled  |
| A player's answer never silently overwrites a confirmed value; it raises `disputed`     | locked                          | Boundary item 14; resolution is `W7`'s                                                                                                                                         | settled  |
| The ask's state model, `invited` through `error`                                        | locked                          | `T11-states`; `corrected` and `refused` are exercised by `W5`                                                                                                                  | settled  |
| **The link is the shipped `person_access_tokens` credential, at `/me/[token]/details`** | **proposed for owner approval** | One live durable credential per person per season already enforces "one open ask, ever". A separate token table costs a migration and permits two live links. **Recommended.** | **open** |
| BUCS Play and Hudl answers record `claimed`, not `complete`                             | locked                          | `R2-V`, owned by `W6`                                                                                                                                                          | settled  |
| Read-back applies to the mobile captured here                                           | locked                          | Overview invariant                                                                                                                                                             | settled  |
| Under-18: the date is stored, the flag stops the chase entirely                         | locked                          | Overview invariant, `S44`                                                                                                                                                      | settled  |
| A person without consent keeps a working link but receives nothing further              | locked                          | `T07-enforce`; the link is a credential, not a message                                                                                                                         | settled  |
| How the fifteen asks are grouped into sections on the page                              | delegated to Mission Lead       | The inventory fixes content and order; grouping is presentation                                                                                                                | settled  |
| Whether the Code of Conduct and photo release open in place or on their own sub-page    | delegated to Mission Lead       | Either satisfies "a page they read, then confirm"                                                                                                                              | settled  |
| Field-level validation and error wording beyond the shipped `BUSY_MESSAGE`              | delegated to Mission Lead       | No approved source constrains it; nothing gates regardless                                                                                                                     | settled  |
| The exact `messaging_consent_source` value for a self-served page                       | delegated to Mission Lead       | The enum ships with three values; the shape is a source, not a policy                                                                                                          | settled  |

## Owed, and not blocking

**BUCS Play and Hudl instruction copy.** Task 10 defers both to Task 11, which is
this mission, and nobody has drafted either. They block no build and no walk —
the mockups carry a marked placeholder — but they block a real send. Carried
forward from `HANDOFF.md`; not an owner action under the five-condition test,
because Brian can resolve it inside normal intake whenever he chooses to write it.

## Brian approval

- Exact words:
- Date:
