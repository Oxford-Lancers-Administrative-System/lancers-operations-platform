# W5 — Fix something the club has wrong

- Purpose/intended outcome: A player's details change during the season, or the
  club has something wrong. They open the link they already hold and change it.
  **That is the whole workflow.**
- Primary actor: The player, unprompted.
- Trigger: they open their link at any point after finishing `W4` — because
  something changed, or because a follow-up message brought them back.
- Entry point: the same signed link. No login, no second credential, no new page.
- Route/placement: `/me/[token]/details`, the page `W4` built, showing
  everything the club holds rather than only what is missing.
- Controlling source: `S33`; owned `OD7-followup-is-the-form`, `T11-provenance`;
  cited `OD7-required-no-decline` (`W4`), `OD7-no-targeted-ask` (`W8`),
  `T11-states` (`W4`), and boundary item 14.
- User-visible result: the record is what the player says it is — except where
  an operator put the value there, in which case a person checks first.

## Where this sits in the application

Worth stating plainly, because the first draft of this workflow buried it.

- **`W4` is the form.** A player gives their details once, through their link.
- **`W5` is that same form, still live in November.** Not a second surface and
  not a second link: the same page, showing everything rather than only the gaps.
- **Everything else the club needs to change, the club changes its own way** —
  `/operate/people/[personId]/edit`, which ships today.

It exists because there are **no player logins**, so the signed link is the only
route a player will ever have to their own data; and because Mission 5 shipped
the operator edit path and recorded in its own specification that this was the
**interim** answer until a person could fix their own record
(`OS-self-service-to-m7`). Its missing-data queue has, today, nothing acting on
it from the player's side.

## What this workflow does not do — owner direction, 2026-09-02

Three things the first draft had, which Brian removed:

1. **No declining a fact.** "They have to give the date of birth and
   information. They can't decline to give that information." `T11-refused` is
   **superseded** by `OD7-required-no-decline`. Nothing anywhere offers a player
   a way to refuse a required fact.
2. **No system-generated one-fact ask.** "I don't think the system should ask it
   because I don't even know how this information gets to them." `M6` is
   **superseded** by `OD7-no-targeted-ask`: a person decides to chase, and what
   goes out is the compiled link the player already holds. That is `W8`'s.
3. **No explanation living inside the page.** "Too much UI narration… too
   narrative in design." The screen is an ordinary form. What needs saying about
   it is said beside it, on the review page, outside the frame.

## Current `main` grounding

- Baseline `main@332bc6b`. No player-facing correction path exists. The operator
  one does, at `/operate/people/[personId]/edit`.
- Shell: `/a/[token]`, as for `W4`, for the same reasons.

### Provenance already exists, and it is derived

`person-record.ts` already answers "who supplied this value" for the seven
fields that carry no `source` column, deriving it from `audit_events` — Brian's
own choice in the LAN-184 walkthrough rather than adding columns. `<field>Source`
returns a display name, or `null` for a value never set through the application.
`contact_points.source` and `person_emergency_contacts.recorded_by_person_id`
cover the rest.

**So this workflow adds no provenance columns.** It adds the ranking, and the
`disputed` state Mission 5 deliberately did not ship (`REQ-no-disputed`: "There
is no contested-value field, no verification-mark field and no confidence class
anywhere below — not struck out, never added"). That was a seam left here.

## The one rule that survives

Boundary item 14, which is approved: a player's answer never **silently**
overwrites an operator-confirmed, externally verified or derived value.

| What the current value is                                     | What a change does                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| Supplied by the player themselves                             | **Changes it.** Their prerogative                            |
| Supplied by an operator                                       | **A person checks first.** Both values kept; `W7` resolves   |
| Derived — the under-18 flag, a verify-class item              | Not editable here at all                                     |
| Unattributed — seeded or imported, `null` source              | **Changes it**, recording the player as the source           |

On the screen this is one clause on the field's own source line, and nothing
else. The player is told *the club* recorded it, never which officer.

**The last row is proposed rather than assumed.** `readFieldProvenanceIn`
returns `null` for anything seeded or imported. Nobody attributable asserted
those values, and `W1` already refuses to let the import file overwrite a
person's own facts — so the recommendation is that the player wins there.

## Required actions

1. Open the link. Nothing is outstanding; this is not a chase.
2. Change whatever has changed.
3. Save. Values the player owns are saved; a changed operator-recorded value
   waits for a person, and the club's own value stands meanwhile.

Read-back applies to a changed mobile, as at first capture.

## State transitions

| From        | To          | On                                                     |
| ----------- | ----------- | -------------------------------------------------------- |
| `submitted` | `opened`    | They return through the same link                       |
| `opened`    | `corrected` | They change an already-confirmed value and save         |
| a fact      | `disputed`  | Their value differs from an operator-recorded one       |
| `disputed`  | resolved    | **`W7`**, never here                                    |

Consent is untouched: `OD7-oneway-tick` means this page cannot untick it.

## Handoffs

| To        | What crosses                                                              |
| --------- | ---------------------------------------------------------------------------- |
| `W7`      | Every disputed fact, with both values, both sources and both dates          |
| `W6`      | Every change, into the record and the sectioned activity log                |
| Mission 5 | The corrected values, and its missing-data queue, which this finally feeds   |
| `W4`      | The page itself. This is its returning state, not a second surface           |

## Dependencies and mission boundaries

| Seam                        | This mission's side               | The other side                                | Blocking?              |
| --------------------------- | ----------------------------------- | ----------------------------------------------- | ------------------------ |
| Mission 5 · People & Roster | The `disputed` state, the ranking | The record, the operator edit path, the queue | Not blocking; shipped  |
| Mission 8 · Consent/Privacy | The mechanism                     | Correction **policy**, subject-access, erasure | Not blocking           |
| `W7`                        | Raising it, keeping both values   | Resolving it                                  | Independently walkable |

## Exceptions and recovery

- **Nothing changed.** Nothing is recorded and no log noise is generated.
- **A fact already disputed is changed again.** The newer answer supersedes the
  waiting one; never more than one pending player answer per fact.
- **The link is dead.** `W4`'s uniform page, unchanged.
- **The player is under 18.** The flag stops the club messaging them at all; the
  link they hold still works.

## Safety, privacy, consent, and authority boundaries

- No login, and no new credential.
- A player never learns which officer recorded a value — only that the club did.
- Date of birth stays restricted when changed, exactly as when captured.
- Nothing here can grant, change or remove consent.
- Free text, if any is ever added, is four-role-group only.

## Acceptance evidence

| Screen  | What it proves                                                              |
| ------- | ----------------------------------------------------------------------------- |
| `W5-01` | The follow-up form: everything the club holds, editable, each value carrying where it came from — and the one clause that marks an operator-recorded value |

One screen, both sides, measured 1280 and 375, on the `/a/[token]` shell.

Grounding: **screenshots**.

## Core decisions

| Decision                                                                | Classification                  | Governing evidence or recommended default                                                                                          | Status   |
| ----------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| The follow-up is the same form, carrying everything, editable          | locked                          | `OD7-followup-is-the-form`, owner direction 2026-09-02                                                                             | settled  |
| Same page and same link as `W4`, in its returning state                | locked                          | No player logins; one credential per person per season                                                                             | settled  |
| No declining a required fact, anywhere                                 | locked                          | `OD7-required-no-decline`; supersedes `T11-refused`                                                                                | settled  |
| The system never generates a one-fact ask                              | locked                          | `OD7-no-targeted-ask`; supersedes `M6`. A person chases, carrying the compiled link — `W8`'s                                       | settled  |
| Provenance is the derived one Mission 5 already built                  | locked                          | `readFieldProvenanceIn`; Brian's LAN-184 walkthrough choice                                                                        | settled  |
| A change to an operator-recorded value is checked by a person first    | locked                          | Boundary item 14                                                                                                                   | settled  |
| Both values are kept when a fact is disputed; `W7` resolves it         | locked                          | Append-only audit posture                                                                                                          | settled  |
| The page carries no explanation of itself beyond field-level copy      | locked                          | Owner direction 2026-09-02 on UI narration                                                                                         | settled  |
| **An unattributed value can be replaced by the player**                | **proposed for owner approval** | `readFieldProvenanceIn` returns `null` for seeded and imported values; nobody attributable asserted them, and `W1` already refuses to let the file overwrite a person's own facts. **Recommended** | **open** |
| Whether the source line shows a date as well as who                    | delegated to Mission Lead       | Presentation; the data is there either way                                                                                         | settled  |

## Brian approval

- Exact words:
- Date:
