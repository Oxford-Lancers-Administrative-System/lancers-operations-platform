# Field inventory disposition — M-PEOPLE-AND-ROSTER

Task 08 §4's approved inventory, every field dispositioned once, plus the
recruitment facts that inventory never listed. `W1`, `W5` and `W6` all read this
table and cite it rather than re-deciding it.

Four questions per field:

- **Person or season** — Brian's test: does it travel season to season, or does
  it live and die with the season?
- **This mission** — `build` (the field and its edit path land here) ·
  `display` (the substrate exists, another mission owns the behaviour, this
  mission shows it) · `elsewhere` (not rendered at this mission's acceptance
  because its substrate does not exist on `main`).
- **Surfaces** — People list · person detail · roster grid · player detail.
- **Authority** — everything here is four-role only (President, VP, Secretary,
  GM). The column records the narrower cases.

The numbers are Task 08 §4's position in its own inventory, kept only so a
reader can find the field there. They are not database rows and carry no meaning
here.

**Field names are the labels a person sees on screen, not column names.** Task
08's prose says "given name" and "family name" and the columns are `given_name`
and `family_name`, but the shipped screens say **First name** and **Last name**
by Brian's decision at UX-10, recorded in `roster/new/validation.ts`. This table
feeds the mockups, so it uses the screen vocabulary; where a column name matters
it is given alongside.

## Durable person facts — thirteen, all built here

| #   | Field               | This mission | Surfaces                                      | Notes                                                                                                                                                                                                                                                                 |
| --- | ------------------- | ------------ | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | First name          | build        | People list · person detail · roster · player | Required to mint. Column `given_name`; never a key.                                                                                                                                                                                                                   |
| 2   | Last name           | build        | People list · person detail · roster · player | Column `family_name`. Nullable by design — 26% of real records are first-name-only.                                                                                                                                                                                   |
| 3–4 | Aliases             | build        | person detail · merge comparison              | **One concept, two of Task 08's collapsed into it.** Known-as is gone; an alias may instead be flagged as the display name. Dedupe evidence; never roster display. Drops the shipped `known_as` column.                                                               |
| 5   | College email       | build        | person detail · player detail                 | Era-scoped, expires around graduation, superseded never overwritten. Needs the contact-kind split.                                                                                                                                                                    |
| 6   | Personal email      | build        | person detail · player detail                 | The durable/alumni channel. Same migration.                                                                                                                                                                                                                           |
| 7   | Mobile phone        | build        | person detail · player detail                 | E.164 normalised alongside the preserved raw value. Read-back on every capture and edit path.                                                                                                                                                                         |
| 9   | College             | build        | person · player · **roster grid**             | The one academic field Task 08 §5 puts on the grid.                                                                                                                                                                                                                   |
| 10  | Matriculation year  | build        | person detail · player detail                 | Not on the grid.                                                                                                                                                                                                                                                      |
| 11  | Expected graduation | build        | person detail · player detail                 | Drives BUCS-eligibility timing.                                                                                                                                                                                                                                       |
| 12  | Degree field        | build        | person detail · player detail                 | —                                                                                                                                                                                                                                                                     |
| 13  | Date of birth       | build        | person detail · player detail                 | Four-role only, never the grid. Mission 7 adds the player-provided capture; the field is here.                                                                                                                                                                        |
| 14  | Emergency contact   | build        | person detail · player detail                 | **Five fields**: first name, last name, relationship, phone, email. One per person, four-role only, never the grid. Structural lockdown is a locked invariant. No source evidence exists — the club has never held it — so the shape is Brian's, expanded 2026-08-26. |

Raw contact values never appear on the roster grid. The grid carries
**contactability indicators** only — has mobile, has personal email — per Task
08 §5.

**Three of Task 08's durable facts left this mission on 2026-08-26**, all by the
same test. Field 8, channel presence, is a season record and goes to Mission 6.
Field 16, Half/Full Blue, is a seasonal award whose total derives. Field 15,
formalwear ownership, is reasked every season rather than carried. All three
appear under season facts.

**Kit is three things, and none of them is durable.** The workshop has Stewart on
it directly — _"ties and socks is a big issue for us… we want the guys in their
game socks at the first \[game\] and so we make concessions with them and give it
to them before they pay us"_ — and the season's kit handover falls in weeks two
or three. So: **formalwear ownership** is a seasonal fact this mission records
and the club reasks each season; **kit handover** is Mission 7's onboarding item
3; **inventory and distribution tracking**, which is what Stewart actually wants,
is excluded from Release One by the manifest §8 and has no home yet.

**A note this mission owes Mission 7.** Task 10's item 3 currently reads
"returning **not applicable** if kit ownership already recorded". Reasking every
season removes that carve-out, and it also matches Task 10's own R1b — the full
checklist regenerates for everyone every season, _"it's not about the person,
it's about the president"_. Recorded here so Mission 7's intake reconciles it
rather than being contradicted silently.

## The pipeline status — rebuilt, 2026-08-26

Task 08 listed "membership status + dates" as one field. It is not one field, and
the vocabulary underneath it was wrong. Both are corrected here by owner
decision.

### One status, two records

Brian: _"there's one status that should tell us what the player is at, and it
drives the entire thing."_ The frozen model refuses to store it that way, in the
migration's own words — _"modelling recruits as provisional memberships would
pollute the roster with people who never commit; a separate funnel record keeps
the roster meaning 'people on the team'."_

Both hold: **one status the operator sees, assembled from two records.** While
somebody is a recruit the status comes from the prospect record; from the flip
onward it comes from the membership. The People surface shows the unified ladder;
the roster still means people on the team.

| Shown          | Lives on                                   | Means                                                                                                                        |
| -------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **Recruit**    | prospect record, Mission 6's stage beneath | In the recruitment line. Special rules: one message ever, no chase, polite nudges only, and their own information-gathering. |
| **Onboarding** | membership                                 | Things need doing. Flippable to active at any moment; nothing about the checklist gates it.                                  |
| **Active**     | membership                                 | On the team.                                                                                                                 |
| **Inactive**   | membership                                 | Still on the team. Used when the club thinks they may come back.                                                             |
| **Departed**   | membership                                 | Gone, and not coming back. Struck off the team, and an offboarding runs on them.                                             |
| **Archived**   | membership                                 | Catch-all; season close puts them here.                                                                                      |

### Struck from the enum

- **`carried_forward`** — Brian: _"doesn't mean anything to anyone… we already
  have a field that says if the player is returning or new."_ True: `entry`
  carries exactly that. The `carried_forward_from_id` linkage column is a
  different thing and survives untouched for Mission 11's rollover.
- **`confirmed`** — the _action_ of saying "yes, we want him", not a state
  anybody rests in. Task 10 R5 had already reached this independently. The
  `confirmed_on` date survives as a milestone.
- **`withdrawn`** — the schema defends it as _"a truthful terminal exit for a
  committed recruit who never activated… it must never look like a departed
  player"_, but under this shape that person is `declined` on the prospect record
  and never receives a membership at all. It has no job left.

Eight values become five.

### Two consequences recorded as decisions, not edits

**This supersedes OD-3.** That decision, resolved 2026-08-18, confirmed
single-inactive offboarding: every exit records as `inactive`, reason as data,
with `withdrawn` and `departed` unused. The ladder above gives `inactive` and
`departed` distinct operational meanings — may come back versus gone — so OD-3 is
superseded by dated owner decision, 2026-08-26, not quietly overwritten. Brian:
_"Okay, yes, we're superseding that, and that should be decided."_

**This is a vocabulary change to the frozen conceptual model**, and it reaches
further than anything else in this mission: `membership_status` is consumed by
event audiences, the weekly report, the roster and Mission 4's messaging.
Postgres cannot drop enum values in place, so it is a new type and a data
migration. Brian, on being told: _"Yeah, I know it's a data migration, but it's
fucking wrong, so what else are we going to do?"_

## Season facts

| #   | Field                     | This mission | Surfaces                 | Owner and notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------- | ------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 17a | Pipeline status           | **build**    | roster grid · player     | The five-value ladder above. Replaces the eight-value enum.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 17b | Milestone dates           | display      | player detail            | `confirmed_on`, `activated_on`, `departed_on`, `expected_return_on`. Four separate facts, not "dates".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 17c | Exit labels               | display      | player detail            | `departure_reason` and `inactivity_label`. Optional, non-medical, four-role restricted free text under Task 07's discipline.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 17d | Status history            | **build**    | player detail (`W8`)     | `season_membership_status_events` — from, to, when, who, why. Append-only. This is what `W8` shows and what makes every transition answerable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 18  | Entry (new/returning)     | display      | roster grid · player     | Already shipped, and now the only place the returner fact lives.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 19  | Positions (O/D/ST)        | display      | roster grid · player     | Mission 9 owns the semantics; substrate exists. Placement only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 20  | Jersey numbers            | display      | roster grid · player     | **Not one value.** Two kits (Blue and White) with separate allocations; a player may hold **several numbers in one kit** — ~8% do; numbers are **not unique**, with at least three collisions in the real data; plus a predominant designation and a notes field. Mission 9.                                                                                                                                                                                                                                                                                                                                                                                 |
| 21  | Coach group / resp. coach | elsewhere    | —                        | Mission 9. **No substrate on `main`**, so it does not render at this mission's acceptance.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 22  | Onboarding items          | display      | roster (n of m) · player | Mission 7 owns behaviour; substrate exists. Per-item provenance shown; the roster filter is built here.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 23  | Availability (G/O/R)      | display      | roster (gated) · player  | Mission 9 owns behaviour. Rendered only for roles holding availability read — moot while the roster is four-role, but the mechanism is built.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 24  | Eligibility records       | display      | player detail            | **Mission 11**, not Mission 7 — Task 10 R1 explicitly kept eligibility out of onboarding. Needs no further breakdown: competition, status, determining authority, checked-at, an external evidence reference (never academic or medical evidence, by design), effective dates, and an exclusion constraint against overlapping records for one competition.                                                                                                                                                                                                                                                                                                  |
| 25  | Consent & preference      | elsewhere    | —                        | Missions 7 (capture) and 8 (policy). **No substrate on `main`**, so it does not render here.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 26  | RSVP / attendance         | display      | player detail            | Mission 2, shipped. Read-only operational history.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 8   | **On WhatsApp**           | elsewhere    | —                        | **Moved and made concrete 2026-08-26.** Not an abstract "channel presence" but the one channel that decides whether the club can reach somebody: are they on WhatsApp and in this season's group. Email is assumed — everyone has one, and it is already a durable contact point above. Built in Mission 6, since Task 09 D3 fires the community-group invite at every recruit door, and extended by Mission 7. Anchored to person and season, so recruits are covered without a membership. **Presence is not consent** (Task 08 row 8, explicitly): it records where somebody already is, never that they agreed to be messaged. That remains Mission 8's. |
| 15  | Formalwear ownership      | **build**    | player detail            | **Moved to seasonal 2026-08-26** — reasked each season rather than carried. Tie, bowtie, socks; prices the subs invoice at zero when already owned. Measured tie 79%, bowtie 31%, socks 93%; one value is free text (`Yes (paid)`), not boolean.                                                                                                                                                                                                                                                                                                                                                                                                             |
| 16  | Half/Full Blue awarded    | **build**    | player detail            | **Moved to seasonal 2026-08-26.** An award happens in a season, so it is two flags on the season record rather than the inventory's only cumulative count. The running total derives.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## Recruitment facts — never in Task 08's inventory

Task 08 §1 pushed recruitment out to Task 09 and Task 09 never listed the fields,
so they appeared in no inventory anywhere. They exist on `main` in
`recruitment_prospects`, keyed person-and-season exactly as a membership is.

| Field                    | This mission | Surfaces             | Owner and notes                                                                                                                                                                                                                                                                                        |
| ------------------------ | ------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Prospect status          | display      | People list · person | Mission 6 owns the stages and every transition. This mission shows **that** somebody is a recruit and where they stand — a person with no visible standing is a name floating in a list.                                                                                                               |
| Source (which door)      | display      | person detail        | Mission 6.                                                                                                                                                                                                                                                                                             |
| First contact date       | display      | person detail        | Mission 6.                                                                                                                                                                                                                                                                                             |
| Committed date           | display      | person detail        | Mission 6.                                                                                                                                                                                                                                                                                             |
| Prospect notes           | elsewhere    | —                    | Mission 6. Operator prose, four-role only, deliberately never scored fields. The recruits list is where they belong.                                                                                                                                                                                   |
| Conversion link          | display      | person detail        | Mission 6. How a prospect record joins its membership.                                                                                                                                                                                                                                                 |
| **Recruit-stage fields** | elsewhere    | —                    | **Nobody has ever written these down.** The 8/5 staged model's football background, experience and gear ownership: Task 08 §4 pushes them to Task 09, Task 09 references and never lists them, and the 2026-08-26 amendment defers enumeration to Mission 6's intake. Recorded here so it is not lost. |

## Derived

| Derivation                | From                                        | This mission | Surfaces                 | Owner                                                                           |
| ------------------------- | ------------------------------------------- | ------------ | ------------------------ | ------------------------------------------------------------------------------- |
| Alumni standing           | Membership history + `past_member_override` | **build**    | People list · person     | This mission (`W1`).                                                            |
| Under-18 flag             | Date of birth                               | **build**    | person · player detail   | Derivation here; Mission 8 owns the handling, which is deferred.                |
| Half/Full Blue totals     | The per-season awards above                 | **build**    | person · player detail   | This mission. The count the club actually looks at, derived rather than stored. |
| Onboarding completeness   | Onboarding items                            | display      | roster (n of m) · player | Mission 7.                                                                      |
| Constitutional membership | Subs paid + the existing derived view       | display      | player detail            | Governance derivation; already a view on `main`.                                |

None of these is ever manually edited. The alumni override is the single
deliberate exception, and it overrides the derivation, not the fact.

## The decision this table surfaces

**Nobody has ever written down which fields are required.** The roster's
missing-data flag, `W7`'s queue and Mission 7's item 9 rollup all depend on a
required set, and Task 08 §5 refers to "missing required data" without naming it.
Task 11 §2.1 says coaches and committee members are chased for contact points
"and academic fields **where applicable**", which implies required-ness differs by
who the person is but never says how.

**Recommendation — required-ness depends on where the person stands on the
ladder:**

| Person                                    | Required                                                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Onboarding, active or inactive            | First name · mobile · personal email · college · matriculation year · expected graduation · degree field · DOB · emergency contact |
| Recruit                                   | First name · mobile — Task 09 D2's minimum at every door, and nothing more is chased of them                                       |
| Everyone else (coach, committee, alumnus) | First name · mobile · personal email                                                                                               |

Last name is deliberately **not** required — a quarter of real records are
first-name-only, and flagging them all would make the queue useless on day one.
Aliases and Blues are recorded when known and never chased. Formalwear is asked each season through Mission 7's checklist, not through this queue.

## Brian approval

- Exact words: "Approved let's move on."
- Date: 2026-08-26
- By: Brian Schuster

Approved after seven working rounds that changed it materially: name labels
corrected to the shipped screen wording; emergency contact expanded to five
fields; kit separated into three things, none of them durable; Blues moved to
seasonal awards with the total derived; known-as collapsed into alias; channel
presence made concrete as **On WhatsApp** and moved to Mission 6; formalwear
moved to seasonal; eligibility corrected to Mission 11; membership split into
its four real parts; jersey remodelled against the source data; the recruitment
facts added, which no inventory had ever carried; and the pipeline status
rebuilt from eight enum values to five, superseding OD-3.

Also approved with it: the required set, keyed to the ladder — a recruit needs
only first name and mobile, because nothing more is ever chased of them.
