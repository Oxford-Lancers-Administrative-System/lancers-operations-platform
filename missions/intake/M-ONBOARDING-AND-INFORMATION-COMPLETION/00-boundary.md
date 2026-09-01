# Boundary — M-ONBOARDING-AND-INFORMATION-COMPLETION

- Portfolio mission number: 7 (Release One Mission Portfolio **v2**, restructure approved by Brian Schuster 2026-08-26; a v2 layer with no v1 predecessor row)
- Commissioned outcome and subject: **Onboarding** — member setup from "they're in" to active. One subject-matter lifecycle: everything that happens to a person between the confirm action and the day the club stops chasing them for anything.
- Portfolio row URL and observed version:
  [Release One Mission Portfolio, row 7](https://app.notion.com/p/3bb488886d578126a88cdd747f590a01)
  — Portfolio v2, page last verified 2026-08-31 20:56 EDT, fetched 2026-09-01T00:59Z
- Observed `main` SHA: `332bc6b3ba3028f1b79d99fc59dc1417791c2d81`

## Existing application baseline and locally rendered routes

Read from `main` at `332bc6b`. Local rendering with synthetic data happens per
screen at Stage 3 through `npm run intake -- shoot`, which needs a database
lease; nothing below is asserted from a photograph yet.

**Onboarding as shipped in the vertical slice (LAN-74/LAN-75) — this mission's
own inheritance, and thin:**

- `onboarding_item_types` (per season: `code`, `label`, `is_required`,
  `is_subscription`, `sort_order`) and `onboarding_items`
  (`supabase/migrations/20260810120500_domain_squad.sql`).
- `onboarding_item_status` is **`pending → invited → complete | waived |
not_applicable`**. There is **no `claimed` state**, no per-item history, no
  provenance, and no verification class anywhere in the schema.
- `onboarding_items` stores current state only, plus `completed_on`,
  `waived_reason`, `waived_by_person_id` — and a constraint
  (`onboarding_items_waiver_is_justified`) makes a waiver reason **mandatory**,
  which Task 10 R2-R has since superseded.
- `generateOnboardingItems`, `resolveOnboardingItem` and `setMembershipStatus`
  in `src/lib/services/membership.ts`; the checklist renders on the player
  record (`src/lib/services/player-record.ts` → `onboardingItems`).

**Mission 5 · People & Roster, delivered at development level (not deployed):**
the person substrate and the five-value `membership_status`
(`onboarding · active · inactive · departed · archived`; Recruit is not one of
them and lives on `recruitment_prospects`) —
`supabase/migrations/20260828120000_person_substrate.sql`. Surfaces:
`/operate/people`, `/operate/people/[personId]`, `.../edit`, `.../merge`,
`/operate/people/new`, **`/operate/people/missing`** (the missing-data queue,
`listMissingDataQueue`), `/operate/roster`, `/operate/roster/[membershipId]`,
`/operate/roster/new`. The required-field set by status lives in
`src/lib/services/person-required.ts`.

**Mission 6 · Recruitment: schema only so far.** PR #124 landed
`recruitment_prospects` and its seven-value ladder, prospect notes and status
history, `recruitment_questionnaire_responses`, `recruitment_signup_codes`, the
recruit ladder columns on `messaging_schedules` — and, materially for this
mission, **`season_messaging_consents` already exists on `main`**
(`messaging_consent_state`: `never_asked · asked · granted · refused ·
withdrawn`; `messaging_consent_source`: `qr_self_entry · walk_up_read_back ·
operator_recorded`; one row per person per season). Its own comment records
packet amendment 1 (Brian, 2026-08-31): granted consent "carries a person from
recruit through onboarding to player with no second ask; each new season is
re-approved." LAN-202–206 — including the recruit signed-link substrate this
mission extends — are Backlog; LAN-200 is In Review.

**Mission 4 · Communications, delivered:** `messaging_schedules` and the chase
machinery, `/operate/admin/messaging`, `/operate/admin/follow-ups`, the five
delivery states, `/api/scheduler/messaging`, `/api/webhooks/whatsapp`.

**Player-facing signed links today:** `/me/[token]` (player home, RSVP),
`/e/[token]`, `/a/[token]` (event question answers), `/rsvp/[token]`. **No
collection form of any kind exists**, and there are no player logins by design.

**Two absences that shape this boundary:** `src/lib/services/seasons.ts` only
_reads_ a current season and its terms — **nothing anywhere creates a season**.
And a general CSV dialect module (`src/lib/services/csv.ts`, from the event
import) already exists and is reusable for a person import.

## Owned end-to-end

Owner direction of 2026-09-01 (Brian) governs this section; it replaces the
first draft's list, removes the coach and committee welcome flow, and settles
the season question.

1. **CSV import and carry-forward — always into the season the roster is in
   now.** The import inherits the current season; it never asks which one and
   **never creates one**. A fresh durable record per season, a full checklist,
   nothing inherited from last year.
2. **One welcome message, identical for everyone.** "Welcome to the team,
   2026–27" plus the form. The same template for a recruit who was just flipped
   and for a returner who just arrived by import — it does not vary by door.
   Sent as a template, which the club may do wherever it has a number.
3. **The dispatch refuse-without-basis check**, with the welcome as its single
   permitted exception — the one message the club may send in order to obtain
   the agreement it otherwise requires.
4. **Onboarding memberships count as players for event audiences.** Onboarding
   is a status describing what has been filled in, not a waiting room: they are
   invitable from the moment they are on the team.
5. **The form itself** — what it asks, what it looks like, and how it adapts to
   what is already on record. A person with everything recorded confirms it; a
   person with gaps fills them. Defining this is a principal job of the
   mission.
6. **Seasonal consent, re-ticked by everyone, every season.** The personal-
   information form _is_ the consent board. Step one is the tick; a recruit who
   consented at last season's door ticks again this season. Within a season the
   recruit-door grant still carries, so nobody is asked twice in the same year.
7. **Consent is one-way on the player's side, and an operator can switch it
   off at any time.** Once a player submits, their own form offers no way to
   untick — nobody switches off their own consent while updating a phone
   number. When somebody asks the club to stop, an operator flips it off as
   part of the person's status, at any point, on request. Owner decision,
   2026-09-01: _"the player can't untick on their face"_ and _"they should be
   able to go and flip it off at any point."_
8. **The twelve-item checklist** — the Task 10 §3 inventory, regenerating in
   full for everyone every season.
9. **`claimed`, provenance, per-item history, and reason-free waive and
   reopen** — none of which exists in the shipped schema, and the last of which
   a live database constraint currently forbids.
10. **Formalwear asked again each season** — the returner carve-out is removed.
11. **One compiled ask per person, ever** — everything outstanding in a single
    signed link; new things join the open ask instead of starting a second.
12. **Onboarding's own messaging cadence**, alongside the recruit ladder
    Mission 6 added to the messaging-schedule surface: on being onboarded, what
    goes out, what the follow-ups are, and what each item's chase looks like.
13. **Exhaustion, then a human** — the chase stops permanently, marks the
    person for human follow-up, and messages the President's office with a
    count and a link, never names.
14. **A player's answer never silently overwrites** an operator-confirmed,
    externally verified or derived value; it raises `disputed — awaiting
verification` into Mission 5's queue instead.
15. **A person fixing their own details** through the same signed link — the
    club's whole answer to self-service, since there are no player logins.
16. **Activation flips them to active.** A human declaration by the core four,
    nothing more elaborate.
17. **A sectioned activity log** — per section, how many times a person has
    been asked and how many times it came back, so the record answers "how
    often have we chased him about this?" rather than only "have we messaged
    him?".
18. **Per-season configuration** — which items apply, their labels and
    verification classes, set by the four-role group; and the onboarding
    cadence values, structured so a future admin surface is a UI over them.

### Removed from the first draft by the 2026-09-01 direction

- **The coach and committee welcome flow.** "Onboarding should really just be
  onboarding a player onto the team." A coach is not on the roster — they are
  added to the page — so their onboarding is handled with the coaching work in
  Mission 9. **This deviates from portfolio row 7**, which names the
  role-appropriate coach/committee welcome flow as built here; the row needs
  amending at closeout.
- **The minimal season bootstrap.** Season creation belongs to a later mission.
  The import inherits the roster's current season rather than opening one, so
  nothing here creates a season and the earlier portfolio deviation recorded by
  Mission 5's intake is withdrawn rather than executed.

### Preconditions this mission does not own

- **The precondition this mission does not own.** `readCurrentSeason` throws
  when no season exists, so the roster already requires one. Mission 7 inherits
  that precondition; it does not fill it.

## Shared coverage and adjacent-mission seams

| Seam                                           | This mission's side                                                                                                                      | The other side                                                                                                                                       |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mission 5 · People & Roster**                | The item states, request state, activity log and chase this mission produces                                                             | The missing/disputed queue, the required set, the person record and roster surfaces that display them, roster filtering by item status, person merge |
| **Mission 6 · Recruitment**                    | Extends the compiled signed-link substrate with the onboarding field set; inherits the operator message-and-flag surface built at its W9 | The recruit ladder, the recruit-door consent grant that carries through the season, the parked-capture queue, the substrate itself                   |
| **Mission 4 · Communications**                 | The onboarding/consent message class, its cadence, caps and escalation content                                                           | Transport verbatim: five delivery states, template-only production sends, retry, the scheduler, the shared chase list                                |
| **Mission 8 · Consent, Privacy & Data Rights** | **Capture mechanics only** — states, timing, the record, the per-season re-ask, showing the policy at the point of collection            | Policy, wording, versioning, retention, correction policy, subject-access export, under-18 handling                                                  |
| **Mission 9 · Football Assignments**           | The item machinery, available to reuse                                                                                                   | **All coach onboarding**, welcome flow included (2026-09-01)                                                                                         |
| **Mission 10 · Leadership Reporting**          | The queue content and exhausted-chase exceptions                                                                                         | Their Monday-review surfacing                                                                                                                        |
| **Mission 11 · Season Lifecycle**              | Import and carry-forward as the interim arrival path                                                                                     | Rollover, which supersedes it; the season-boundary checklist reset                                                                                   |
| **Mission 3 · App Shell**                      | Requiring the privacy policy at every point of collection                                                                                | The rendering surface itself                                                                                                                         |

**The one provisional handoff, and why it does not block.** Mission 8 has no
packet, and this mission captures consent under Mission 8's policy. This
mission stays independently walkable because it owns the whole mechanism — the
consent record, its states and sources, the season re-ask, the enforcement
check, and the point-of-collection policy slot — while the _words_ in that slot
are a versioned template value supplied by Clint through Task 07. Brian can
walk every workflow end to end with placeholder wording in a real versioned
slot; no Mission 8 decision changes a state, a transition, a surface or an
acceptance here. If that stops being true at any workflow, it returns to Brian
rather than being assumed away.

## Administration/configuration owned here

- Per-season onboarding item-type configuration by the four-role group: which
  items, their labels, tracking flag, verification class, applicability.
- The onboarding cadence, gap and cap values — version-controlled in Release One,
  but structured so LAN-106's committee-editable surface is a UI over it rather
  than a rework (the owner's recorded dissatisfaction with the repo-central
  home, Task 11 §3).
- The configured escalation office, initial value President.

## States and failures owned here

Unreachable player (no automatic timeout ever removes anyone) · terminal
delivery failure → escalation-only, no automated email, and the cap unburned ·
per-fact `refused`, which stops the chase for that fact and stops it counting,
but stays visible until a human reopens or waives · `unmessageable` (consent
declined, withdrawn, or no outbound) · `exhausted — human follow-up` ·
`disputed — awaiting verification` · already-complete link · expired/revoked
link showing a uniform invalid page with no information leakage · empty
item-type configuration · no current season · an active player with an
unfinished checklist, which is the normal case and not an exception.

## External tools and this mission's interaction with them

WhatsApp through Mission 4's pipeline, unrespecified and never bypassed;
LAN-93 delivery callbacks are a stated dependency of Delivered-only cap
counting, not an option. Where a verified personal email exists, collection
requests adopt Shape B (Resend) automatically — noting the bootstrap
circularity that the missing datum is frequently the email itself. BUCS Play,
Hudl and BPS are off-system facts recorded as items and confirmed by named
humans; the club integrates with none of them. No photo or media is ever
stored — the squad photo is a checklist tick.

## Grounded additions and gaps resolved here

- **The form as the consent board** (2026-09-01): the seasonal personal-details
  check and the consent tick are one artifact and one first step, not two
  moments. Task 07 and Task 08 describe consent capture and information
  collection separately; this mission builds them as one screen.
- **The sectioned activity log** (2026-09-01): counted per section, so the
  record shows how often a person was asked about a thing, not only that they
  were messaged.
- **A person editing their own record** (`OS-self-service-to-m7`), where
  Mission 5's operator correction path was explicitly the interim answer.
- **The `claimed` state, item history and provenance**, absent from the shipped
  schema and required by Task 10 §4.
- **The per-player activity log** — LAN-105, its old Post-MVP home, is Canceled,
  so this is its only home.
- **The audience-derivation change**, flagged by Task 10 R6 for forward
  reconciliation and never separately authorized until now.
- **Superseding the shipped mandatory waive reason**, a live database
  constraint that contradicts an approved owner decision.

## Out of scope

Consent wording, versioning, retention, correction policy, subject-access
export and under-18 handling (Mission 8; wording is Clint's through Task 07) ·
competition-eligibility records (Mission 11) · season rollover and the
season-boundary checklist reset (Mission 11) · all coach and committee
onboarding, welcome flow included, and football assignments (Mission 9) · the recruitment funnel, its doors and its
ladder (Mission 6) · any chase of a recruit at all (dissolved by the 2026-08-25
owner decision) · the event-RSVP reminder stream (Mission 4 / Task 03) · the
Monday report's own evolution (Mission 10) · real data, hosted cutover and
production activation (Tracks A and B; LAN-86, LAN-101, LAN-126) · bulk legacy
import beyond the approved CSV path · player logins, in any form ·
**creating a season**, which the import inherits rather than performs.

- Split decision: **no split.** One subject, one lifecycle, one testable
  workflow set. Tasks 10 and 11 are two halves of a single journey — the
  checklist is what is outstanding, the chase is how it gets collected — and
  splitting them would put the trigger contract and its consumer in different
  packets for no safety, authority or acceptance gain.
- Boundary approval covers: the complete proposed boundary above as one decision
- Brian approval words: "All right, cool. I think the boundary makes sense here. Let's go to the next stage."
- Approval date: 2026-09-01
