# M-ONBOARDING-AND-INFORMATION-COMPLETION — decision history relocated from source

Paragraphs that explained a decision inside a source comment, moved here by LAN-300 so the
source reads as code. Each keeps a one-line pointer at its old location. Nothing here changes
a decision; it records where one was explained.

## src/app/operate/roster/[membershipId]/send-onboarding-questionnaire-button.tsx — OUTCOME_MESSAGE

> `sendOnboardingNudges`'s four outcomes, in the club's words. Requirement 3:
> "Sent only on provider acceptance, a named refusal otherwise (no consent,
> no reachable number, delivery not configured), and never a silent failure.
> Refusals name the reason on the record, not 'could not be completed'."
>
> These are the fallbacks. A refused or skipped send carries the dispatcher's
> own stored sentence back with it (`reason`, read off the job the send just
> wrote), and that is what the dialog shows whenever there is one — the same
> provider-neutral text `delivery.ts`'s own delivery page and the queue's
> `Delivery failed · …` column already show. The walk found why this matters:
> with delivery unconfigured, the reason on the job named the five missing
> settings and the fact that it needs the club's administrator, and none of
> that reached the operator who pressed the button.

## src/app/operate/roster/[membershipId]/send-onboarding-questionnaire-button.tsx — SendOnboardingQuestionnaireButton

> The onboarding record's manual ask — LAN-266, modelled on the recruit
> record's own SEND buttons (`../../recruitment/[prospectId]/send-questionnaire-button.tsx`)
> because Brian named that control as the thing onboarding should have.
>
> Visual correction (Brian, 2026-09-09, on `feb9d6d`): "same component and
> props" is meant literally. This first shipped `fullWidth`, which made it the
> only send button in the product that stretched its card; the recruit
> record's two are content-width and left-aligned, with their status line
> beneath. The props here are now exactly the recruit button's —
> `variant="contained"`, `size="small"`, `sx={{ minHeight: 44 }}` — inside the
> same `Box sx={{ py: 1.5 }}` wrapper, so there is one style for this control
> and not a second one for onboarding.
>
> `W2-04`'s reasoning is carried across intact: the button is never natively
> `disabled` for a gate the operator could act on, because a disabled HTML
> button fires no `onClick` and so cannot open the dialog that would explain
> itself. The dialog is what refuses, in words, at the moment of action. The
> one exception is the recruit record's own exception — a state that already
> carries its explanation above the button, which here is a membership that
> is no longer onboarding: there is nothing to chase and the record says so
> in its own status line, so discovering it one click in would be the gap
> rather than the fix.

## src/app/operate/roster/[membershipId]/record-view.tsx — onboarding send button

> LAN-266. Brian, 2026-09-09, with the recruit record as the model:
> the same control, in the same position and style — under the card
> that holds the items and the outstanding banner — with the same
> status line beneath it. Until now the only way to chase one player
> was to leave this record for the missing-data queue, and the record
> never said whether the link had ever been sent.

## src/app/operate/roster/[membershipId]/record-view.tsx — outstanding-required notice

> W3, Q-19: Brian had to check every Required badge against every
> status to find the one still outstanding. Naming it here keeps
> the alert's own approved shape and register — the count
> sentence, unchanged, plus the name(s) as a value, never a
> second explanatory sentence.

## src/lib/validation/contact.ts — module header (LAN-215, B-007).

> Brian, at the roster form: "phone validation needs to be consistent: the
> same phone validation everywhere. I know it has it there, but it needs to
> be consistent across all components... I just popped in a nonsense number,
> and it allowed it in." Before this file, `/operate/roster/new` and the
> bulk-import reader each kept a private `looksLikePhone` that accepted any
> value with seven or more digits — which is exactly how a nonsense number
> got through. This is the one place that question is asked now.
>
> `src/lib/delivery/phone-shape.ts` already owns a strict, conservative
> converter: a recorded contact becomes an E.164 number, or the conversion
> returns `null` when it cannot do so without guessing — because a wrong
> guess would send a working RSVP link to a stranger. A phone number that
> cannot become E.164 can never receive the welcome, which is the entire
> reason the club collects it, so "can this convert" is the correct
> acceptance test for "is this a phone number", not a second, looser rule
> kept in sync by hand.
>
> `./phone-shape.ts` (not `src/lib/delivery/phone.ts`) is what this imports:
> `phone.ts` carries `import "server-only"` on purpose, because turning a
> contact into what a delivery provider is handed must never run in a
> browser. This module has no such restriction — a form's shape check has to
> be callable from whatever renders that form — so it reaches past `phone.ts`
> to the pure conversion underneath, exactly as `phone.ts` itself does.
>
> B-007 is a phone finding. Email keeps the permissive shape check LAN-74
> already decided: one `@`, something before it, something after it, no
> internal spaces. `avery@example.ac.ox` still passes — normalisation and
> verification are separate, reversible steps this intake layer deliberately
> keeps apart from itself.
>
> This module is imported by the two surfaces LAN-215's own arrival doors
> touch: `/operate/roster/new` (`src/app/operate/roster/new/validation.ts`)
> and the bulk-import reader (`src/lib/services/roster-csv.ts`). It does not
> replace `src/lib/services/person-validation.ts`, which the recruitment and
> person-record surfaces outside this package already use, was decided under
> its own issue (LAN-183), and is out of this correction's scope — folding it
> in is a decision for whichever ticket next touches those surfaces, not a
> silent widening of this one.

## src/app/me/[token]/presentation.ts — `PLANS_CHANGED`. Destination: `docs/ux/tickets/LAN-172-player-answer.md`.

> A single tap, same as every other No — REQ-no-reason-given governs a
> player's own click here exactly as it does the row.

## src/lib/services/membership/write-items.ts — same-status refusal (owner review finding)

> Without this it wrote a fresh audit row whose `from_state` and
> `to_state` were identical, and re-dated `completed_on` to today — so an
> item completed in September silently claimed to have been completed
> again in August, and the history filled with events in which nothing
> happened. Owner review caught it: "if I change to say it's completed and
> the status didn't change, it should not change again."
>
> A waiver whose _reason_ changed is a real correction, not a no-op — an
> operator who typo'd one has to be able to fix it without routing through
> another status and writing audit rows for changes that did not happen.

## src/lib/services/membership/write-items.ts — reason-only correction skip (F-001)

> Correction round 1, F-001: a reason-only correction to an already-waived
> item reaches here with `item.status === toStatus` (both `waived`) —
> `sameReason` above is what let it past the already-in-that-state guard,
> precisely so the typo-fix path in that guard's own comment keeps
> working. It is not a transition: nothing about the item's _state_
> changed, only the reason text. `onboarding_item_history_is_a_real_change`
> refuses a row whose `from_status` and `to_status` are equal (and rightly
> so — REQ-item-history's history is a state-pair record, not a reason
> log), so the history write is skipped for exactly this case.

## src/lib/services/membership/write-items.ts — agreement reopen cascade (LAN-240, M7-01)

> LAN-240 (walker M7, finding M7-01): reopening one of the two agreement
> items has to reach the player, and until now it never did. Setting
> Photo release or Code of Conduct back to "No" is the shipped reopen
> mechanism — there is no separate verb, by D-002 above — but it moved
> only `onboarding_items.status`. The `onboarding_agreements` row stayed,
> so the player's own link went on reading "Already agreed" under a
> navigator that said "Outstanding", and a bare load of the link resumed
> at "There is nothing left to fill in". Removing the row in the same
> transaction as the state change is what makes the reopen real: the
> player's next load lands on the step, the step reads outstanding, and
> `recordOnboardingAgreementIn` accepts their fresh agreement instead of
> refusing it as a duplicate. See `deleteOnboardingAgreementIn` for why a
> delete rather than a `superseded_at` column, and what keeps the record.

## src/lib/services/membership/write-items.ts — Subscription paid cascade (D-002 Q-14)

> D-002 (Q-14): "correcting the invoice back to Not invoiced must do the
> right thing to the payment cell." A payment already recorded against
> an invoice that no longer stands is stale — an operator correcting
> Subscription invoiced away from `complete` resets its sibling
> Subscription paid back to `pending` in the same transaction. Never the
> other way — paying does not touch the invoice, and correcting an
> already-`pending` payment (it never having been invoiced, or already
> reset by an earlier correction) has nothing to cascade.

## src/lib/services/onboarding-activity-log.ts — file header (OD7-log-by-section quote)

> `OD7-log-by-section` (Brian, 2026-09-01) and its 2026-09-02 correction of
> the first counted draft: "I want to see the individual items that come
> underneath, when it was asked versus when it was received."

## src/lib/services/onboarding-agreements.ts — deleteOnboardingAgreementIn header

> There is no reopen verb (D-002): an operator reopens the photo release or
> the Code of Conduct by setting that item's own state back to "No" on the
> record. That flipped `onboarding_items.status` and nothing else, so the
> `onboarding_agreements` row — unique per (person, season, type), and by
> this module's own design never updated — survived. The player's link then
> said two contradictory things at once: the navigator read "PHOTO RELEASE —
> Outstanding" above a panel reading "Already agreed", and a bare load of the
> link resumed at "There is nothing left to fill in". The player could never
> see or act on the reopened item, and `recordOnboardingAgreementIn` would
> have refused a second agreement anyway.
>
> Deleted rather than superseded, on the Lead's recorded migration review
> (2026-09-09): this package is schema-free, and nothing is lost by the
> delete. `onboarding_item_history` already holds the transition that agreed
> the item and the one that reopened it, with the actor and the moment of
> each, and `audit_events` holds the operator's own reopen. What the row
> uniquely carried — _which version_ was agreed — is carried alongside it in
> the item history's own audit trail, and a reopened document is one the club
> has decided is no longer agreed, so the version that was agreed is history
> rather than standing record.
>
> Returns the number of rows removed: zero is a legitimate, expected outcome
> (an item set back to "No" that the player had never agreed through the
> link at all), and is recorded as one by the caller rather than treated as
> a failure.

## src/lib/services/onboarding-chase/settings.ts — chaseCount

> How many automated chases run at most. Zero is legal — no automated chase
> at all (delegated to the Mission Lead, settled). Spent only on delivery,
> never a failure.

## src/lib/services/onboarding-chase/settings.ts — module header

> Onboarding's chase configuration singleton — LAN-214, `W11`. The escalation
> office is read from the club's roles, never configured — see
> `relocations.md` for the module header's full note and the `W9`/`W11` history.

## src/lib/services/onboarding-chase/settings.ts — setOnboardingChaseSettingsIn

> Updates the three values in place — `W11`'s own "Save. The chase runs to
> that from the next message onwards": nobody's count is retrospectively
> reset and nobody already exhausted is restarted (`W8`'s own exception,
> unaffected by this write). The schema's own sanity checks
> (`onboarding_chase_settings_count_is_sane` and its two siblings) are the
> backstop; this function trusts the caller's form validation and lets a
> genuinely out-of-range value surface as the database's own refusal.

## src/lib/services/onboarding-chase/send-status.ts — OnboardingSendStatus header

> Everything `/operate/roster/[membershipId]`'s **Send onboarding
> questionnaire** control needs to render itself and its status line —
> LAN-266.
>
> Deliberately assembled from the queue's own readers and nothing else.
> Brian's requirement 6 is that "the queue's Nudge and this button write the
> same job type and the same activity-log entry, so a nudge from either place
> appears identically" — the corollary is that the two surfaces must _read_
> identically too, or the record and the queue would eventually disagree
> about a player they are both describing. So {@link lastContact} and
> {@link next} are the queue's own two columns, from the queue's own
> functions, and the record renders them through the queue's own wording
> (`chase-presentation.ts`).

## src/lib/services/onboarding-chase/send-status.ts — readLatestOnboardingAskIn

> The most recent ask queued for this membership, of either kind, and what
> became of it — LAN-266's "Sent 9 Sept 2026, 14:02 · delivered (or the
> delivery state: queued, delivered, failed with the reason the delivery page
> shows)".
>
> Reads the job table rather than `onboarding_activity_log`, because the log
> records that an ask _happened_ and this has to say what became of it. The
> outcome is the latest attempt's own `delivery_results` row, on the identical
> reasoning {@link readOnboardingChaseProgressIn} states for never reading
> `notification_jobs.status` as a delivery truth — with two differences.
>
> A job with no attempt at all has not failed: it is queued, and says so. And
> a job the dispatcher refused _before_ it ever attempted — delivery not
> configured on this deployment being the case an operator actually meets —
> writes no `delivery_results` row at all, only `status = 'failed'` and its
> reason in `last_error`. Reading the result row alone therefore reported that
> refusal as "queued", which is the silent failure LAN-266 requirement 3
> forbids. Both are read, and the reason comes back with the outcome: the same
> stored, provider-neutral sentence `delivery.ts`'s own delivery page shows an
> operator, on the same footing LAN-218's own C-5 correction put the queue's
> `Delivery failed · <reason>` column.

## src/lib/services/onboarding-chase/chase-state.ts — OnboardingChaseProgress.deliveredCount

> Asks actually delivered to this membership — every automated attempt and
> every manual one alike. Spent only on delivery (`T11-cap-delivered`): a
> `failed`/`rejected` outcome is never counted here.
>
> Manual asks joined the count for LAN-266, on Brian's own decision that
> the record's **Send onboarding questionnaire** "counts toward the
> configured chase count, and re-spaces the next automatic chase from this
> send". It is one count because it is one thing being counted — the number
> of times this player has been asked — and the queue's Nudge and the
> record's button write the identical job, so counting one and not the
> other would make the same act mean two different things depending on
> which screen it was pressed from.
>
> This does not make a manual ask refusable. Exhaustion still only warns
> (`chaseNeedsAHuman`); the one absolute refusal stays no channel or under
> 18 (`isNudgeable`), exactly as LAN-218 correction round 1 left it. What
> changes is that four delivered asks are four delivered asks however they
> were sent, so the automated cadence stops asking a fifth time and the
> office is told a human is needed.

## src/lib/services/onboarding-chase/chase-state.ts — terminalFailureReason

> Correction round 1, C-5 (Brian, 2026-09-03 walkthrough): the same
> provider-neutral sentence `delivery.ts`'s own event-delivery reader shows
> an operator (`DeliveryRow.failureReason`, itself `notification_jobs.last_error`)
> — read here from the identical failed attempt's `delivery_results.detail`
> rather than reimplemented, so the two surfaces can never describe the same
> failure two different ways. `null` unless {@link currentAttemptTerminallyFailed}
> is true.

## src/lib/services/onboarding-chase/chase-state.ts — automatedOrdinal/automatedAttemptOutstanding

> The highest automated-attempt ordinal that exists for this membership,
> or `0` when none does — LAN-266.
>
> `declareDueOnboardingChasesIn` used to compute its next key as
> `deliveredCount + 1`, which was exact only while `deliveredCount` counted
> automated attempts and nothing else. Now that a manual ask counts too
> (see {@link deliveredCount}), that arithmetic would skip ordinals and, in
> the narrow case of an attempt still retrying past the interval, could
> declare a second live job beside it. The ordinal is therefore read from
> the keys that actually exist rather than inferred from a count that no
> longer only describes them.
>
> Whether the highest existing automated attempt has yet to deliver — still
> pending, retrying, or failed. LAN-266's companion to
> {@link automatedOrdinal}: with the next key no longer recomputing to the
> same value, the "an existing ordinal is a no-op" property that used to
> keep one attempt in flight at a time has to be stated rather than fall
> out of the arithmetic. `false` when there is no automated attempt at all.

## src/lib/services/onboarding-chase/chase-state.ts — OnboardingChaseCandidate.hasReachableNumber

> Whether anything could actually be sent to this person — correction round
> 1, C-1/C-2 (Brian, 2026-09-03 walkthrough — Jorvik Kirkbride and Kenelm
> Netherby, an email and no phone, "nudge reported failed"), corrected again
> for LAN-249.
>
> It used to be read off the compiled ask (`!ask.missingRequiredFields
.includes("mobile")`) on the reasoning that `mobile` is required at every
> tier, so its absence there is exactly "no reachable number". That is true
> of an _absent_ number and false of a _recorded but unusable_ one: Montague
> Everleigh's seeded `contact.phone.malformed` ("07700 90039", one digit
> short) is a recorded mobile, so the compiled ask did not miss it, so the
> queue offered a live checkbox and Nudge for a person nothing can be sent
> to — and the nudge created a `notification_jobs` row that could only ever
> fail (walker M7, finding M7-05).
>
> So it is now the send path's own question, asked of the send path's own
> function: `selectMobileNumber` is what dispatch actually calls to turn
> this person's contact points into a number for the provider, and a person
> it returns `null` for is a person no surface should offer a send for.
> That is deliberately not "`normalised_value` is non-empty" — roster intake
> leaves `normalised_value` null on purpose (`roster.ts`'s own note), so
> that test would withhold the nudge from most of the roster while still
> passing a normalised value that is itself unusable. Asking the dispatcher's
> own question is the only formulation under which the queue, the record's
> own send button and the actual send can never disagree.
>
> The old formulation's benign "assume reachable when the compiled ask
> could not be read" default goes with it, and is not replaced by another:
> there is no unknown left to default. A person with no current phone
> contact point, or none that converts, is not reachable, and that is the
> whole answer.

## src/lib/services/onboarding-chase/chase-state.ts — describeOnboardingChaseNext

> The pure derivation behind the queue's "Next" column and the sweep's own
> due check — `describeOnboardingChaseNext` and `declareDueOnboardingChasesIn`
> read the identical fields of the identical candidate, so the queue can
> never say "2 Sep" about a membership the sweep has already decided not to
> chase.
>
> Order matters and is deliberate: a chase that has run its full course
> (`exhausted`) is reported before a person's messageability is even
> considered, because `W9`'s exhaustion is permanent and does not become
> "unmessageable" retroactively if a number is later added or consent later
> withdrawn. `under_18` is checked next and stays exactly where it was — an
> absolute rule, unaffected by anything below it. `no_channel` — no reachable
> mobile number — is checked immediately after, and deliberately _before_
> `terminal_failure`: a missing number is a structural, not-fixable-by-retry
> defect exactly like `under_18`, so it must never be masked by a generic
> "ran out of retries" verdict once the automated chase has actually burned
> through its attempts against it (`C-1`/`C-2`/`C-3`, Brian's 2026-09-03
> walkthrough — Jorvik Kirkbride and Kenelm Netherby, an email and no phone,
> "his nudge reported failed").
>
> ## `no_consent` — removed, not narrowed (`C-4`, Q-11)
>
> This reader's only population is `season_memberships.status = 'onboarding'`
> — a person already on the team, never a recruit still deciding whether to
> join one (`onboarding-chase.ts`'s own module note: recruits carry no
> membership row at all, so they never reach this list). Brian, 2026-09-03:
> "Only a recruit may decline messaging, and only while a recruit… A team
> member without consent is not unmessageable — they still receive the
> onboarding and consent form, which is the first page of onboarding." The
> approved `W8-01` mockup's wording ("Unmessageable · no consent") was
> therefore superseded in session ("then amend it") rather than found to be a
> departure from it: consent not yet granted is this population's ordinary,
> expected starting state, not a refusal, and this function no longer treats
> it as a reason to withhold the schedule it would otherwise report. Nothing
> about `mayReceiveWelcomeContactIn`'s own refuse-without-basis check
> (`messaging-consent.ts`, `REQ-transport`) changes — the welcome still goes
> regardless of a basis, and a genuine `refused`/`withdrawn` consent still
> stops it there — this function simply stops modelling a second, queue-only
> copy of that state. No departure is triggered here or anywhere this
> correction round touches; that stays the human matter Brian named it.

## src/lib/services/onboarding-chase/chase-state.ts — OnboardingChaseQueueInfo.hasReachableNumber

> Correction round 2, F-1: the same fact {@link describeOnboardingChaseNext}
> already reads to decide `no_channel`, carried alongside `next` rather
> than re-derived from it. `next.kind` alone cannot tell the queue "no
> reachable number" once exhaustion has already claimed the row — that
> collapse is exactly what let an exhausted, unreachable person keep an
> active Nudge button. `true` when there is no candidate at all (a
> membership `describeOnboardingChaseNext` never runs), the same benign
> default `hasReachableNumber` itself documents.

## src/lib/services/onboarding-item-shapes.ts — ITEM_STATE_LISTS comment

> Every operator-ticked item's own closed list, Brian's exact words. Order is
> this module's own choice — the _set_ of words is what he named — laid out
> pending-first so a reader can see each item's own shape at a glance.
>
> `waived` appears exactly once, on Subscription paid, where he named it —
> nowhere else. `not_applicable` appears nowhere at all: there is no escape
> hatch. Neither derived item (`contact_academic_details`,
> `season_welcome_consent`) is listed — see `isDerivedItem` below.

## src/lib/services/onboarding-item-shapes.ts — SUBS_PAID_ITEM_CODE entry, inline comment

> Blank/unset while Subscription invoiced is not Invoiced is not a fourth
> state in this list — it is the absence of a control at all, the same
> "nothing to show yet" every other genuinely unset value on this board
> already reads as. See `record-view.tsx`'s `blank` prop and
> `board-data.ts`'s `subsPaid` case.

## src/lib/services/onboarding-item-shapes.ts — hudl_access entry, inline comment

> No `complete` — three states only. Distinct on purpose from BUCS Play,
> which has a fourth: this is the one place the two trust-class items'
> own lists genuinely differ, and it is Brian's own table that draws the
> line there, not a shared "trust-class" abstraction any more.

## src/lib/services/onboarding-item-shapes.ts — DERIVED_ITEM_CODES comment

> The two items that complete themselves from other recorded facts
> (`item-and-ask-inventory.md`, items 9 and 12) — never a board column
> (already true), and now never an editable control anywhere, record view
> included. Nobody has settled words or states for them beyond the plain
> pending/complete binary every code falls back to; inventing either would
> be exactly the interface decision this module has never been allowed to
> make on its own.

## src/lib/services/onboarding-item-shapes.ts — allowedItemStates comment

> The complete, closed set of states this item may ever occupy — the same
> set its own control offers (a derived item's control offers none at all;
> see `isDerivedItem`). One list, read by the service boundary that accepts
> a transition and by every surface that renders one: there is no second
> list anywhere that could name a state this one does not.

## src/lib/services/onboarding-item-shapes.ts — itemStateLabel comment

> The one word this item's cell shows for this state. Never called with a
> state this item cannot occupy — that is exactly the defect Brian saw twice
> now (first "Invited" on a yes/no item, then the old four resolution verbs
> painted over an item's own states) — so this throws rather than silently
> printing a word for a state the item's own list says cannot exist here.

## src/lib/services/phone-parts.ts — module header

> > "It needs to be the country code as a dropdown list. I pick the country
> > code, and then I do the mobile phone number. It ends up being two separate
> > things… On the same line."
>
> ## Why this is not a second normaliser
>
> LAN-211 is explicit: "Extend that pair; do not fork it." There are exactly
> two functions in this repository that decide whether a phone number is a
> phone number — `toE164` in `src/lib/delivery/phone-shape.ts` and
> `validatePhoneNumber` in `./person-validation.ts` — and this module calls
> them rather than re-deriving anything. What it adds is _presentation of the
> same answer_: `validatePhoneParts` runs the joined value through
> `validatePhoneNumber` unchanged and then says which box the operator or
> player has to look at, because "that is not the right number of digits" is
> useless when the number is spread across two controls.
>
> What is stored is unchanged and still E.164, still produced by the existing
> normaliser. The control posts a joined string through a hidden input under
> the field's own `name`, so every server action that already reads
> `formData.get("mobile")` and calls `validatePhoneNumber` on it keeps
> working, byte for byte, without knowing the control changed.
>
> ## Why there is no country-list dependency
>
> LAN-211: "No new dependency for country lists unless Brian approves one —
> check what is already installed first." Nothing installed carries one, and
> the alternative — `libphonenumber` — is a large dependency whose value is
> parsing arbitrary international input, which `phone-shape.ts`'s own module
> note already records this codebase as deliberately not doing. The list below
> is a dropdown's worth of countries, not a parsing library: it decides what
> the control offers and nothing else. Adding a country is one line, and the
> number still has to survive `toE164` afterwards either way.

## src/lib/services/phone-parts.ts — CALLING_COUNTRIES

> Deliberately a short, ordinary list rather than all 250 territories: the
> club recruits at an Oxford freshers' fair and an MBA cohort, so this is the
> United Kingdom first and then the places its members actually come from, in
> alphabetical order. A country nobody in the club is from is a line nobody
> scrolls past; adding one when somebody is, is a one-line change decided the
> same way these were.
>
> `toE164` still has the final word. A country here whose national length it
> does not know falls through to its generic 8–15 digit range, which narrows
> nothing and widens nothing — the same fallback it already applies to every
> calling code but the club's own.

## src/lib/services/player-questionnaire/step1.ts — saveDetailsStep

> F1 (LAN-230, a critical fix on Brian's own confirmed requirement,
> 2026-09-02: "Whatever a step saved stays saved… never discards"; CE-008,
> `REQ-required-set`: "the required set… blocks the form and never the
> player, and whatever a step saved stays saved"): a submission this module
> used to abort _entirely_ the moment any single field failed its own shape
> check, discarding nine valid answers over one malformed one.

## src/lib/services/player-questionnaire/provenance.ts — applyDisputableFieldIn

> B-002 (correction round 2, Q-9, Brian's decision — "I don't think the
> disputed fact mechanism survives at all"): the disputed state, the second
> contested value and the four-role resolve control are gone. A player's
> answer now simply takes effect — last write wins, whoever gave it — and
> the audit history the person record already renders is what carries who
> changed what and when.
