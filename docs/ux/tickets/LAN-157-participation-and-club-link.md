# LAN-157 — Who was asked, what they said, who turned up, and the club link

Status: workflow direction approved by Brian on 21 August 2026 — _"Sure, I think
that looks fine."_ and _"let's close this out and do the next one."_ — after one
round of six corrections. Verify against the current live Linear issue before
implementation.

> **Synthetic scenario data:** All displayed people, contact details, statuses,
> responses, and attendance records are synthetic and do not correspond to real
> members.

Work package `WP-participation-club-link` of mission
`M-EVENTS-CALENDAR-TARGET-STATE`, workflow `W7`. Controlling sources: Events &
Calendar brief D2, D3, D62–D65, D68, D71–D74, D81; §4.3, §4.5, §4.15; inventory
amendment 1;
[`missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/workflows/W7-see-who-is-coming-and-who-turned-up.md`](../../../missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/workflows/W7-see-who-is-coming-and-who-turned-up.md)
and its five-screen mockup.

## Purpose

Answer, in one table, the question the club actually asks about an event: **who
was asked, what did they say, and did they come?** Plus one link, so the answer
can be shared with the squad without giving anybody an account.

Shared vocabulary, authorization, responsive behaviour and cross-ticket states
are defined in [`../slice-ux.md`](../slice-ux.md) and
[`../standards.md`](../standards.md) and are not duplicated here.

## Owned screens and routes

| Screen  | Route                          | Audience                                     |
| ------- | ------------------------------ | -------------------------------------------- |
| `W7-01` | `/operate/events/[id]`         | Any general operator — before the event      |
| `W7-02` | `/operate/events/[id]`         | Any general operator — after it              |
| `W7-03` | `/e/[token]`                   | **Anyone holding the club link.** No account |
| `W7-04` | `/operate/events/[id]?share=1` | An operator with `event_calendar_management` |

The collapsed Questions section lives on `/operate/events/[id]` alongside the
table; it is not a screen of its own, for the reason Brian gave about question
authoring — _"it's ingrained in the process"_.

`W7-05` is the mockup's states panel and is not a screen: each of its four
states is one of the above in a particular condition.

## Wireframes

The approved artefact for this workflow is the mission mockup rather than an SVG
pair, and it carries both presentations side by side:
[`W7-see-who-is-coming-and-who-turned-up.html`](../../../missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/mockups/W7-see-who-is-coming-and-who-turned-up.html)
— desktop 1280 and 375px, current build against proposed, for all five screens.

## This ticket builds

- **The participation table.** One row per person: name, capacity, invitation
  sent, delivery (operator only), answer, reason, attendance, and **one column
  per event question** (D68).
- **A collapsed Questions section on the event page, showing counts** — D68's
  other reading place. Counted from the rows the table already holds, so the two
  cannot disagree, and honouring `applies_to_capacities`: a null from somebody a
  question does not apply to means "not applicable to this invitee", never "no
  answer", so those people are outside the denominator.
- **Sortable on every column** (§4.5), including the question columns.
- **Filterable** by name, capacity, answer, attendance, and — at the operator
  tier — delivery. The filters combine and apply as you type.
- **A discrepancy marker** where RSVP and attendance disagree (D64), never
  auto-reconciled.
- **The club link**: an operator issues it, copies it, and shares it. Signed,
  not guessable (D81); carries the table without the delivery column (D3).

## Explicitly not in this ticket

- **Taking the register.** Task 04 owns the board; this owns how what it
  collected is read.
- **The headline numbers and the register's buffer.** Those are LAN-152's and
  are reused, not rebuilt.
- **Delivery detail.** A state and a link out, both operator tier (D65); the
  delivery page is Mission 4's.
- **Chasing anybody.** Seeing that eight people have not answered is not the
  same as doing something about it.
- **Revocation, expiry or rotation of the club link.** Q2 is a nonblocking
  unknown the owner chose to settle by testing. The link ships without
  revocation; adding it is additive.

## The tiers

| Tier          | Sees                                                                   |
| ------------- | ---------------------------------------------------------------------- |
| Public        | The event's own facts. **No people, ever**                             |
| **Club link** | The three numbers, the table, the answers, the reasons, the attendance |
| Operator      | Adds the delivery column, the joining URL, and every action            |

**Delivery is the only operator-locked element of the table** (D3), and the
approved mockup gates exactly one `<th>` on the tier. The **Reason** column is
present at both tiers: `${operator ? "<th>Delivery</th>" : ""}` sits in the same
line as an ungated `<th>Reason</th>`, and REQ-three-tiers says delivery is the
only element the middle tier loses. W7's prose tier table also lists "the
private reason detail" as operator-tier; where the two disagree the live issue
and the approved mockup win, and this is recorded as a deviation worth Brian's
eye rather than resolved silently.

**Authorisation is enforced in the service layer, never by route visibility.**
`src/lib/services/participation.ts` has three entry points and each resolves its
own actor: the operator read asks `requireGeneralOperator()`, the club-link read
resolves the **token** and consults no session, and issuing asks for
`event_calendar_management`. The two payload types differ structurally — the
club-link person has no `delivery` field and the club-link event has no
`joiningUrl` key — so neither can reach that tier by a rendering mistake.

## Ticket interaction contract

- Implement every owned screen and the loading, validation, error, success,
  completed, empty, and unauthorized states that apply under the shared
  contract.
- Preserve the desktop and phone information hierarchy shown in the mockup. At
  375px the table becomes one card per person and **carries every fact the
  desktop row does** — reflow may not remove required information.
- **A filtered-empty table and an empty one say different things**
  (`slice-ux.md` § 9).
- Do not add a role, tier, column, filter or action without a recorded decision.
- The copy rule, from Brian, five times on this mission: the application says
  what a control does and what its consequence is. It never explains its own
  design, never justifies a default, and never instructs the operator to use a
  different field.
- In implementation review, provide LAN-157, the implemented screen IDs, desktop
  and 375px screenshots, acceptance-criteria results, and every deviation.

## Acceptance criteria

- One row per invited person and per walk-up, carrying capacity, invitation
  time, answer, reason, attendance and one column per question.
- Answers are read in **two** places: counts in a collapsed Questions section on
  the event page, and one column per question in the table. The counts exclude
  anyone the question does not apply to, and exclude walk-ups.
- Every column sorts, and a sort carries the current filters.
- Each of the five filters narrows the rendered rows, and they combine.
- A club-link reader sees the table **without** the delivery column; an operator
  sees it with. Asserted on the payload, not on the rendered text.
- No club-link response carries an online event's joining URL, in the page or in
  any payload behind it.
- An anonymous request for the event returns no person, no answer, no attendance
  and no question response.
- A discrepancy between RSVP and attendance is marked and never
  auto-reconciled — and the marker is present during the session, not only the
  day after.
- A walk-up appears without an invitation and without an answer.
- Sharing offers the link and nothing else. There is no send-to-WhatsApp,
  because the club cannot message groups.
- The club link is signed rather than guessable, stored only as a digest, and is
  the **same** link each time an operator opens the dialog.

## The two delegated determinations

- **Q4, the discrepancy marker's shape.** **Derived** from the two columns, and
  rendered as `≠` beside the name carrying what the two records say. The
  approved mockup derives it and marks a case the stored view does not classify;
  the stored view flags nothing until the event's date has passed, so a derived
  marker is the only one present while the register is being filled; and a
  derived marker has no row to auto-reconcile. `src/lib/services/participation-view.ts`
  carries the reasoning next to the function.
- **Q5, players and coaches as separate sublists.** **One list, with capacity as
  a sortable column and a filter**, until the club asks otherwise. Owned by the
  club, not by Brian.

## Deviations from the approved mockup

1. **The share dialog's second paragraph is not shipped.** The mockup carried
   "It is a private link, not a secret one — a squad list is not a secret from
   the squad. Share it where you would share the squad." That is D81's
   _reasoning_, and reasoning is the copy shape Brian has rejected repeatedly on
   this mission. The dialog keeps the sentence that states the consequence.
2. **`Showed / Invited` reads `— / 47`, not `NA / 47`.** LAN-152 owns that
   formatter and shipped the dash; W7 records both spellings, and the approval
   note says `NA`. Reusing LAN-152's formatter is what keeps the event page and
   the club link identical (`standards.md` rule 7), so the spelling is reported
   rather than changed here.

## Decision history relocated from source (LAN-300)

### src/app/operate/events/[id]/club-link-actions.ts — module header

> Issuing the club link — §4.15, inventory amendment 1. LAN-157.
>
> ## Why issuing is an action and reading is not
>
> Opening **Share link** must not write. An operator looking at what they
> already shared is reading, and a page render that minted a token would put a
> row in `club_link_tokens` every time somebody glanced at the dialog. So the
> dialog reads the live link, and this action exists for the one case where
> there is not one yet.
>
> ## Where the refusal is
>
> In the service, which resolves the operator from the verified session and
> asks for `event_calendar_management`. This file passes no actor: a server
> action is a POST endpoint anybody with a session can call, and an action that
> accepted "who am I" as a form field would accept whatever the browser sent.
>
> ## What it never does
>
> Revoke, rotate or expire. Q2 is a nonblocking unknown Brian chose to settle
> by testing, and this ships without revocation — `club_link_tokens.revoked_at`
> is there so that settling it later is additive.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/discrepancy-vocabulary.ts — file header

> The two vocabularies for "RSVP and attendance disagree", and where they
> differ — D64, W7, LAN-157 (correction R157-B3).
>
> ## Why this module exists rather than a comment
>
> There are two of them, they are not the same set, and until this file they
> were spelled out in two places that no reader of the other would find. The
> participation table derives its marker in TypeScript
> (`./participation-view.ts`), and the database classifies its own in
> `public.rsvp_attendance_mismatches`. One shared class was spelled
> `said_no_attended` here and `said_no_but_attended` there: near-identical,
> non-identical, and a future join or report mapping would have missed it in
> silence. The stored spelling is the durable one — it is in shipped
> migrations and cannot be renamed without one — so TypeScript moved to it.
>
> ## The divergence, stated once
>
> The derived set is **not** a subset and **not** a superset of the stored one.
>
> | Class                             | Stored view | Derived marker | Why                                        |
> | --------------------------------- | ----------- | -------------- | ------------------------------------------ |
> | `said_yes_marked_absent`          | ✅          | ✅             | the shared case, spelled identically       |
> | `said_no_but_attended`            | ✅          | ✅             | the shared case this correction re-spelled |
> | `said_yes_no_attendance_recorded` | ✅          | ❌             | deliberately excluded — see below          |
> | `attended_without_invitation`     | ✅          | ❌             | deliberately excluded — see below          |
> | `never_answered_attended`         | ❌          | ✅             | the view does not classify it at all       |
>
> **`said_yes_no_attendance_recorded` is excluded** because a person who said
> yes and is not on the sheet is not a disagreement — it is an absence, and the
> club already has a word for it: _not recorded_. That is LAN-152's rule, and
> it is the same rule one row at a time: a half-filled register must not accuse
> the half nobody has reached yet.
>
> **`attended_without_invitation` is excluded** because on this table it is a
> walk-up, and the row already says so twice — the Capacity column reads
> **Walk-up** and the Invitation column reads "—". A third marker beside the
> name would be noise, and the approved mockup leaves Wilfrid Danecroft
> unmarked.
>
> **`never_answered_attended` is added** because the approved mockup marks
> Cassian Wolvercote — never answered, then present — and the stored view emits
> no class for that combination at all. Reading the view would therefore not
> have reproduced the screen Brian approved.
>
> ## Neither set is authoritative over the other
>
> They answer different questions. The view answers "what did the season's
> completed events disagree about?" and is bounded by `occurred_events`, whose
> `scheduled_on < today` term means it emits nothing on the evening of the
> event — exactly when the register is open and a coach would notice somebody
> who said no standing on the pitch. The derived marker answers "what do these
> two records say about this person, right now?" and has no date term.
>
> Changing the view is a migration and belongs to whoever owns the reporting
> question. Nothing here touches it.
> What `public.rsvp_attendance_mismatches.mismatch` can hold.
>
> Kept in this file's own words rather than generated, because the view is SQL
> and there is nothing to generate from. It is pinned to the shipped migration
> by `./participation-view.test.ts`, so a fifth class added to the view without
> a look at this file fails a test rather than drifting quietly.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/club-link.ts — file header (rsvp-tokens comparison, row id in HMAC input)

> Why this is not `./rsvp-tokens.ts`
>
> The two look alike and are not alike. An RSVP token is bound to **one
> invitation**, answers "who are you", is single-use in spirit, expires when
> the event starts, and is deliberately **unrecoverable**: the plaintext exists
> for as long as it takes to build one URL and is then gone forever, so
> repairing a delivery means issuing a new one.
>
> `club_link_tokens` is a separate table for the same reason, and the migration
> that created it says so: one table holding both would be a single bug away
> from an RSVP link reading a squad list.
>
> Why the row id is in the input
>
> Q2 — expiry, rotation and revocation — is a nonblocking unknown Brian chose
> to settle by testing, and this ships without revocation. Putting the token
> row's own uuid into the HMAC input keeps every one of those additive:
>
> - **revocation** is `revoked_at`, which `resolveClubLink` already refuses;
> - **rotation** is a second row with a different uuid, which derives a
>   different token, with no schema change and no new column.
>
> Deriving from the event id alone would have made rotation impossible without
> a migration, and this package owns no migration.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/participation-view.ts — module header

> The participation table's vocabulary, its shapes, and the two pure functions
> that filter and sort it — W7, REQ-participation-table. LAN-157.
>
> ## Why this is a separate module
>
> The same split `./attendance-vocabulary.ts` makes, for the same reason:
> `./participation.ts` is `server-only` and reaches `pg`, and the filter bar is
> a client component. A client component importing the capacity labels from the
> service would drag the PostgreSQL driver into the browser bundle, and the
> build refuses it in those words.
>
> ## The tier is in the type, not in a flag
>
> `ClubLinkParticipation` and `OperatorParticipation` are two types rather than
> one type with `delivery?: …`, and `ClubLinkEvent` has no `joiningUrl` **key**
> rather than a null one. That is deliberate. The acceptance criterion is that
> no club-link response carries the joining URL or the delivery column "in the
> page or in any payload behind it" — and a field that is never assigned cannot
> reach a payload, whereas a field the component chooses not to render is one
> refactor away from the DOM.
>
> ## What the two types do and do not buy — R157-B5
>
> They stop a _rendering_ mistake: a component holding `ClubLinkParticipation`
> has no `delivery` to print and no `joiningUrl` to leak, and that is real.
>
> They do **not** make the boundary compiler-enforced, and this file used to
> say they did. TypeScript rejects an unknown property only on a _fresh_ object
> literal, and freshness is lost through `.map()` — so adding
> `delivery: person.delivery` to the club-link row literal in
> `./participation.ts` type-checks cleanly and ships the column. What holds the
> boundary is the separate per-tier query, which never selects the column, plus
> the field-by-field reassembly of each row. What proves it is the payload
> assertions in `./participation.test.ts`, which are the only thing in this
> repository that fails when the literal is widened.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/participation.ts — module header

> ## Authorisation is here, not on the route
>
> REQ-three-tiers says so in as many words, and the reason is that a route is
> a URL somebody can type. There are exactly three entry points below and each
> one resolves its own actor:
>
> - `readOperatorParticipation` resolves the operator from the verified
>   session — `requireGeneralOperator()`, which is the floor with the narrow
>   coaching assignment removed (LAN-110). It takes no actor argument.
> - `readClubLinkParticipation` resolves the **token**, and takes no session
>   at all. It cannot return an operator payload: the type it returns has no
>   delivery field and no joining URL.
> - there is no third. The public tier reads events through
>   `./events.ts` and never reaches this module, which is what makes "a
>   public request reaches no person, no answer and no attendance record"
>   true by construction rather than by a filter somebody has to remember.
>
> ## The two payloads are built by two queries, not one query and a filter
>
> `PARTICIPANT_QUERY` is assembled per tier, and the club-link tier's version
> **does not select delivery at all** — no lateral join to `notification_jobs`,
> no state expression, no column. The event facts are the same story: the
> club-link shape has no `joiningUrl` key for a value to be assigned to.
>
> A column that is never selected cannot reach a payload. A column selected
> and then deleted in TypeScript is one refactor from the DOM, and this is the
> mission's most sensitive surface.
>
> **And the types are not what enforce it — R157-B5.** The two payload shapes
> stop a component printing a column it does not hold, which is worth having.
> They do not stop _this_ file widening the tier: TypeScript's excess-property
> check applies to fresh object literals, and freshness is lost through the
> `.map()` in `buildClubLinkParticipationIn`, so adding
> `delivery: person.delivery` there type-checks and ships. The query above and
> the field-by-field reassembly below are the boundary; the payload assertions
> in `./participation.test.ts` are the proof, and are the only thing that
> fails when somebody widens the literal.
>
> ## What this module does not do
>
> **Write anything about attendance or RSVP.** It reads two authoritative
> records and marks where they disagree; `discrepancyFor` is a pure function
> of the pair and there is no path from here to `attendance_records` or
> `rsvp_responses`. D64's "never auto-reconciled" is therefore structural.
>
> **Take the register.** That is Task 04's, on Task 04's surface, and the
> buffer that opens it is `./attendance-window.ts`'s.
>
> **Show delivery detail.** The operator tier carries the five-state column and
> a link out to the delivery screen; the diagnostics behind it are Mission 4's.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/participation.ts — readClubLinkParticipation

> W157-R1 split resolution from the stamp so that concurrent readers of one
> link never queued on that link's row: stamping inside this transaction made
> every reader take the row lock and hold it, with its pooled connection,
> until the participation read committed. Forty simultaneous readers of one
> token filled the pool with waiters and were served Next's own error page.
>
> LAN-269 then took the second phase out of this function altogether. This is
> a `GET`, and a `GET` of a club link is what WhatsApp's and Apple's preview
> crawlers issue the moment the link is pasted into a chat, before any coach
> taps it. Counting those made `use_count` a measure of how often the link
> had been _shared_, which is not the question Q2 asks.
>
> The stamp is now `recordClubLinkUseByToken`, which `/e/[token]` calls from
> a server action once a real browser has run the page. What that costs is
> stated there; what it buys is a read with no side effect at all, which is
> the only version of this function a crawler may safely reach.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.
