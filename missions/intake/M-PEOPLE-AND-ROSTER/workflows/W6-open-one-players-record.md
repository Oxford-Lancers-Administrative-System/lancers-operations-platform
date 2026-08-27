# W6 — Open one player's record

- Purpose/intended outcome: an operator needs everything the club knows about one
  player in this season, in one place, and needs to be able to tell a durable
  fact from a seasonal one.
- Primary actor: a four-role operator — President, Vice-President, Secretary,
  General Manager.
- Trigger: a question about one person that the grid cannot answer — where they
  are on onboarding, what they were awarded, why they went inactive, what they
  have been to the club across four seasons.
- Entry point: a row on the roster (`W5`), and a season row on the person record
  (`W1-05`).
- Route/placement: `/operate/roster/[membershipId]`. **This surface exists on
  `main`** and is redesigned, not extended.
- Controlling source: Task 08 §5 (the authoritative individual view and its
  contents); §6 (authority, and what a coach never sees); the field inventory
  approved 2026-08-26; the owner session of 2026-08-26 for the rebuilt ladder,
  seasonal formalwear and seasonal Blues.
- User-visible result: one season's membership in full, with the durable person
  facts shown as the person's and linked to the person record rather than
  duplicated onto the season.

## Required actions

- **Separate the person from the season, visibly.** Durable facts render as the
  person's, with a route to `W1-05`; everything else belongs to this membership.
  A player with four seasons has one person record and four of these.
- Show the season's **standing on the rebuilt ladder**, its milestone dates —
  confirmed, activated, departed, expected return — and its exit labels.
- Show the **full status history** for this membership: from, to, when, who, why.
- Show **onboarding items with per-item provenance**, and the completeness the
  grid summarises.
- Show **positions, jersey, availability, eligibility, formalwear and Blues** for
  this season.
- Show this season's **RSVP and attendance history**, read-only, from Mission 2.
- Preserve the **shipped activation control**, which is the one thing on this
  surface that writes.
- **Band the sections Person · Onboarding · Season**, the same three groups and
  the same colours as the board, so the two surfaces read as one product and a
  field's group is never a guess.
- Show the derived **Blues total** across seasons, and the derived
  **constitutional membership**.
- Link to the person's change history (`W8`).

## State transitions

**Rewritten 2026-08-27**, to match the board rather than diverge from it. Brian:
_"the current way that it looks, it kind of looks like it's the old thing… I want
those really put in place here."_

- **Season facts edit in place**, with the interaction `W5` uses: one click opens
  the value, a dropdown only where the value set is fixed, the change commits on
  its own, and every commit writes an audit event onto the person's history
  without asking for a reason.
- **Person facts render and route to the person record.** Changing one is an
  override and `W2` owns what that costs.
- **Onboarding items are edited the same way**, which retires the per-item
  `Resolve … ▾` and `SAVE` pair. Mission 7 still owns what the items mean and
  when they block activation; this changes how one is set, not what it does.
- **The separate `Membership status` card is folded in.** Standing is a season
  field and edits like the rest, so a card whose only job was one status button
  is redundant. This touches the shipped activation control and is drawn rather
  than assumed — see `W6-01`.

## Handoffs

- To `W1-05` for the person behind the season.
- To `W5` back to the grid.
- To `W8` for the change history.
- To `W2` for correcting a durable person fact.
- To Mission 7 for onboarding behaviour and the collection request.
- To Mission 9 for what positions, jersey, coach group and availability mean.
- To Mission 11 for eligibility records.
- To Mission 2, whose RSVP and attendance history is displayed and never edited.

## Dependencies and mission boundaries

- **Formalwear is seasonal**, asked each season rather than carried. This removes
  Task 10 item 3's "not applicable if already recorded" carve-out for returners
  and matches its own R1b — the checklist regenerates for everyone every season.
  Mission 7's intake reconciles it.
- **Half and Full Blue are seasonal awards**, two flags on the season record; the
  cumulative total the club actually looks at derives from history.
- **The ladder is rebuilt**: `recruit` is not a stored membership status, and the
  stored set is onboarding · active · inactive · departed · archived. This
  supersedes OD-3's single-inactive offboarding, because inactive now means still
  on the team and possibly returning while departed means gone with an
  offboarding to run.
- Coaching group, responsible coach, consent state and channel presence have no
  substrate on `main` and do not render at this mission's acceptance.
- Eligibility records need competition, status, determining authority, checked-at
  date, an external evidence reference — never academic or medical evidence — and
  effective dates with an exclusion constraint. Mission 11 owns them.

## Exceptions and recovery

- **A membership with no onboarding items at all.** A real configuration state,
  not a failure, and it says so in its own words rather than reading as
  incomplete.
- **A departed or archived membership.** Renders in full, read-only, with the
  activation control absent rather than disabled. Nothing about a past season is
  editable from here.
- **A person with almost nothing recorded.** Every absent field states `not
recorded`, and the person's missing-data flag is visible with a route to `W2`.
- **A membership whose person was merged away.** The route resolves to the
  survivor's membership, matching `W1-09`.
- **A coach reaching this route.** Refused. Coaches never see contact values,
  academic detail, date of birth, emergency contact, consent or administrative
  data, and this page is nothing but those.

## Safety, privacy, consent, and authority boundaries

- Four-role only.
- **This is the most complete view of one human in the application**, which is
  why it is four-role and why the coach refusal is explicit rather than
  incidental.
- Emergency contact renders here under its structural lockdown and is out of
  leadership exports by default.
- Date of birth renders here and on no list.
- Nothing here sends a message or records a lawful basis. The activation control
  writes a status event and nothing else.
- No destructive action.

## Acceptance evidence

Against seeded synthetic data, an operator can:

1. tell a **durable fact from a seasonal one** without being told which is which;
2. read the **full status history** for the membership, with actor and reason;
3. see **onboarding items with per-item provenance**;
4. see **formalwear and Blues as this season's**, and the **Blues total** derived
   across seasons;
5. **activate** an onboarding membership through the shipped control, and find
   the event on the history;
6. open a **departed** membership and find it complete and read-only, with no
   activation control;
7. reach the **person record** and come back;
8. confirm a **coach is refused** with no player data in the payload;
9. see the record at a **measured 375px** without losing the person/season
   distinction.

## Core decisions

| Decision                                                                           | Classification                | Governing evidence or recommended default                                                                | Status                |
| ---------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------- |
| Durable facts render as the person's, with a route to the person record            | `proposed for owner approval` | The person-versus-season test made visible. The alternative duplicates thirteen fields onto every season | Recommend as drawn    |
| The rebuilt five-value stored ladder, with `recruit` living on the prospect record | `locked`                      | Brian, 2026-08-26; supersedes OD-3                                                                       | Settled               |
| Formalwear is seasonal and reasked each season                                     | `locked`                      | Brian, 2026-08-26; matches Task 10 R1b                                                                   | Settled               |
| Blues are seasonal awards; the total derives                                       | `locked`                      | Brian, 2026-08-26                                                                                        | Settled               |
| The shipped activation control is preserved as the only write                      | `locked`                      | Task 08 §5                                                                                               | Settled               |
| A departed membership hides the activation control rather than disabling it        | `proposed for owner approval` | A disabled control invites the question of how to enable it; an absent one answers it                    | Recommend absent      |
| Section order on the page                                                          | `proposed for owner approval` | Drawn person-first, then this season's standing, then football, then history                             | Confirm at the mockup |
| Which of Mission 9's football fields render read-only versus not at all            | `delegated to Mission Lead`   | The rule is substrate-on-`main`; the enumeration is mechanical                                           | Delegated             |

## Brian approval

- Exact words:
- Date:
