# M-RECRUITMENT — decision history relocated from source

Paragraphs that explained a decision inside a source comment, moved here by LAN-300 so the
source reads as code. Each keeps a one-line pointer at its old location. Nothing here changes
a decision; it records where one was explained.

## src/app/operate/recruitment/[prospectId]/actions.ts — sendRecruitmentQuestionnaireAction

> `W2`'s two SEND buttons — the 2026-09-01 amendment's own machinery. Real
> consequence, not a stub: this creates the `notification_jobs` row through
> `declareRecruitmentCycleJobsIn`, gated on consent and the two-ask cap, as
> `sendRecruitmentQuestionnaireIn`'s own doc comment explains.

## src/app/operate/admin/messaging/cycle-validation.ts — CYCLE_STEP_FIELDS

> Every step's own field, in the cycle's declared order. Hours throughout —
> `offset_hours` is the column's own unit, and Welcome already has to be in
> hours (it can fire at `0`, immediately, which "0 days" would misstate as
> "a whole day"), so every step reads the same way rather than switching
> units row to row.
>
> `details_reminder` and `interest_reminder` both read "hours after
> capture", not "hours after" the message before them — a step's own timing
> has to stay meaningful on its own, the same reasoning that named
> `interest_reminder`'s field before it, extended to `details_reminder` now
> that the two are shown on one row (Brian, 2026-09-01).

## src/app/operate/recruitment/[prospectId]/record-view.ts — RecruitmentRecordView, disabled reasons

> `W2-04` (Brian, 2026-08-31): the same fact stated three times, in
> descending order of how hard it is to miss — a banner at the top of the
> record, the send action itself, and the dialog reached by pressing it.
> The banner now fires only when _neither_ track can reach this recruit —
> `declined`, or an explicit `refused`/`withdrawn` — never for
> `never_asked`/`asked`, which the personal track is built to answer.

## src/app/operate/recruitment/[prospectId]/record-view.ts — Person/Recruitment stack layout

> Person and Recruitment stack full width, one above the other — the
> same plain vertical flow the shipped player record uses for its own
> bands (`../../roster/[membershipId]/record-view.tsx`), not a Grid
> item pair sized to share a row. Brian, 2026-09-02: "The bands are
> side by side when really they should be layered on top of each
> other."

## src/app/operate/recruitment/[prospectId]/record-view.ts — status history date formatting

> The shared formatter, not `toLocaleString()` —
> LAN-248. Unqualified, it answered in whatever
> locale the server or the browser happened to be
> set to (`9/8/2026, 7:31:20 PM`) on a page whose
> every other date already read `8 Sep 2026`, and it
> hydrated differently on the two of them.
> `docs/ux/standards.md` rule 3: a recorded moment
> reads `27 Aug 2026, 14:22`, on club time.

## src/app/operate/recruitment/new/add-recruit-form.ts — AddRecruitForm, inline validation state

> V-1, correction round 2 (blocking, Brian's own words: "a hard
> requirement") — inline, on-field validation for phone and email, using
> the shared validators the application already has
> (`person-validation.ts`) rather than a third copy, in the same idiom
> `signup-form.tsx` already established for the identical two fields:
> local state so a format error renders the moment it is typeable, not
> only after CHECK FOR DUPLICATES / a submit round-trip. `errors.mobile`
> (the server's own "Required" refusal for a blank field) and this
> client-only format check compose — a required-but-blank field shows the
> server's message; a filled-but-malformed one shows this one.

## src/app/operate/recruitment/new/add-recruit-form.ts — formatInvalid

> LAN-275 correction round 1, F1. The college email is validated inline
> like every other field on this form, so it has to gate the two submit
> controls like every other field too — V-1 is "a malformed value shows
> its own message inline **and disables Check for duplicates / Create**",
> and leaving this one term out let a non-Oxford address round-trip to a
> server that was only ever going to refuse it.

## src/app/operate/recruitment/new/add-recruit-form.ts — AddRecruitForm, alreadyMember branch

> V-3 / V-4, correction round 2 — "This is them" on a current player
> resolves to this one clean confirmation screen, replacing the whole
> form rather than stacking a refusal onto it. Brian: "If I say 'This is
> them,' it should basically close… That's not an error state. That's
> just a normal thing… say, 'Okay, they're fine, no changes will be
> made,' and then go back to the recruits."

## src/app/operate/recruitment/new/add-recruit-form.ts — Academic section

> V-2, correction round 2 — Brian: "The add-to form seems narrow…
> We can use the forms from before to see which fields we're
> asking for there." The shipped intake forms' own field set
> (`signup-form.tsx`, `edit-person-form.tsx`), not one invented
> here. Every field below is optional — `REQ-missing-never-blocks`
> still names only first name, last name and mobile.

## src/app/operate/recruitment/new/add-recruit-form.ts — "How we may contact them" section

> V-10, correction round 2 — Brian's own authorised, scoped
> exception to the no-narrative-text rule: this surface, and
> only this surface, explains itself.

## src/app/operate/recruitment/board-columns.ts — eventColumns

> Both sort — Brian, 2026-09-02: "RSVP in attendance should be sortable
> here" — through the same `column.sortable` idiom every other column
> already uses (the board's `TableSortLabel` header and `applyBoard`'s
> generic `rawValue`/`comparable` machinery need nothing event-specific;
> `rawValue`'s `event:<eventId>:rsvp|attendance` case already resolves
> these two).

## src/app/operate/board-filter-controls.ts — StatusPill

> Which MUI semantic colour each board's own values map to is that board's
> own choice (Brian, 2026-09-02: recruitment's own colours "are fine"); the
> formula — one small `Chip`, coloured, labelled, nothing else — is what
> has to match.

## src/app/operate/recruitment/new/actions.ts — link-intent, already-member match

> V-3 / V-4, correction round 2: a player match used to fall into the
> ordinary `formError` banner, stacked on the still-visible candidates
> panel and form beneath it — Brian's own "flurry of information."
> `refuseIfAlreadyAMemberIn`'s own rule names exactly this outcome; it
> is not an error to report, it is the one clean confirmation screen
> below, and everything else this action would otherwise return is
> dropped in favour of it.

## src/app/operate/recruitment/new/create-state.ts — collegeEmail

> LAN-268, Brian 2026-09-09. Required, and only an `ox.ac.uk` address is
> accepted — the operator adding somebody by hand is held to the same rule
> as the recruit filling the door in themselves, because it is the same
> fact about the same person.

## src/app/operate/recruitment/new/create-state.ts — knownAs

> V-2, correction round 2 — the shipped intake forms' own field set
> (`signup-form.tsx`, `edit-person-form.tsx`), not one invented here.
> Every field below is optional; `REQ-missing-never-blocks` names only
> first name, last name and mobile.

## src/app/operate/recruitment/new/create-state.ts — AddRecruitAlreadyMember

> V-3 / V-4, correction round 2 — "This is them" on a candidate who already
> holds a membership this season used to fall into the ordinary `formError`
> banner, stacked on top of the still-visible candidates panel and form:
> Brian's own "flurry of information" and "that's not an error state."
> Set only for that one outcome, and rendered as this record's own single
> confirmation screen — everything else disappears while it is set.

## src/app/operate/recruitment/[prospectId]/send-questionnaire-button.ts — file header

> `W2-04` (Brian, 2026-08-31 — "the pop-up... should be the answer at the
> moment of action") is why this button is never natively `disabled` for an
> _unconsented or ineligible_ recruit: a disabled HTML button fires no
> `onClick` at all, so a control that cannot be pressed cannot open a
> dialog either — correction round 1's F-LAN204-005. For those reasons the
> button always opens the dialog; the dialog is what refuses, in words, at
> the moment of action, whether the service layer would have refused anyway
> or the operator confirms a real send.
>
> Walk correction (W-1): a `declined` recruit is different — `declined`
> already carries its own top-of-record banner (`record-view.tsx`'s
> `bannerDetail`) stating the refusal before either button is ever reached,
> so there is no explanation left for the dialog to be the sole place
> holding. Discovering the refusal one click into a confirm dialog instead
> of up front is exactly the gap the walk found, so `declined` is the one
> case this button is natively `disabled` for — `blockedByDecline`, passed
> by the caller.

## src/app/join/[code]/twitter-image.ts — module header (LAN-279). Destination: `docs/ux/design-system.md`

> Next reads the two file conventions independently: a route with only an
> `opengraph-image` emits `og:image` and no `twitter:image`, and a client that
> prefers the Twitter tags then falls back to the root card. iMessage is one of
> them. So the sign-up card has to be declared twice, and this re-export is how
> it is declared twice without being drawn twice.

## src/lib/qr/qr-matrix.ts — module header, "What is proved, and what is not" (LAN-204).

> `qr-matrix.test.ts` asserts the structural invariants a decoder relies on
> (matrix size, finder/timing/alignment placement, the fixed dark module),
> the exact fixed format-info value this module's one configuration must
> always place, and — via an independent reader it writes from scratch,
> `decodeQrMatrixByteMode`, which knows nothing of this file's own internal
> functions — that every supported byte length round-trips back to the text
> that went in, including a Reed–Solomon consistency check on the codewords
> actually stored in the grid. That test suite did not always contain the
> last three of those: correction round 1 (F-LAN204-002) found, the hard
> way, that "both format-info copies agree with each other" and "the two
> codewords match" are both satisfiable by a self-consistent but _wrong_
> encoding — a real scanner (Apple Vision, via this repository's own
> `decode_qr.py`) returned `NO BARCODE FOUND` for a build that passed every
> test in this file as it then stood, because the format-info value both
> copies agreed on was reversed bit-for-bit (LSB-first instead of the
> spec's MSB-first), so a real decoder recovered the wrong mask and level
> from it. One production scan has still never been performed against this
> module's actual output — the local toolchain has no scanner of its own —
> so that residual gap is recorded in the package receipt rather than
> asserted away here.

## src/app/a/[token]/presentation.ts — `PLANS_CHANGED`. Destination: `docs/ux/tickets/LAN-172-player-answer.md`.

> The same shortcut `/me/[token]`'s focused panel already offers a standing
> Yes, now also offered here, before the RSVP has even been recorded yet.

## src/app/operate/recruitment/[prospectId]/actions.ts — sendRecruitmentQuestionnaireAction

> `W2`'s two SEND buttons — the 2026-09-01 amendment's own machinery. Real
> consequence, not a stub: this creates the `notification_jobs` row through
> `declareRecruitmentCycleJobsIn`, gated on consent and the two-ask cap, as
> `sendRecruitmentQuestionnaireIn`'s own doc comment explains.

## src/app/operate/admin/messaging/cycle-validation.ts — CYCLE_STEP_FIELDS

> Every step's own field, in the cycle's declared order. Hours throughout —
> `offset_hours` is the column's own unit, and Welcome already has to be in
> hours (it can fire at `0`, immediately, which "0 days" would misstate as
> "a whole day"), so every step reads the same way rather than switching
> units row to row.
>
> `details_reminder` and `interest_reminder` both read "hours after
> capture", not "hours after" the message before them — a step's own timing
> has to stay meaningful on its own, the same reasoning that named
> `interest_reminder`'s field before it, extended to `details_reminder` now
> that the two are shown on one row (Brian, 2026-09-01).

## src/app/operate/recruitment/[prospectId]/record-view.tsx — RecruitmentRecordView, disabled reasons

> `W2-04` (Brian, 2026-08-31): the same fact stated three times, in
> descending order of how hard it is to miss — a banner at the top of the
> record, the send action itself, and the dialog reached by pressing it.
> The banner now fires only when _neither_ track can reach this recruit —
> `declined`, or an explicit `refused`/`withdrawn` — never for
> `never_asked`/`asked`, which the personal track is built to answer.

## src/app/operate/recruitment/[prospectId]/record-view.tsx — Person/Recruitment stack layout

> Person and Recruitment stack full width, one above the other — the
> same plain vertical flow the shipped player record uses for its own
> bands (`../../roster/[membershipId]/record-view.tsx`), not a Grid
> item pair sized to share a row. Brian, 2026-09-02: "The bands are
> side by side when really they should be layered on top of each
> other."

## src/app/operate/recruitment/[prospectId]/record-view.tsx — status history date formatting

> The shared formatter, not `toLocaleString()` —
> LAN-248. Unqualified, it answered in whatever
> locale the server or the browser happened to be
> set to (`9/8/2026, 7:31:20 PM`) on a page whose
> every other date already read `8 Sep 2026`, and it
> hydrated differently on the two of them.
> `docs/ux/standards.md` rule 3: a recorded moment
> reads `27 Aug 2026, 14:22`, on club time.

## src/app/operate/recruitment/new/add-recruit-form.tsx — AddRecruitForm, inline validation state

> V-1, correction round 2 (blocking, Brian's own words: "a hard
> requirement") — inline, on-field validation for phone and email, using
> the shared validators the application already has
> (`person-validation.ts`) rather than a third copy, in the same idiom
> `signup-form.tsx` already established for the identical two fields:
> local state so a format error renders the moment it is typeable, not
> only after CHECK FOR DUPLICATES / a submit round-trip. `errors.mobile`
> (the server's own "Required" refusal for a blank field) and this
> client-only format check compose — a required-but-blank field shows the
> server's message; a filled-but-malformed one shows this one.

## src/app/operate/recruitment/new/add-recruit-form.tsx — formatInvalid

> LAN-275 correction round 1, F1. The college email is validated inline
> like every other field on this form, so it has to gate the two submit
> controls like every other field too — V-1 is "a malformed value shows
> its own message inline **and disables Check for duplicates / Create**",
> and leaving this one term out let a non-Oxford address round-trip to a
> server that was only ever going to refuse it.

## src/app/operate/recruitment/new/add-recruit-form.tsx — AddRecruitForm, alreadyMember branch

> V-3 / V-4, correction round 2 — "This is them" on a current player
> resolves to this one clean confirmation screen, replacing the whole
> form rather than stacking a refusal onto it. Brian: "If I say 'This is
> them,' it should basically close… That's not an error state. That's
> just a normal thing… say, 'Okay, they're fine, no changes will be
> made,' and then go back to the recruits."

## src/app/operate/recruitment/new/add-recruit-form.tsx — Academic section

> V-2, correction round 2 — Brian: "The add-to form seems narrow…
> We can use the forms from before to see which fields we're
> asking for there." The shipped intake forms' own field set
> (`signup-form.tsx`, `edit-person-form.tsx`), not one invented
> here. Every field below is optional — `REQ-missing-never-blocks`
> still names only first name, last name and mobile.

## src/app/operate/recruitment/new/add-recruit-form.tsx — "How we may contact them" section

> V-10, correction round 2 — Brian's own authorised, scoped
> exception to the no-narrative-text rule: this surface, and
> only this surface, explains itself.

## src/app/operate/recruitment/board-columns.ts — eventColumns

> Both sort — Brian, 2026-09-02: "RSVP in attendance should be sortable
> here" — through the same `column.sortable` idiom every other column
> already uses (the board's `TableSortLabel` header and `applyBoard`'s
> generic `rawValue`/`comparable` machinery need nothing event-specific;
> `rawValue`'s `event:<eventId>:rsvp|attendance` case already resolves
> these two).

## src/app/operate/board-filter-controls.tsx — StatusPill

> Which MUI semantic colour each board's own values map to is that board's
> own choice (Brian, 2026-09-02: recruitment's own colours "are fine"); the
> formula — one small `Chip`, coloured, labelled, nothing else — is what
> has to match.

## src/app/operate/recruitment/new/actions.ts — link-intent, already-member match

> V-3 / V-4, correction round 2: a player match used to fall into the
> ordinary `formError` banner, stacked on the still-visible candidates
> panel and form beneath it — Brian's own "flurry of information."
> `refuseIfAlreadyAMemberIn`'s own rule names exactly this outcome; it
> is not an error to report, it is the one clean confirmation screen
> below, and everything else this action would otherwise return is
> dropped in favour of it.

## src/app/operate/recruitment/new/create-state.ts — collegeEmail

> LAN-268, Brian 2026-09-09. Required, and only an `ox.ac.uk` address is
> accepted — the operator adding somebody by hand is held to the same rule
> as the recruit filling the door in themselves, because it is the same
> fact about the same person.

## src/app/operate/recruitment/new/create-state.ts — knownAs

> V-2, correction round 2 — the shipped intake forms' own field set
> (`signup-form.tsx`, `edit-person-form.tsx`), not one invented here.
> Every field below is optional; `REQ-missing-never-blocks` names only
> first name, last name and mobile.

## src/app/operate/recruitment/new/create-state.ts — AddRecruitAlreadyMember

> V-3 / V-4, correction round 2 — "This is them" on a candidate who already
> holds a membership this season used to fall into the ordinary `formError`
> banner, stacked on top of the still-visible candidates panel and form:
> Brian's own "flurry of information" and "that's not an error state."
> Set only for that one outcome, and rendered as this record's own single
> confirmation screen — everything else disappears while it is set.

## src/app/operate/recruitment/[prospectId]/send-questionnaire-button.tsx — file header

> `W2-04` (Brian, 2026-08-31 — "the pop-up... should be the answer at the
> moment of action") is why this button is never natively `disabled` for an
> _unconsented or ineligible_ recruit: a disabled HTML button fires no
> `onClick` at all, so a control that cannot be pressed cannot open a
> dialog either — correction round 1's F-LAN204-005. For those reasons the
> button always opens the dialog; the dialog is what refuses, in words, at
> the moment of action, whether the service layer would have refused anyway
> or the operator confirms a real send.
>
> Walk correction (W-1): a `declined` recruit is different — `declined`
> already carries its own top-of-record banner (`record-view.tsx`'s
> `bannerDetail`) stating the refusal before either button is ever reached,
> so there is no explanation left for the dialog to be the sole place
> holding. Discovering the refusal one click into a confirm dialog instead
> of up front is exactly the gap the walk found, so `declined` is the one
> case this button is natively `disabled` for — `blockedByDecline`, passed
> by the caller.

## src/app/join/[code]/twitter-image.tsx — module header (LAN-279). Destination: `docs/ux/design-system.md`

> Next reads the two file conventions independently: a route with only an
> `opengraph-image` emits `og:image` and no `twitter:image`, and a client that
> prefers the Twitter tags then falls back to the root card. iMessage is one of
> them. So the sign-up card has to be declared twice, and this re-export is how
> it is declared twice without being drawn twice.

## src/lib/qr/qr-matrix.ts — module header, "What is proved, and what is not" (LAN-204).

> `qr-matrix.test.ts` asserts the structural invariants a decoder relies on
> (matrix size, finder/timing/alignment placement, the fixed dark module),
> the exact fixed format-info value this module's one configuration must
> always place, and — via an independent reader it writes from scratch,
> `decodeQrMatrixByteMode`, which knows nothing of this file's own internal
> functions — that every supported byte length round-trips back to the text
> that went in, including a Reed–Solomon consistency check on the codewords
> actually stored in the grid. That test suite did not always contain the
> last three of those: correction round 1 (F-LAN204-002) found, the hard
> way, that "both format-info copies agree with each other" and "the two
> codewords match" are both satisfiable by a self-consistent but _wrong_
> encoding — a real scanner (Apple Vision, via this repository's own
> `decode_qr.py`) returned `NO BARCODE FOUND` for a build that passed every
> test in this file as it then stood, because the format-info value both
> copies agreed on was reversed bit-for-bit (LSB-first instead of the
> spec's MSB-first), so a real decoder recovered the wrong mask and level
> from it. One production scan has still never been performed against this
> module's actual output — the local toolchain has no scanner of its own —
> so that residual gap is recorded in the package receipt rather than
> asserted away here.

## src/app/a/[token]/presentation.ts — `PLANS_CHANGED`. Destination: `docs/ux/tickets/LAN-172-player-answer.md`.

> The same shortcut `/me/[token]`'s focused panel already offers a standing
> Yes, now also offered here, before the RSVP has even been recorded yet.

## src/app/operate/recruitment/[prospectId]/actions.ts — sendRecruitmentQuestionnaireAction

> `W2`'s two SEND buttons — the 2026-09-01 amendment's own machinery. Real
> consequence, not a stub: this creates the `notification_jobs` row through
> `declareRecruitmentCycleJobsIn`, gated on consent and the two-ask cap, as
> `sendRecruitmentQuestionnaireIn`'s own doc comment explains.

## src/app/operate/admin/messaging/cycle-validation.ts — CYCLE_STEP_FIELDS

> Every step's own field, in the cycle's declared order. Hours throughout —
> `offset_hours` is the column's own unit, and Welcome already has to be in
> hours (it can fire at `0`, immediately, which "0 days" would misstate as
> "a whole day"), so every step reads the same way rather than switching
> units row to row.
>
> `details_reminder` and `interest_reminder` both read "hours after
> capture", not "hours after" the message before them — a step's own timing
> has to stay meaningful on its own, the same reasoning that named
> `interest_reminder`'s field before it, extended to `details_reminder` now
> that the two are shown on one row (Brian, 2026-09-01).

## src/app/operate/recruitment/[prospectId]/record-view.tsx — RecruitmentRecordView, disabled reasons

> `W2-04` (Brian, 2026-08-31): the same fact stated three times, in
> descending order of how hard it is to miss — a banner at the top of the
> record, the send action itself, and the dialog reached by pressing it.
> The banner now fires only when _neither_ track can reach this recruit —
> `declined`, or an explicit `refused`/`withdrawn` — never for
> `never_asked`/`asked`, which the personal track is built to answer.

## src/app/operate/recruitment/[prospectId]/record-view.tsx — Person/Recruitment stack layout

> Person and Recruitment stack full width, one above the other — the
> same plain vertical flow the shipped player record uses for its own
> bands (`../../roster/[membershipId]/record-view.tsx`), not a Grid
> item pair sized to share a row. Brian, 2026-09-02: "The bands are
> side by side when really they should be layered on top of each
> other."

## src/app/operate/recruitment/[prospectId]/record-view.tsx — status history date formatting

> The shared formatter, not `toLocaleString()` —
> LAN-248. Unqualified, it answered in whatever
> locale the server or the browser happened to be
> set to (`9/8/2026, 7:31:20 PM`) on a page whose
> every other date already read `8 Sep 2026`, and it
> hydrated differently on the two of them.
> `docs/ux/standards.md` rule 3: a recorded moment
> reads `27 Aug 2026, 14:22`, on club time.

## src/app/operate/recruitment/new/add-recruit-form.tsx — AddRecruitForm, inline validation state

> V-1, correction round 2 (blocking, Brian's own words: "a hard
> requirement") — inline, on-field validation for phone and email, using
> the shared validators the application already has
> (`person-validation.ts`) rather than a third copy, in the same idiom
> `signup-form.tsx` already established for the identical two fields:
> local state so a format error renders the moment it is typeable, not
> only after CHECK FOR DUPLICATES / a submit round-trip. `errors.mobile`
> (the server's own "Required" refusal for a blank field) and this
> client-only format check compose — a required-but-blank field shows the
> server's message; a filled-but-malformed one shows this one.

## src/app/operate/recruitment/new/add-recruit-form.tsx — formatInvalid

> LAN-275 correction round 1, F1. The college email is validated inline
> like every other field on this form, so it has to gate the two submit
> controls like every other field too — V-1 is "a malformed value shows
> its own message inline **and disables Check for duplicates / Create**",
> and leaving this one term out let a non-Oxford address round-trip to a
> server that was only ever going to refuse it.

## src/app/operate/recruitment/new/add-recruit-form.tsx — AddRecruitForm, alreadyMember branch

> V-3 / V-4, correction round 2 — "This is them" on a current player
> resolves to this one clean confirmation screen, replacing the whole
> form rather than stacking a refusal onto it. Brian: "If I say 'This is
> them,' it should basically close… That's not an error state. That's
> just a normal thing… say, 'Okay, they're fine, no changes will be
> made,' and then go back to the recruits."

## src/app/operate/recruitment/new/add-recruit-form.tsx — Academic section

> V-2, correction round 2 — Brian: "The add-to form seems narrow…
> We can use the forms from before to see which fields we're
> asking for there." The shipped intake forms' own field set
> (`signup-form.tsx`, `edit-person-form.tsx`), not one invented
> here. Every field below is optional — `REQ-missing-never-blocks`
> still names only first name, last name and mobile.

## src/app/operate/recruitment/new/add-recruit-form.tsx — "How we may contact them" section

> V-10, correction round 2 — Brian's own authorised, scoped
> exception to the no-narrative-text rule: this surface, and
> only this surface, explains itself.

## src/app/operate/recruitment/board-columns.ts — eventColumns

> Both sort — Brian, 2026-09-02: "RSVP in attendance should be sortable
> here" — through the same `column.sortable` idiom every other column
> already uses (the board's `TableSortLabel` header and `applyBoard`'s
> generic `rawValue`/`comparable` machinery need nothing event-specific;
> `rawValue`'s `event:<eventId>:rsvp|attendance` case already resolves
> these two).

## src/app/operate/board-filter-controls.tsx — StatusPill

> Which MUI semantic colour each board's own values map to is that board's
> own choice (Brian, 2026-09-02: recruitment's own colours "are fine"); the
> formula — one small `Chip`, coloured, labelled, nothing else — is what
> has to match.

## src/app/operate/recruitment/new/actions.ts — link-intent, already-member match

> V-3 / V-4, correction round 2: a player match used to fall into the
> ordinary `formError` banner, stacked on the still-visible candidates
> panel and form beneath it — Brian's own "flurry of information."
> `refuseIfAlreadyAMemberIn`'s own rule names exactly this outcome; it
> is not an error to report, it is the one clean confirmation screen
> below, and everything else this action would otherwise return is
> dropped in favour of it.

## src/app/operate/recruitment/new/create-state.ts — collegeEmail

> LAN-268, Brian 2026-09-09. Required, and only an `ox.ac.uk` address is
> accepted — the operator adding somebody by hand is held to the same rule
> as the recruit filling the door in themselves, because it is the same
> fact about the same person.

## src/app/operate/recruitment/new/create-state.ts — knownAs

> V-2, correction round 2 — the shipped intake forms' own field set
> (`signup-form.tsx`, `edit-person-form.tsx`), not one invented here.
> Every field below is optional; `REQ-missing-never-blocks` names only
> first name, last name and mobile.

## src/app/operate/recruitment/new/create-state.ts — AddRecruitAlreadyMember

> V-3 / V-4, correction round 2 — "This is them" on a candidate who already
> holds a membership this season used to fall into the ordinary `formError`
> banner, stacked on top of the still-visible candidates panel and form:
> Brian's own "flurry of information" and "that's not an error state."
> Set only for that one outcome, and rendered as this record's own single
> confirmation screen — everything else disappears while it is set.

## src/app/operate/recruitment/[prospectId]/send-questionnaire-button.tsx — file header

> `W2-04` (Brian, 2026-08-31 — "the pop-up... should be the answer at the
> moment of action") is why this button is never natively `disabled` for an
> _unconsented or ineligible_ recruit: a disabled HTML button fires no
> `onClick` at all, so a control that cannot be pressed cannot open a
> dialog either — correction round 1's F-LAN204-005. For those reasons the
> button always opens the dialog; the dialog is what refuses, in words, at
> the moment of action, whether the service layer would have refused anyway
> or the operator confirms a real send.
>
> Walk correction (W-1): a `declined` recruit is different — `declined`
> already carries its own top-of-record banner (`record-view.tsx`'s
> `bannerDetail`) stating the refusal before either button is ever reached,
> so there is no explanation left for the dialog to be the sole place
> holding. Discovering the refusal one click into a confirm dialog instead
> of up front is exactly the gap the walk found, so `declined` is the one
> case this button is natively `disabled` for — `blockedByDecline`, passed
> by the caller.

## src/app/join/[code]/twitter-image.tsx — module header (LAN-279). Destination: `docs/ux/design-system.md`

> Next reads the two file conventions independently: a route with only an
> `opengraph-image` emits `og:image` and no `twitter:image`, and a client that
> prefers the Twitter tags then falls back to the root card. iMessage is one of
> them. So the sign-up card has to be declared twice, and this re-export is how
> it is declared twice without being drawn twice.

## src/lib/qr/qr-matrix.ts — module header, "What is proved, and what is not" (LAN-204).

> `qr-matrix.test.ts` asserts the structural invariants a decoder relies on
> (matrix size, finder/timing/alignment placement, the fixed dark module),
> the exact fixed format-info value this module's one configuration must
> always place, and — via an independent reader it writes from scratch,
> `decodeQrMatrixByteMode`, which knows nothing of this file's own internal
> functions — that every supported byte length round-trips back to the text
> that went in, including a Reed–Solomon consistency check on the codewords
> actually stored in the grid. That test suite did not always contain the
> last three of those: correction round 1 (F-LAN204-002) found, the hard
> way, that "both format-info copies agree with each other" and "the two
> codewords match" are both satisfiable by a self-consistent but _wrong_
> encoding — a real scanner (Apple Vision, via this repository's own
> `decode_qr.py`) returned `NO BARCODE FOUND` for a build that passed every
> test in this file as it then stood, because the format-info value both
> copies agreed on was reversed bit-for-bit (LSB-first instead of the
> spec's MSB-first), so a real decoder recovered the wrong mask and level
> from it. One production scan has still never been performed against this
> module's actual output — the local toolchain has no scanner of its own —
> so that residual gap is recorded in the package receipt rather than
> asserted away here.

## src/app/a/[token]/presentation.ts — `PLANS_CHANGED`. Destination: `docs/ux/tickets/LAN-172-player-answer.md`.

> The same shortcut `/me/[token]`'s focused panel already offers a standing
> Yes, now also offered here, before the RSVP has even been recorded yet.

## src/lib/services/audience-selection.ts — AUDIENCE_GROUPS recruits entry

> D46. A recruitment event is the one occasion the club invites people who
> are not on the roster, so this is the one type the group appears on.
>
> LAN-295: this used to be the _only_ place the rule was stated, which made it
> a rule about a button rather than about who may be invited — the recruits
> themselves stayed in the catalogue on every event type, tickable one by one.
> `listAudienceCatalogueIn` now keeps them out of the catalogue entirely
> unless the event is `recruitment` class, and this entry is what stops the
> group appearing on the two screens that would otherwise offer an empty one.

## src/lib/services/audience-selection.ts — AudiencePerson header (LAN-294 duplication)

> Brian, 2026-09-10, opening the picker on a practice event and finding Bertram
> and Caspian listed twice each: a person who is a player, a coach and a
> committee member appears **once**, and "it can be one thing; it can be
> subdivided, doesn't really matter" — the row's second line may combine the
> roles. One invitation per person per event.

## src/lib/services/audience-selection.ts — groupSize

> How many **people** a group invites — not how many rows it selects.
>
> "Everyone active" spans three capacities, and the club's coaches and committee
> are mostly also players, so the row count and the human count differ by a
> dozen. The first version showed the row count and explained the discrepancy in
> a sentence under the button. Brian's response was that the club knows what
> "everyone active" means and should not be taught arithmetic about its own
> roster — so the button now says what it will actually do, and there is nothing
> left to explain.

## src/lib/services/audience-selection.ts — groupIsSelected

> It compares **people**, not keys, and that is not a refinement — it is the
> difference between working and not. "Everyone active" spans 45 keys for 34
> humans, and the audience saved on the draft holds one key each. Reloading the
> builder therefore restores 34 keys, and a key-wise comparison would find 11
> missing and leave the button dark while every one of its people was in.

## src/lib/services/audience-selection.ts — toggleGroup (removal bug)

> ## Removal is by key, and the first version got this wrong
>
> It removed every key belonging to a _person_ in the group. That is
> indistinguishable from key-wise removal for "Everyone active" — which is the
> only group the test exercised — and destructive for every narrower one:
>
> - Select **All active players** (Alice, Bob, Cara), then **All active
>   committee** (adds Xena), then press committee again to undo. Alice also
>   holds a committee seat, so person-wise removal took her out too — even
>   though the players group put her there and is still lit.
> - Worse, with one press: after selecting players, **All active coaches** is
>   already lit, because the only coach is a selected player. Pressing it to
>   _add_ coaches took the remove branch and deleted her. Fewer people than
>   before, and no coach added.
>
> Ten people in the seeded club hold two capacities, so that was one mis-click
> from an approval quietly missing somebody, with the audit recording the
> already-shrunk count. Independent review found it; `npm run test` did not.
>
> ## Why a lit button can then do nothing
>
> `groupIsSelected` asks whether everybody in the group is invited, so it can
> light up for a group whose own keys are not in the selection at all — the
> coaches case above, and any group restored from a saved audience, which holds
> one key per person rather than one per capacity.

## src/lib/services/audience-selection.ts — AudienceGroupSummary header (LAN-242)

> Brian, 2026-08-21: "it should say at the very top what groups it would be ...
> You don't have to show me how it's done." An approver checks a shape faster
> than they check a list of thirty-five, so the review leads with **All active
> players, all coaches** and a headcount, and the names follow underneath.
>
> ## A member who has since gone inactive is still one of the people (LAN-242)
>
> This summary is read against a _saved_ audience, and a saved audience outlives
> the catalogue it was built from: a player whose membership lapsed after the
> draft was written is still a row in `event_audience_members` and still a name
> on the screen, but the builder would no longer offer them. `resolveSelection`
> refuses such a selection outright — correctly, because a _write_ that silently
> shrank would invite a list nobody confirmed — and this function used to reach
> for it. One lapsed membership therefore collapsed the whole summary to
> `total: 0`, so **every** event with any history at all printed "0 people"
> above its own list of sixty-one names, on the event page, the approval review
> and the cancel screen alike (LAN-239, walkers M2/M4/M6).
>
> Reading is not writing. Here an unknown key is a person the club still
> invited, so it is counted rather than refused: it lands in
> `noLongerSelectable`, it is part of `total`, and it is deliberately not part
> of `others` — "chosen by hand" is a statement about how somebody was picked,
> and a lapsed membership is not that.

## src/lib/services/attendance/read.ts — RECRUIT_ROSTER_QUERY

> Every recruit on the board this season, for a recruitment event's sheet
> only — Brian, 2026-09-01, on the running fidelity mockup (LAN-200). W12's
> own "recruits first" is therefore not an invitation filter the way a
> player's row is; a recruit belongs on the sheet by virtue of being an open
> or recently-exited prospect for this season, invited to this particular
> event or not.

## src/lib/services/attendance/write.ts — mintWalkUpProspect recruitment_prospects insert

> `identified` is the honest status: somebody turned up and gave a number.
> Nothing about that says they have engaged or committed, and the schema
> requires a date for either of those. `source` records where they came
> from in the club's own words — Brian locked "walk-up" as the word,
> 2026-08-31, and this string is what the recruit board's own Source column
> shows, so it has to say it too.

## src/lib/services/recruitment-signup.ts — probeExistingRecruitForQrSignup

> "The match is confirmed only in terms the visitor already supplied — a
> first name they typed and the last three digits of the number they typed.
> Nothing is revealed that they did not already know" (`W7`, "The one thing
> this screen must not become"). This function is the mechanism that makes
> that true: it returns a bare boolean, never a name, a masked contact value,
> a database identifier, or anything else about the candidate. The caller
> echoes the visitor's _own_ typed input back to them; it never reads
> anything from this result to render.
>
> LAN-208: uses {@link findPersonMatchingGivenNameAndPhoneIn}, not
> `findPersonDuplicates` — that function ORs given-name/family-name/alias/
> email/phone across the whole candidate row, so a candidate's own phone
> alone would set `found: true` regardless of the name typed, for anyone in
> `public.people`, not just recruits. This requires the given name (or an
> alias) **and** the phone together, on the _same_ row.
>
> There is no identifier in {@link SignupDuplicateProbe} to link at write
> time — see {@link probeExistingRecruitForQrSignup}'s doc comment. The write
> path re-runs this same match itself, from the visitor's own resubmitted
> name and mobile, rather than trusting an id echoed back from this read.
>
> Runs only when a mobile number was actually supplied — `W7`'s privacy
> reasoning is stated in terms of _a name and a phone number together_, and a
> name-only match would surface a false positive for every other Alex on the
> mailing list. No mobile, no probe: the QR door goes straight to creation.

## src/lib/services/recruitment-signup.ts — signUpAnonymouslyIn

> The QR (anonymous) door. `linkExistingPersonId` is set only when the
> recruit answered "Yes, that's me" to {@link probeExistingRecruitForQrSignup}'s
> own question — re-checked here, inside the transaction, never trusted from
> the client (the same posture `createPerson`'s `link_existing` branch
> already takes): a stale or merged-away id falls back to creating a new
> person rather than failing the whole submission, matching `W7`'s "refuses
> nobody and blocks on nothing."
>
> LAN-208: nothing upstream of this parameter ever hands an anonymous caller
> a person id to echo back. The QR door's own action
> (`src/app/join/[code]/actions.ts`'s `submitQrSignup`) derives whatever it
> passes here itself, inside its own transaction, by re-running the same
> strict given-name-and-phone match against the recruit's resubmitted
> `givenName`/`mobile` — this parameter's contract (re-checked, falls back
> gracefully) is what makes that safe to do unconditionally.

## src/lib/services/recruitment-candidate-identity.ts — module header

> "Each candidate has to say who it is" — `W8`, Brian 2026-08-31: "Are they a
> part of the current season? Are they already a player on the season? Are
> they another recruit? Who are they, because it could have the same name."
