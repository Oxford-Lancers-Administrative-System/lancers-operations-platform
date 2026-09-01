# W1 — Bring last season's squad in

- Purpose/intended outcome: The club has a spreadsheet of the squad and no way
  to get it into the application. One operator turns that file into this
  season's roster in a single sitting, sees exactly who is about to be added
  before anything is written, and every one of them lands in onboarding with a
  checklist and a welcome on its way.
- Primary actor: A four-role operator (President, Secretary, GM, Treasurer).
- Trigger: The season has turned over and the squad needs to exist on the roster.
- Entry point: The roster board — the surface an operator already works from.
- Route/placement: `/operate/roster/import`, reached from an **Add players** menu
  on the roster board. The Events page already carries a menu of exactly this
  shape (`src/app/operate/events/create-menu.tsx`), added by LAN-155 so that
  bulk import could sit beside the single-record path without displacing it.
- Controlling source: `PR7-csv-carryforward`, `PR7-import-at-scale`,
  `OD7-season-inherit`, `OD7-import-like-events`, `OD7-dup-preview`; subject
  areas `S1`, `S5`, `S6`.
- User-visible result: The named people are on this season's roster with status
  `onboarding`, each holding a full generated checklist, each with a welcome
  queued; the operator is told how many arrived, how many were already there,
  and which rows were refused and why.

## Current `main` grounding

- Locally rendered route or nearest implemented analogue:
  **`/operate/events/import`** — the club's only import, built by LAN-155 for
  Mission 2's `W3`. It is the analogue in full: the same three-state screen, the
  same proposal-before-write contract, the same confirmation table, the same
  partial-apply behaviour. Brian settled on 2026-09-01 that the roster import
  follows it rather than inventing a shape (`OD7-import-like-events`).
- Reused component, language, interaction, and permission patterns:
  - **The three states of one screen** — choose a file, read the proposal,
    confirm — held in one client component with one server action carrying an
    `intent`, exactly as `import-screen.tsx` and `actions.ts` do. Not three
    routes: `REQ-import-confirmation`'s reason applies unchanged, and a person
    staging table would be a record of people the club never agreed to hold.
  - **The proposal travels in the form and is never stored.** The file's text
    goes back to the browser and returns with the confirmation; the plan is
    rebuilt inside the apply transaction and refused unless the digest still
    matches (`event-import.ts`, `IMPORT_PLAN_MOVED_RULE`). Abandoning leaves
    nothing behind because there was never anything to leave.
  - **The outcome vocabulary and its colours** — `presentation.ts`'s
    `OUTCOME_LABELS` and `outcomeColour`, with colour never the only carrier and
    every chip stating its outcome in words.
  - **The em dash for an empty cell** and the highlighted cell as the statement
    of change, both settled with Brian on 2026-08-21.
  - **The duplicate question is Mission 5's, already shipped.**
    `src/lib/services/person-duplicate.ts` answers "who might this already be"
    across first name, last name, aliases, every email and every phone, and
    never offers a merged-away record. This workflow calls it; it does not
    write a fourth implementation of the question.
  - **The person write is Mission 5's too.** `enterReturningPlayer` in
    `src/lib/services/roster.ts` already mints a person, their contact points
    and a season membership from the returner-intake path.
  - Permission: the surrounding roster surfaces admit any linked, active
    operator who is not a coaching assignment (`requireGeneralOperator`). This
    workflow narrows that — see **Safety** below.
- Desktop and 375px evidence: both sides photographed from the running
  application; the current side is `/operate/events/import` at the same widths,
  because a roster import does not exist on `main`.
- Reason for any departure from the implemented application: one, and it is the
  reason this workflow exists. The event import has no duplicate section,
  because two events with the same name on the same day are a refusal
  (`event-csv.ts` line 500) rather than a question for a human. Two people with
  the same name are a question, always. The confirmation therefore grows a
  section the event import has no need of.

## Required actions

1. **Open the import.** From the roster board's **Add players** menu. The screen
   states the season it will write into, by name, before a file is chosen — the
   import inherits it and never asks (`OD7-season-inherit`).
2. **Download the template.** The event import ships a prompt and a versioned
   template (`IMPORT_PROMPT`, `IMPORT_PROMPT_VERSION`) and an export route that
   round-trips. This one ships a header row for the columns below.
3. **Choose a file.** Refused whole, before any row is read, if it is over the
   size limit or its header is not one this importer recognises.
4. **Read the proposal.** One table, one row per line of the file, each row
   carrying its outcome: **New**, **Carried forward**, **Unchanged**, or
   **Refused** with the reason in words. Underneath it, the **possible
   duplicates** section: each incoming row that matched an existing person,
   shown beside the candidate and what matched, with the operator's answer
   required — _same person_ or _different person_.
5. **Confirm.** One action. Everything that can apply applies; refused rows are
   reported and change nothing.
6. **Read what happened.** Counts by outcome, the names that arrived, the rows
   that did not and why, and how many welcomes were queued.
7. **Abandon**, at any point before confirming. Nothing is written.

## State transitions

| Row outcome         | What it means                                                             | What is written                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **New**             | Nobody on record is this person.                                          | A person, their contact points, a season membership at `onboarding`, a full checklist from this season's item types, a welcome queued.   |
| **Carried forward** | A person on record, with no membership this season.                       | A season membership at `onboarding`, a full checklist, a welcome queued. **The person's own facts are not touched** — see the decisions. |
| **Unchanged**       | Already on this season's roster.                                          | Nothing. No second checklist, no second welcome.                                                                                         |
| **Refused**         | The row cannot be read as a person, or an unanswered duplicate blocks it. | Nothing.                                                                                                                                 |

Membership status on arrival is `onboarding` for every row that writes one.
Nothing else in the ladder is reachable from here: activation is `W10`.

## Handoffs

| To        | What is handed over                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `W4`      | Every new membership's welcome, carrying the signed link. `W1` ends when the welcome is queued; `W4` is what the player does with it. |
| `W6`      | Every generated checklist. `W1` generates it; `W6` is where an operator works it.                                                     |
| `W8`      | Everyone imported joins the outstanding population the Monday queue ranks.                                                            |
| `W11`     | The item types that generate. `W1` does not choose them; it instantiates whatever the season's checklist says.                        |
| Mission 5 | The board the operator returns to, now holding the imported squad.                                                                    |
| Mission 4 | The queued welcomes. This workflow never dispatches; the scheduler does.                                                              |

## Dependencies and mission boundaries

| Seam                                          | This mission's side                                                  | The other side                                    | Blocking?                                                                                                                            |
| --------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Mission 5 · duplicate check                   | Calling it, and showing its answer as a question for the operator    | `person-duplicate.ts`, shipped                    | **Independently walkable** — it is on `main` today                                                                                   |
| Mission 5 · minting a person and a membership | The import's bulk caller                                             | `roster.ts`, shipped                              | **Independently walkable**                                                                                                           |
| Mission 5 · the roster board                  | The **Add players** menu entry and the arrival of the imported squad | The board itself, shipped                         | **Independently walkable**                                                                                                           |
| Mission 4 · dispatch                          | Enqueuing `onboarding-opened` per new membership                     | The scheduler, transport, delivery states, retry  | **Independently walkable** — shipped and in use                                                                                      |
| Mission 11 · seasons                          | Inheriting the roster's current season                               | Creating one, rollover, the season-boundary reset | **Not blocking, but a walk needs a seeded season** — `readCurrentSeason` throws with none, a precondition the roster already carries |
| Mission 8 · consent wording                   | The point-of-collection policy slot on the welcome's landing         | The words in it                                   | **Independently walkable** with a placeholder in a real versioned slot                                                               |

## Exceptions and recovery

| What goes wrong                               | What the operator sees                                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No file chosen                                | One sentence, the shipped `NO_FILE_CHOSEN_MESSAGE` pattern.                                                                                                              |
| File too large                                | Refused whole before any row is read, with the limit stated.                                                                                                             |
| Header not recognised                         | Refused whole, naming the columns it expected.                                                                                                                           |
| A row is missing a required column            | That row is **Refused** with the missing field named. The rest still apply (`S6`).                                                                                       |
| A row's mobile is unreadable                  | **Refused** — a welcome that cannot be delivered is a person who never hears from the club.                                                                              |
| Two rows in the file are the same person      | The second is **Refused**, naming the first line. The event importer refuses both in the equivalent case; here the first is a usable person and the second adds nothing. |
| A possible duplicate is unanswered            | The row is **Refused** and the confirmation says so. The operator answers it and confirms again.                                                                         |
| The roster moved between proposal and confirm | The apply refuses whole, on the shipped digest rule, and the operator re-reads a fresh proposal.                                                                         |
| The operator abandons                         | Nothing is written, anywhere. The file was never stored.                                                                                                                 |
| The apply fails partway                       | One transaction. Either the whole apply committed or none of it did.                                                                                                     |
| No season exists                              | The screen is unavailable, with the reason, and the operator is sent to make a season — which is Mission 11's.                                                           |

## Safety, privacy, consent, and authority boundaries

- **This is the largest single write of personal data the application offers.**
  It creates dozens of people who have not yet heard from the club. It is
  therefore **four-role**, not the general-operator floor the surrounding roster
  surfaces use, and the guard is enforced twice — at the page and again in the
  service — as `/operate/events/import` does.
- **The file is never stored.** It exists as form text between the proposal and
  the confirmation and nowhere else. No staging table, because a staging table
  is a record of people the club has not decided to hold.
- **The welcome is the one message the club may send without consent**, and its
  purpose is to obtain it. `W1` queues it and nothing else. No other message
  reaches an imported person until they tick.
- **No date of birth in an import.** DOB is restricted, never appears on a list,
  board or queue, and is asked of the player at onboarding. A column for it here
  would put it in a spreadsheet on somebody's laptop.
- **Every arrival is audited** — who imported, when, from which file name, and
  which rows. The append-only audit substrate is shipped.
- **Nothing gates.** An imported player is a full member of the squad from the
  moment they land, invitable to events, with an empty checklist behind them.

## Acceptance evidence

- A walk on a fresh local stack with a seeded season: a file of ~50 synthetic
  players imports, the proposal names each outcome correctly, one deliberate
  duplicate appears in its section and blocks its row until answered, one
  malformed row is refused while the rest apply, and the board afterwards holds
  exactly the expected squad at `onboarding` with full checklists.
- The same file imported twice: the second run is every row **Unchanged**, no
  second checklist and no second welcome.
- Abandoning at the proposal writes nothing — proven by the roster being
  unchanged and no staging row existing to find.
- A non-four-role operator is refused at the page and at the service.
- Welcomes appear as queued dispatches, not as sends.
- Desktop and 375px screens for the three states, both sides.
- `grounding: application-walked`.

## Core decisions

| Decision                                                                                                                                                         | Classification              | Governing evidence or recommended default                                                                                                                                                                                                                                                                                                                                        | Status |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| The import writes into the roster's current season, never asks, never creates one                                                                                | locked                      | `OD7-season-inherit`, Brian 2026-09-01                                                                                                                                                                                                                                                                                                                                           | open   |
| The import follows `/operate/events/import`'s shape rather than inventing one                                                                                    | locked                      | `OD7-import-like-events`, Brian 2026-09-01                                                                                                                                                                                                                                                                                                                                       | open   |
| A confirmation page showing who is about to be added, with possible duplicates underneath                                                                        | locked                      | `OD7-dup-preview`, Brian 2026-09-01                                                                                                                                                                                                                                                                                                                                              | open   |
| Everyone imported gets the same welcome as every other door                                                                                                      | locked                      | Boundary §2, Brian 2026-09-01                                                                                                                                                                                                                                                                                                                                                    | open   |
| **The file carries first name, last name and mobile — required — plus personal email, college and matriculation year, optional.** Nothing else.                  | proposed for owner approval | Those three are the required set at every tier and are what a welcome needs to arrive. The other three are things a club spreadsheet genuinely holds and that save the player retyping. Everything else onboarding asks for — DOB, emergency contact, degree, graduation — comes from nowhere on `main`, is asked of everyone anyway, and does not belong in a file on a laptop. | open   |
| **A carried-forward person's own facts are never overwritten by the file.** A difference becomes something the player confirms on the form, not a silent update. | proposed for owner approval | The mission's standing rule that nothing a person says silently overwrites a confirmed value (`W5`) reads the same way pointed at a spreadsheet. The alternative — last-file-wins over a value a human confirmed — is the failure mode the whole provenance design exists to prevent. Recommended.                                                                               | open   |
| **An unanswered duplicate refuses its own row and nothing else.**                                                                                                | proposed for owner approval | The two alternatives are worse: blocking the whole import makes one ambiguous name hold up fifty people, and defaulting to _create_ mints a second record of a real human silently. Refusing one row is visible, recoverable and costs one more pass. Recommended.                                                                                                               | open   |
| **Confirming queues the welcomes; it never sends them.**                                                                                                         | proposed for owner approval | The invariant that nothing is ever sent by hand, and the mission rides Mission 4's scheduler verbatim (`PR7-rides-m4`). The operator is told "42 welcomes queued". Recommended.                                                                                                                                                                                                  | open   |
| Four-role, not the general-operator floor the surrounding roster surfaces use                                                                                    | proposed for owner approval | Every other bulk or consequential write in the application narrows. This one creates dozens of people. Recommended.                                                                                                                                                                                                                                                              | open   |
| Column order, the exact header names, the size limit, and the template's wording                                                                                 | delegated to Mission Lead   | Mechanical; the event import's own constants are the precedent                                                                                                                                                                                                                                                                                                                   | open   |
| Whether the export route that round-trips the template ships with this workflow                                                                                  | delegated to Mission Lead   | The event import has one; it changes no state, authority or acceptance here                                                                                                                                                                                                                                                                                                      | open   |

## Brian approval

- Exact words:
- Date:
