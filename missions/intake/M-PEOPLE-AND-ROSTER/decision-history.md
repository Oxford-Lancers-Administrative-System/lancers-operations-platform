# M-PEOPLE-AND-ROSTER — decision history relocated from source

Paragraphs that explained a decision inside a source comment, moved here by LAN-300 so the
source reads as code. Each keeps a one-line pointer at its old location. Nothing here changes
a decision; it records where one was explained.

## src/app/operate/shell-nav.tsx — brand mark, phone top bar (LAN-225 delta S0-d)

> LAN-225, delta S0-d. LAN-195's choice 1 kept this bar to the hamburger
> because the main content's own heading said "Lancers Operations"
> beneath it. Audit B2 removes that heading, so the crest and the name
> move here. Brian may revert to the bare hamburger at visual review.

## src/app/operate/events/presentation.ts — PLAN_MISSING_HEADLINE / PLAN_MISSING_NOTE

> F-A2. Shown instead of the disclosure for an approved event with no
> `event_messaging_plans` row at all — approved before automated messaging
> existed for it, or a fixture deliberately left that way. Without this the
> section was simply absent, indistinguishable from "nothing is due right
> now": the acceptance this answers is that an operator can tell "no
> messages are due" apart from "no messages will ever be sent". Amending the
> event is the repair route `event-amendment.ts` now gives it — see
> `recomputeScheduleOnRescheduleIn`'s F-A2/F-C3 note — so the note names it
> rather than leaving the state a dead end.

## src/app/operate/roster/board-columns.ts — BAND_LABEL_INSET_PX

> The left inset every band header's label sits at — one rule so a fourth
> band inherits it rather than each band cell carrying its own padding (or
> not). Brian's walkthrough of the built board: PERSON sat with this inset,
> ONBOARDING sat flush against its band's left edge with none at all — an
> artifact of the label's `position: sticky` doing double duty as the
> _static_ inset too, which only ever worked for the band immediately after
> the pinned Player column. This is the actual, explicit inset; the sticky
> offset below still uses it too, so the two never drift apart.

## src/app/operate/roster/board-columns.ts — aliases/phoneForCall in redactRow

> Carried unconditionally alongside `displayName`, never as a column of its
> own (LAN186-F1): search has to find a player by an alias regardless of
> which columns this viewer's role grants, exactly as it already finds one
> by display name — an alias is identity data, not a restricted field.
>
> Carried unconditionally, never as a column: the one functional exception
> the workflow itself asks for (voice call, phone's condensed-view-only
> quick action). See the field's own doc comment in `roster-board.ts`.

## src/app/operate/roster/[membershipId]/page.tsx — justCreated / linkedExisting

> LAN-257: what the intake actually did, carried from `confirmationHref`.
> `linked` says an existing person was used rather than a new one minted;
> `unsaved` names the kinds of contact the operator typed that were
> deliberately not written to that person's record. Both are read
> defensively — a hand-typed URL is not evidence of anything.

## src/app/operate/people/presentation.ts — PersonType

> The whole six-rung `Status` ladder collapses to two words here — every
> status but `recruit` itself is somebody the club already has, in whatever
> state; `recruit` is the one rung that is not a club member at all
> (`presentation.ts`'s own module note: "Recruit is not a membership status
> at all"). Brian: "on the player page, I should be able to sort by player
> or recruit so I can easily see it."

## src/app/operate/roster/roster-filters.tsx — module header

> Re-exported so this screen's tests can advance timers by exactly the debounce
> rather than guessing. The value, and the behaviour, live in
> `../filter-search` — the events list needed the identical thing.
>
> ---
>
> UX-20's search and filters — the roster's vocabulary over the shared bar.
>
> Everything is in the query string, so a filtered roster is a link an operator
> can send to somebody, the back button does what it looks like it does, and a
> refresh keeps the view.
>
> The bar itself is `../list-filters`, shared with the events list since
> LAN-127: the two screens had it twice at exactly 202 lines each, and the
> copies had already drifted apart on the phone touch target. What stays here
> is what belongs to the roster — which two things it narrows by, what it calls
> them, and that "A to Z" is the right name for ordering people.

## src/app/operate/people/people-filters.tsx — module header

> `W1-01`'s search and two thin filters — Brian, 2026-08-26: "keep the filter
> thin for now… we should be able to sort aggressively." The roster carries
> the full filter set; this bar is for finding one human.
>
> The shared `../list-filters` bar, exactly as the roster and the events list
> already use it — see `roster/roster-filters.tsx`. What stays here is what
> belongs to the People list: which two things it narrows by, what it calls
> them, and the `scope` this screen carries through every link so a search
> inside the widened view stays widened.

## src/app/operate/people/[personId]/merge/actions.ts — B-003 consent

> B-003: one radio group per colliding season, `consent_<seasonId>` — the
> season ids are dynamic per pair, so read them back from the submitted
> keys rather than a static label map like the two loops above.

## src/app/operate/roster/new/actions.ts — confirmationHref

> Where UX-13 lives, and what it has to be able to say — LAN-257.
>
> The confirmation is the player record with `?created=1`, and it used to be
> told nothing but that. It then said "Person and <season> membership were
> created together" whether or not a person had been created, and said nothing
> at all about a typed contact the write had discarded. Both facts travel in
> the query string.
>
> Deliberately by _kind_, never by value: the discarded number or address is
> personal data, and a query string is bookmarked, kept in history and written
> to every access log between here and the browser. The operator typed it a
> moment ago; naming the field is what they need, and the record below the
> banner shows what the club actually holds.

## src/app/operate/roster/actions.ts — setMembershipStatusAction

> Sets a membership's status to any other value in the ladder — the one
> control `membership-actions.tsx`'s `MembershipStatusControl` posts to,
> wherever it renders: the roster board's Status cell, the player page's
> "Membership status" panel, and the people page once it exists. No reason, no
> confirmation, no legality check — `setMembershipStatus()` is the whole rule,
> and this is only the boundary and the revalidation around it.

## src/app/operate/roster/actions.ts — resolveOnboardingItemAction

> Marks one onboarding item complete, waived, not applicable, or reopens it —
> four-role only (`person_record_authority`), `F-NEW-001`. `REQ-checklist-fixed`:
> "no item has a per-item owner: only the four-role group resolves anything."
>
> The status arrives from the form and is checked by the service against the
> resolutions this screen offers — `pending`, `invited` and `claimed` are
> states the process moves through, not decisions an operator makes here, and
> a crafted request naming one is refused rather than written.

## src/app/operate/people/missing/chase-presentation.ts — NO_PHONE_NUMBER_ON_FILE

> Correction round 2, F-1: the exact wording `formatChaseNext`'s own
> `no_channel` branch already returns — shared so the exhausted-and-
> unreachable row below says the same plain thing rather than a second copy
> that could drift from it.

## src/app/operate/people/missing/chase-presentation.ts — formatChaseNext

> `hasReachableNumber` defaults `true` so every existing caller (and the
> cases where it plainly does not apply — `scheduled`, `unmessageable`,
> `terminal_failure`, `no_automated_chase`, none of which this defaulting
> touches) keeps its exact wording. Only `exhausted` reads it — correction
> round 2, F-1: `describeOnboardingChaseNext` reports `exhausted` before it
> ever reaches the `no_channel` check (deliberate, C-1 — exhaustion is
> permanent and must not be masked by a later-added number), so a person who
> is both exhausted and unreachable never gets the `no_channel` wording from
> `next` alone. Say the concrete, actionable fact plainly instead of the
> generic "exhausted" one, the same way `no_channel` already does.

## src/app/operate/people/missing/chase-presentation.ts — isNudgeable

> Whether a nudge to this person is offered at all — `W8`'s own refusal
> list, corrected in round 1 (`C-1`/`C-3`/`C-4`): no channel, or under 18. A
> team member who has not granted consent is no longer refused here — see
> `onboarding-chase.ts`'s own comment on why `no_consent` is gone. A person
> with no reachable number is refused, and plainly so — Brian, 2026-09-03:
> "if there's no number, nudge doesn't do anything… that is something the
> president needs to go off and get their real phone number." The queue's
> own `correctHref` (unaffected by this package) is where that correction is
> made; this function only ever decides whether the button appears.
>
> Correction round 2, F-1: `next.kind !== "unmessageable"` alone let an
> exhausted person with no reachable number keep an active Nudge button —
> `describeOnboardingChaseNext` reports `exhausted` before it ever reaches
> the `no_channel` check (deliberate, C-1), so `kind` on its own cannot see
> the missing number once exhaustion has claimed the row. `hasReachableNumber`
> is read independently of `kind` so it refuses regardless of what else is
> true of the row — exhausted or not. Exhaustion itself still only warns
> (`chaseNeedsAHuman`, unaffected by this parameter) and never refuses on its
> own: an exhausted person who does have a number keeps the nudge.

## src/app/operate/people/[personId]/edit/actions.ts — collegeEmailChanged

> LAN-268, Brian 2026-09-09. The operator's edit form "refuses the same way"
> as the two recruitment doors and the player questionnaire, "before any
> write, naming the rule. No override." Asked of the one validator, in the
> same per-field shape the mobile above already uses. Clearing a college
> email stays a legitimate correction — a person may genuinely have none,
> and the missing-data queue is where that is chased — so only a supplied
> value is checked.

## src/app/operate/roster/new/returner-intake-form.tsx — UX-10 section banner

> Brian, on the running screen: the intake heading reads "Add player" too.
> That supersedes the earlier instruction to leave UX-10 alone. The workflow
> underneath is unchanged — this still enters a returning player, still fixes
> Returning, and still dedupes before writing; only the words changed.

## src/app/operate/roster/new/returner-intake-form.tsx — DetailsStep field order

> Four fields, in this order, and no others. All four departures from
> the approved wireframe are Brian's, taken while reviewing this screen
> on 12 August 2026:
>
> - "First name" / "Last name" rather than "Given name" / "Family
>   name" — the club's words. The columns keep the model's names;
>   this is presentation only and the two must not be conflated.
> - first name before last name, because that is the order a person
>   says them in.
> - no "Known as" — "not a good way to talk about it". The service
>   still accepts one for imports; this form never sends it.
> - no "Entry marker: Returning (fixed)" chip — it named an internal
>   value the operator cannot change and could not interpret. The
>   entry is still recorded as `returning`, and the confirmation
>   screen states it in words.

## src/app/operate/people/[personId]/merge/merge-comparison.tsx — file header, LAN-256

> Every row used to render the survivor's side with `defaultSelected`, blank
> or not, so pressing Merge without touching a radio was a complete answer
> that happened to say "keep everything the survivor has, including the seven
> facts it does not have". Merging `Yor` (near-duplicate, almost nothing on
> it) with `Yorick` (complete record) discarded the whole of Yorick's last
> name, college, matriculation year, expected graduation, degree field, date
> of birth and emergency contact, and the survivor then read "8 required facts
> are missing".

## src/app/operate/roster/new/validation.ts — GIVEN_NAME_REQUIRED

> "First name" matches the label on screen (Brian, reviewing UX-10). The field
> and the column stay `givenName` / `given_name` — the model's vocabulary is
> not the operator's, and conflating them is how a rename reaches the schema.

## src/app/operate/people/[personId]/edit/edit-state.ts — CorrectionReasonFormValues

> B1, LAN-185 correction round 2 (Brian's walk): `edit-person-form.tsx`
> renders each `*Reason` input only once the field's live value actually
> differs from what is stored — never up front just because the field is
> populated. That is client behaviour (`edit-person-form.tsx`'s own state),
> not a shape change here.

## src/app/operate/roster/jersey-picker.tsx — file header

> The jersey number picker Brian approved on `chore/roster-fidelity-mockup`
> and asked to keep exactly: _"jersey number being a picker and not free text
> is also very good, and it should allow for picking multiple numbers… I love
> the way it's built. I want to keep that exactly."_
>
> A picker over all 99 numbers, never free text — `jersey_assignments_number_range`
> allows 1–99 and nothing else, so free entry could only ever produce a value
> the database refuses, and a list is the only place that can say which
> numbers are already gone _before_ one is chosen rather than after (`Q-8`).
>
> A number held by another player is ticked, named, and cannot be clicked.
> There is deliberately no take-it-from-them gesture: to free a number, an
> operator goes to the player holding it and unticks it there, which makes a
> swap two deliberate acts by somebody who has seen both sides of it rather
> than one click that strips a number off somebody not on screen.

## src/app/operate/people/new/create-person-form.tsx — duplicate check section

> B4, LAN-185 correction round 2 (Brian's walk): the duplicate check
> must answer even when it finds nothing — a silent no-match reads
> as though the check never ran. Matches the count sentence
> `returner-intake-form.tsx`'s `CandidatesStep` already uses for the
> same check elsewhere in the application, rather than inventing a
> second shape.

## src/app/participation/presentation.ts — `recordAnswerEventSubtitle()` (OWNER-LAN170-09, correction round 4).

> `W3-02` and `W3-04` both draw a second line under the title naming which
> event the answer is being recorded against; the shipped dialog dropped it
> with nothing authorising the omission. Structure and copy are the
> mockup's — the event's own name (which already carries the "vs" the club
> writes into it, `event-csv.ts`'s own note) followed by when it is.

## src/lib/services/administration-audit.ts — file header (open reads / append-only detail)

> ## What these reads are not
>
> They are not the Stage-4 general audit browser, which stays out of scope.
> Each takes exactly one key — a Person, or a role — and returns that subject's
> administration history newest first. There is no free-text search, no filter,
> no date range, no export and no cross-entity investigation surface, and there
> is deliberately no exported function that would let a caller assemble one.
>
> They are also not open reads. Administration history says who did what to
> whom, which is the most sensitive thing this mission produces; both
> projections assert `role_management` at the service boundary rather than
> assuming a page checked first. `AGENTS.md`: the service layer is the primary
> authorization boundary, and a hidden control is never one.
>
> ## Append-only
>
> There is no update path and no delete path here, and there will not be one:
> `service_role` holds `select, insert` on `public.audit_events` and nothing
> else (`20260810121000_domain_reporting.sql`), so a correction is a new event
> and a mistake stays visible. That is the point of an audit ledger.

## src/lib/services/administration-audit.ts — AdministrationHistoryEntry.unreadable

> `unreadable` is `null`
> for an entry this version understands, and set for one it does not — see
> `UnreadableAdministrationEntry`. It is deliberately part of the ordinary
> entry rather than a separate variant the caller might forget to handle: for
> an audit surface, a history that _looks_ complete and is not is worse than a
> visible gap, and a row that is simply absent from the list is exactly that.

## src/lib/services/administration-audit.ts — historyQuery closed-set filter (LAN-141)

> The two projections pass _different_ sets, and only one of them is
> separately observable. `readOperatorAuditHistory` passes the whole closed
> set, and {@link toEntry} independently returns `null` for anything
> outside it — so widening the filter there changes no answer, and LAN-141
> recorded that as an unbound line. It is not unbound and it is not
> unbacked; the two layers are one rule written twice, and the forged
> `event.approved` row in `administration-audit.test.ts` proves the rule
> rather than either copy of it. `readHolderHistory` passes the strictly
> narrower role-related subset, which `toEntry` does not re-apply, and that
> one **was** genuinely unbound — a forged account-state row carrying a
> `roleId` now fails if the subset is widened or the filter dropped.

## src/lib/services/administration-audit.ts — readHolderHistory account-state absence

> Account-state events are deliberately absent: a holder
> whose operator access is deactivated keeps the seat
> (`REQ-deactivate-and-reinstate`), so that fact belongs to role detail's
> _current state_, not to the history of who has held the role.

## src/lib/services/administration-audit.ts — readOperatorAuditHistory header (empty list, affecting)

> "Affecting" is the envelope's `targetPersonId`, not the polymorphic entity
> pointer: a role assignment is _about_ the assignment row and _affects_ the
> holder, and this projection is the second of those. That is why the same
> event reaches both views without being stored twice.
>
> Refuses a caller without `role_management`. An empty list is a legitimate
> answer for an operator nothing has been done to, and for a Person who is not
> an operator at all — neither discloses which.

## src/lib/services/administration-audit.ts — readHolderHistory header (subset derivation, replacement pair)

> The subset is `ROLE_RELATED_ADMINISTRATION_ACTIONS`, derived from the
> vocabulary's own `roleRelated` flag, so the projection and the definition
> cannot drift apart.
>
> A replacement appears as two entries sharing a `correlationId` — the outgoing
> assignment ending and the incoming one starting. Those are two different
> assignments changing, not one fact recorded twice.

## src/lib/services/membership/shared.ts — MembershipStatus

> Five values since
> LAN-182 — see `relocations.md` for why `carried_forward`, `confirmed` and
> `withdrawn` are gone, and why there is no transition table any more.

## src/lib/services/membership/shared.ts — OnboardingItemStatus

> `claimed` joined it under LAN-214
> (`REQ-item-states`, W6's own `R2-V`): the player says done and awaits
> confirmation. It is a live, unresolved state — the item is not counted
> among the resolved statuses, the same way `invited` is not.

## src/lib/services/membership/read.ts — rosterOrderBy (denial-of-service finding)

> `Object.hasOwn`, not a plain lookup. `ROSTER_SORT_COLUMNS["toString"]`
> resolves through `Object.prototype` to a function, which is truthy — so
> `??` never falls back, `column.sql` is `undefined`, and the query becomes
> `order by undefined`, which the database refuses and the screen renders as
> "the roster is unavailable". `?sort=toString` is a URL anybody can type;
> `constructor`, `valueOf` and `hasOwnProperty` do the same. Not injection —
> the whitelist still holds and nothing of the caller's text reaches the SQL
> — but a denial of service on a screen, found by independent review.

## src/lib/services/follow-ups.ts — readQueueRowsIn

> OWNER-LAN173-06 (correction round 2): this lateral shared
> `participation.ts`'s `DELIVERY_LATERAL` bug exactly — `order by
j.created_at desc limit 1` with no tiebreaker over a set of rows that, in
> real use, commonly share one `created_at` (a whole ladder is created in
> `approveEvent`'s single transaction). Both now order by
> `NOTIFICATION_JOB_RECENCY_ORDER`, so they cannot drift back into two
> different answers to "which job is this invitee's most recent." See that
> constant in `./delivery.ts` for the full account.

## src/lib/services/follow-ups.ts — readFollowUpsQueue (escalationDelivered)

> F-B1, mechanism 4. `escalation_job_id` being non-null used to be read
> as "escalated", full stop — three people read "Escalated to the
> President" while their own escalation job was terminally `failed`
> and would never be looked at again. A job that exists is not the
> same claim as a job that was delivered; `escalation_status` is what
> actually was.

## src/lib/services/person-validation.ts — module header

> Contact validation for the person record — LAN-183, `REQ-contact-validation`.
>
> Pure. No database, no `server-only`, no framework: it has to be callable from
> a form's client-side check and from the write path that finally commits a
> value, with the same answer both times.
>
> ## The rule, named per field
>
> `DEC-w2-09`: "phone and email are validated before the save is offered, per
> field, naming the rule." So every result carries a `rule` — a stable
> identifier a caller can switch on — and a `message` in the club's language.
> Neither function ever throws; a refusal is data, the same as a pass.
>
> ## Why phone conversion is not imported from `src/lib/delivery/phone.ts`
>
> That module's `toE164()` answers the identical question —
> `DEC-w2-11`'s "does this parse with its country code, and does a bare
> national number default to UK" — and re-deriving the algorithm here is a
> second copy of one rule, which register D9 warns against in general. It is
> deliberate this once: `toE164` carries `import "server-only"`, because its
> job is turning a recorded value into what a delivery provider is handed, and
> that must never run in a browser. This module's job is different — deciding
> whether a save is offered at all, which a form has to be able to ask
> _before_ the value ever reaches a server — so importing `toE164` would either
> taint this module `server-only` and break that use, or (worse) quietly
> un-taint the delivery module's boundary. The two are kept apart on purpose;
> `person-validation.test.ts` and `phone.test.ts` both exercise the club's data
> from Source Data Analysis §11.1, so a divergence between them fails a test
> rather than surfacing on a real record.
>
> `toE164`'s own module note explains why it refuses rather than guesses: a
> wrong guess sends a working RSVP link to a stranger. That conservatism is
> exactly right here too — `DEC-w2-10`, "a correct number is never refused;
> the negative cases are acceptance criteria in their own right" — the two
> modules ask the same question of two different call sites.

## src/lib/services/roster/write.ts — enterReturningPlayer

> The status sequence is the frozen model's §2.1 machine as LAN-182 rebuilt it,
> and is not the operator's to choose. A membership now begins at `onboarding`
> and nowhere else. The old sequence walked `carried_forward → confirmed`, and
> both of those map onto `onboarding`: writing it today would record two
> transitions from a state to itself, which is a history asserting changes that
> did not happen. What distinguishes a returner from a new player is `entry`,
> which is where that fact always lived.

## src/lib/services/person-record.ts — readFieldProvenanceIn

> `person_created` is deliberately excluded even though it may have set
> several of these columns at once: it names no single field, so treating it
> as provenance for every column it happened to populate would attribute a
> fact this row does not actually state — the exact shape of invented
> caption `Q-13` and amendment `W1-A2` both refuse. This is also why almost
> nothing renders a caption yet: almost every person on file today arrived
> through an intake path that writes `person_created` and nothing more.

## src/lib/services/sql-text.ts — module header / escapeLikePattern

> Written out twice before this module existed — once in `membership.ts` for
> the roster search and once in `events.ts` for the events search — with the
> same body and the same comment. Two copies of an escaping rule is one copy
> too many: the failure mode is silent and only shows up on the input nobody
> tries, where a member called "Ana_" matches every three-letter name because
> `_` is a wildcard, not a character.

## src/lib/services/sql-text.ts — personDisplayAliasSql

> LAN-182 struck `people.known_as` and collapsed it into `person_aliases`, where
> a single row may be flagged `is_display_name`. This is a correlated scalar
> subquery rather than a join on purpose: it drops into an existing select list
> without disturbing the query's shape, and every caller of the old column was
> already selecting from `people`.
>
> `person_aliases_one_display_name_per_person` makes the `limit 1` a formality
> rather than a tie-break — the database permits exactly one.

## src/lib/services/sql-text.ts — personDisplayNameSql

> The same three rules everywhere, because getting any of them wrong is
> visible to the club rather than to a test: a preferred name wins over the
> given name, a blank preferred name is not a preferred name, and
> `people.family_name` is nullable by design — a quarter of the club's real
> records are first-name-only, and `'Ana' || ' ' || null` is `null`, which is
> how a first-name-only member becomes "Unnamed participant" on screen.
