# M-EVENTS-CALENDAR-TARGET-STATE — decision history relocated from source

Paragraphs that explained a decision inside a source comment, moved here by LAN-300 so the
source reads as code. Each keeps a one-line pointer at its old location. Nothing here changes
a decision; it records where one was explained.

## src/app/operate/events/templates/template-editor.tsx — `TemplateEditor` (module header)

> ## Two submissions of one form
>
> **Save…** posts to `previewEventTemplateAction`, which writes nothing and
> returns the blast radius. The dialog then posts the _same fields_ to
> `saveEventTemplateAction`, which recomputes that blast radius under its own
> locks and applies it. The operator is never shown one plan and given another,
> and the browser is never trusted to carry a plan forward — it carries the
> form, and the server decides again.
>
> That is why the dialog re-renders every field as a hidden input rather than
> posting an identifier for something the server stashed. There is no server-side
> draft to go stale, and no session state to disagree with the form.

Ids named: W8.

## src/app/operate/events/templates/template-editor.tsx — `TemplateEditor` (module header)

> ## The screen's whole job
>
> W8: "An operator who has never used this should be able to tell, from the
> screen, that editing a template is safe." So the confirmation names the drafts
> that will take the change, names the ones that will not **and why**, and states
> what will not move at all — approved events and past events, which are never
> touched by anything here.
>
> The button says what it will do. "Save and update 3 drafts" is a different
> promise from "Save", and the operator should not have to infer which one they
> are making.

Ids named: W8.

## src/lib/services/events/index.ts — module header

> ## What this module is responsible for, and what it is not
>
> The database owns what each _state_ requires, and none of it is
> re-implemented here:
>
> - invariant E1a — an approval needs a date, an approver and a confirmed
>   audience (`events_approval_requires_date_and_audience`). A draft may
>   legitimately be incomplete, and this module never fills a gap in to make
>   one look finished.
> - invariant P1 — an invitation cannot exist against a `draft` event, held
>   by the cascading composite foreign key from `invitations`. Nothing here
>   asserts it; `readEvent` _reads_ the counts so a screen can state it as an
>   observed fact.
> - invariant E4 — two or more events on one date is legal. There is
>   deliberately no uniqueness check anywhere in this file, and a test proves
>   two same-date drafts are both accepted.
>
> ## Why there are no status transitions here any more
>
> There were five, and LAN-151 removed all of them with the statuses they moved
> between.
>
> - `draft → withdrawn` (abandon) went with `withdrawn`. "Withdrawn" meant it
>   never became an event, which is what a _deleted_ draft means now (D29).
>   `deleteEventDraft` (`./write`) is that path, added by LAN-154: there is no
>   status to move to, because the row goes.
> - `approved → occurred`, `approved → not_held` and the two corrections went
>   with the occurrence assertion itself. **Nothing asserts that an event
>   occurred** (D30, REQ-occurrence-retired): the date passing without a
>   cancellation is the whole of it, and `derivedEventState` in
>   `./event-input` is where that is written down.
>
> Approval is `./event-approval`. Cancellation (W6) and amendment (W5) are
> `./event-amendment`.

Ids named: LAN-151, D29, D30, REQ-occurrence-retired, W6, W5.

## src/lib/services/event-templates/index.ts — module header

> ## The rule this module exists to make safe
>
> D41, as Brian refined it on 2026-08-21: **template values flow into a draft
> field by field, and only into fields nobody has touched. Approval freezes
> everything.**
>
> > "If I create an event and write a custom description, and then I update the
> > template, it would not update the description. But if I didn't change the
> > kit — it's just the default and it's the same — then it updates that."
>
> Taken literally over the whole record, D41 would let a March edit to the
> Practice template overwrite a description somebody wrote by hand on next
> Wednesday's session. That is the same class of failure as an amendment
> discarding people's answers: the system quietly destroying work somebody did
> deliberately.
>
> ## How "untouched" is decided without a marker
>
> There is no `edited` column, and this module does not need one. A new event of
> a type is created with exactly `templateDefaults(template)`, so a draft field
> still holding the value the _old_ template gave it is a field nobody has
> touched, and one holding anything else was edited. The comparison is against
> the template as it was a moment ago, inside the same transaction that replaces
> it, so there is no window in which the two disagree.
>
> The one imprecision is worth naming rather than hiding: an operator who types
> a value that happens to equal the current default is indistinguishable from
> one who left it alone, and their field will move with the next template
> change. The cost is bounded — the value they typed was the default anyway —
> and the alternative, a per-field provenance marker on every event, is a schema
> change this work package does not own.
>
> ## Operators create, rename and delete templates — LAN-265
>
> This module used to say the opposite, and the reversal is Brian's, with Stu
> and Clint, on 2026-09-09: "A template is anything the operators want to
> create." There were exactly seven, none created and none deleted, which was
> why `event_templates` was granted `select, update` and nothing else — adding
> an eighth _type_ was a change to the approved domain model. It still is: what
> LAN-265 separated is the **template**, which is an ordinary administrative
> act, from the **behavioural class** underneath it, which remains a migration
> and Brian's decision. Every template carries a class; nothing on any screen
> shows or chooses one, and anything an operator creates gets
> `DEFAULT_TEMPLATE_CLASS`.
>
> Three consequences run through the rest of this file. A template is read by
> its own `id` rather than by a class, so a rename cannot break a link.
> `createEventTemplate` writes the template, its messaging cadence and its
> settings row in one transaction, because a template that could be picked and
> would then refuse at approval fails in front of the wrong person.
> `deleteEventTemplate` refuses once any event names the template, because
> after LAN-265 the template's name is the only label an event has.
>
> ## And no timing of any kind
>
> A template holds no RSVP deadline, no chase threshold and no send timing.
> Those live in `event_type_settings` for Mission 4 to consume. W8 removed them
> from the template on 2026-08-21: a template is what an event arrives looking
> like, and when somebody is chased is not part of what an event is.

Ids named: D41, LAN-265, W8.

## src/lib/services/event-amendment/index.ts — module header

> ## The one thing this module exists to protect
>
> An approved event with thirty-seven invitations and twenty-five answers is
> the only record in the application where somebody changes something people
> have already acted on. Every write below is therefore additive to the
> invitations and the responses: nothing here deletes an invitation, deletes a
> response, or re-opens one. The acceptance evidence asks for that by **count
> and identity**, and `event-amendment.test.ts` asserts it that way.
>
> ## The event never leaves `approved` (REQ-amend-in-place)
>
> D49 makes `approved → draft` a real transition and this workflow does not use
> it, because D4 was decided separately and makes drafts publicly visible: an
> event with thirty-seven invitations would appear on the public calendar as a
> draft for the length of an edit, and indefinitely if the operator were
> interrupted. `amendApprovedEvent` therefore never writes `status` at all, and
> guards every update on `status = 'approved'` so that a concurrent
> cancellation cannot be overtaken by an amendment that thinks it is still
> live.
>
> Holding the change until Save is the **screen's** job and not this module's,
> and that is the design rather than an omission: a pending amendment that was
> stored would be a fourth state of the event that somebody could leave behind.
> `amendApprovedEvent` is called once, with everything, at the moment the
> operator presses Save — so abandoning an amendment writes nothing anywhere,
> which is what "leaves no trace" has to mean.
>
> ## One notify decision, and where the record of it lives
>
> The operator makes exactly one decision per amendment (D54, D55, as W5
> reframed them), and it is recorded in two places that are written together:
>
> - **`public.schedule_changes`** — invariant E2's typed schedule history,
>   which LAN-151 extended with `previous_ends_at`, `new_ends_at`,
>   `previous_name`, `new_name` and `notified` for exactly this. One row per
>   amendment that moved a **schedule-shaped** field.
> - **`public.audit_events`** — one row per amendment, always, naming the
>   actor, every field that moved, and the notify choice.
>
> ### Why both, and what that says about `schedule_changes`' fitness
>
> `schedule_changes` was the natural home and it is the right home for what it
> can hold, but it cannot hold an amendment on its own. Its
> `schedule_changes_something_actually_changed` constraint enumerates the
> columns it has — date, start, end, venue, name, opponent — so an amendment
> that changed only the description, only the required equipment, or only
> mandatory-versus-optional is a change the table **structurally refuses**.
> Those are precisely the amendments D55 calls the ordinary case. A history
> built on `schedule_changes` alone would therefore be silent about the
> commonest kind of amendment there is, which is the opposite of §4.13's
> requirement that the change be retained and queryable.
>
> So the split is: the schedule row is the typed record of the **schedule**,
> and the audit row is the record of the **amendment**. They are written in one
> transaction and linked — the audit context carries the `scheduleChangeId`
> where there is one — so the two cannot disagree about whether an amendment
> happened. `readEventChangeHistory` reads the audit stream, because it is the
> only one of the two that sees every amendment.
>
> Making `schedule_changes` able to hold a description change is a migration,
> and this work package owns no migration.
>
> ## The hold, and the seam it sits on (REQ-amend-hold)
>
> Saving an amendment sets `held_at` on every not-yet-sent message for the
> event. A **hold**, not a cancellation: the obligation survives and Mission 4
> decides whether each job resumes as it was, resumes carrying the corrected
> details, or is replaced. `claimJobIn` in `./delivery` refuses to claim a held
> job, which is what makes the hold a fact about delivery rather than a column
> nobody consults — the failure it prevents is an invitation queued on Monday
> arriving on Wednesday describing a venue that changed on Tuesday.
>
> A **cancellation** is the other case and takes the other action: W6 says
> queued messages are cancelled with the event, and there is nothing for them
> to resume into, because the event is terminal.
>
> ## What is owed, and what is sent
>
> When an amendment or a cancellation notifies, this module writes one
> `notification_jobs` row per invitation, of type `schedule_change_notice` or
> `cancellation_notice`. That row is the **obligation**: somebody is owed a
> message about this event. It carries no channel and no `scheduled_for`,
> because when it goes, over what, in which words, and what happens when it
> fails are Mission 4's questions — the packet's own test is whether the answer
> would change if the club moved from WhatsApp to email tomorrow, and every one
> of those does.
>
> `template_variables` is left empty for a reason that is asserted by test
> rather than described here: **the internal cancellation reason never enters a
> recipient-facing payload** (D59, D76).
>
> ## Nothing here formats a sentence for a person
>
> The audience is the whole invited list, decliners included (OD-1/Q9), and a
> yes stands — nobody is asked to answer twice (D51, D52). That is expressed by
> selecting every invitation and touching no response row, not by a flag.

Ids named: REQ-amend-in-place, D49, D4, D54, D55, W5, D59, D76, D51, D52, OD-1/Q9, REQ-amend-hold, W6.

## src/app/operate/shell-nav.tsx — accountAction prop

> LAN-225 (audit B3): the sign-out form, rendered in the account block so a
> phone never spends 180px of its first screen on the account before the
> page title. A slot rather than an import, because the action is a server
> function and this is a client component.

## src/app/operate/admin/presentation.ts — membershipStatusLabel

> The stored membership status, in the club's words.
>
> Reusing the roster's own map rather than writing a second one. That map's own
> note says why it exists — LAN-90 § 4 requires the mapping "to be decided once
> and used everywhere, so three issues do not invent three labels for one
> state" — and Administration showing a player's membership is a fourth screen,
> not an exception.

## src/app/operate/events/[id]/attendance/presentation.ts — describeRsvp

> "Delivered never means responded. Attending is intent; Present is observed
> attendance." The prefix is deliberately kept on every one of these so that a
> recorder scanning a column never reads an intent as an observation.

## src/app/operate/events/[id]/attendance/presentation.ts — ATTENDANCE_OPEN_DETAIL

> What the register panel says, in two states.
>
> Both sentences say what the surface does. Neither describes what the product
> no longer asks for — VG-003: "That second line is weird. Why is that in the
> app?" The controls being gone is the whole of the change, and an app that
> narrates its own history is explaining a decision the reader never saw made.
>
> The rule they describe is D71 and D72's, and it is the clock's: the register
> opens shortly before the event starts and never closes afterwards. It is
> deliberately not "once the date has passed" — that was this file's previous
> answer and it was wrong, because the person taking a register is standing at
> the pitch while it fills up.

## src/app/operate/events/[id]/attendance/presentation.ts — describeOperatorLock

> The operator's version of the locked state — corrected by W9-F1.
>
> `describeCoachLock` below is the same idea in the other seat, and the two are
> deliberately parallel. W-F6 made the coach's specific and left this one
> generic, which was rule 7 the other way round rather than a fix: one screen
> naming what happened to _this_ event, the other reciting the design and
> leaving the reader to work out which limb applied.
>
> Three things were wrong with what stood here, and all three arrived with this
> package. It stated the rule instead of the event. It said "the service
> rejects attendance writes", naming an internal component to a club operator
> who has no "service" in their world. And "opens shortly before it starts" was
> exactly as false for a cancelled event whose start had passed as it was on
> the coach's screen before W-F6.
>
> The asymmetry that matters is the other one: **the operator is the seat that
> can act.** A draft is theirs to approve, so the sentence names that step —
> `docs/ux/standards.md` rule 4. A cancellation is not theirs to undo, and rule
> 4 is met by saying so plainly rather than by leaving a reader hunting for a
> control that does not exist.

## src/app/operate/events/[id]/attendance/presentation.ts — describeRegisterOpensAt

> What lifts it — `docs/ux/standards.md` rule 4, and finding W-F3.
>
> A refused control names the step that enables it, and here the step is not
> something anybody can go and do: it is the clock. Naming the moment is the
> whole answer, and it is the whole of what this says.
>
> There was a second sentence — "The register opens about six hours before the
> event starts, and never closes afterwards." Brian cut it: the first sentence
> has already answered the question, and how long a register stays open is
> irrelevant to somebody being told they cannot open it yet. The buffer is
> still one tunable number, `ATTENDANCE_REGISTER_BUFFER_HOURS` in
> `services/attendance-window.ts`; no screen repeats it in words.

## src/app/operate/events/[id]/attendance/presentation.ts — formatShowedAgainstInvited

> `— / 37` before a register has been saved, `0 / 37` after one was saved with
> everybody absent, `20 / 37` the rest of the time.
>
> ## The dash is the whole point
>
> D74: an event nobody has got round to must not read like an event nobody
> attended. Both are a small number over forty-seven, and the club acts very
> differently on them — one is a session to ask about, the other is a register
> to go and take. The save is the signal, and `registerSaved` carries it.
>
> ## And it is never a percentage
>
> D62 says raw pairs. "43%" is the same fact with the two numbers the club
> actually wanted taken out of it.

## src/app/operate/events/[id]/attendance/presentation.ts — COACH_LOCKED_HEADLINE / describeCoachLock

> The coach's version of the locked state — corrected by W-F6.
>
> This screen is **not** the buffer's. A coach reaches it only for a draft or a
> cancelled session, both of which fail the register's status half; the session
> that has not started yet gets `REGISTER_NOT_YET_HEADLINE` and a moment.
>
> It used to say "This session's register has not opened yet" and then recite
> the buffer rule, which was false twice over for a cancelled session in the
> past: its start had gone, and no register was ever coming. The operator's
> equivalent named the real reason and the coach's did not, so the two seats
> were told different things about one event.
>
> Neither sentence is an instruction. A coach can neither approve a session nor
> un-cancel one, so naming the step is naming what somebody else's decision was
> — which is the honest thing to say, and the reason the two cases are worded
> apart: a cancellation is final, and a draft is not.

## src/app/operate/events/[id]/attendance/presentation.ts — WALK_UP_RECONCILIATION_NOTE

> What the club ends up with, said before the operator commits — Brian,
> 14 August 2026: a walk-on "should go in like a new person is being added, not
> in the roster, not in the season roster, but in the person in the
> recruitment".
>
> Both halves are load-bearing. **Into recruitment** is what somebody picking
> this up next week needs to know to go and find them; **not onto the roster**
> is the approved criterion that the record "cannot be mistaken for a completed
> membership", and is why nobody has to take them off a team sheet afterwards.

## src/app/operate/events/[id]/attendance/presentation.ts — WALK_UP_ALWAYS_PRESENT

> A walk-up is recorded **Present**, and the form does not ask — Brian,
> 14 August 2026: "when they're added as a walk-up, they should be
> automatically added as present."
>
> It is the only attendance value the situation can produce. Somebody is being
> typed into a form because they are standing in front of the person typing;
> an uninvited person who is _absent_ is not an event that happens, and asking
> a coach to confirm what they can see is a decision taken away from the thing
> they are actually doing.
>
> It is not a lock. The four buttons on the row it creates work exactly as they
> do for anybody else, so a walk-up who turned up late or left at half time is
> corrected in the same place and audited the same way. The note below says so
> on the form, because a value chosen for you without explanation is a value
> you do not trust.

## src/app/operate/events/[id]/attendance/presentation.ts — WALK_UP_ADDED

> The recorded confirmation — Brian, 2026-08-31: "I think a smaller text box
> that says 'Walkup added' is perfectly fine." A short label, not a
> paragraph, replacing the sheet's own former "Walk-on recorded…" sentence —
> `docs/ux/standards.md`'s no-narrative-text rule applies here as much as
> anywhere else on this surface.

## src/app/operate/events/presentation.ts — NO_AUDIENCE_YET

> What a draft with nobody in its audience says — D47.
>
> It used to read "Chosen at approval", which is no longer true of most events:
> a type whose template names a default audience arrives with one already set,
> and only a type whose template says nothing arrives empty. So the words state
> what is the case rather than what is about to happen.

## src/app/operate/events/presentation.ts — CLUB_TIME_ZONE_NOTE

> D86. The zone every event time is in, said on the **form** rather than
> assumed.
>
> The recorded defect this closes: the date input renders in the browser's
> locale, so an operator in Oxford could be reading `mm/dd/yyyy`, and the two
> time fields carried no zone at all. Per-user timezones are a later release
> (DEC-timezone); this is the club's, fixed, and stated.

## src/app/operate/events/presentation.ts — JOINING_URL_IS_PUBLIC_WARNING

> What an operator pasting a joining link is told — LAN-284, Brian 2026-09-09.
>
> This replaces `JOINING_URL_IS_NEVER_PUBLIC`, and the reversal is the whole
> point of the sentence. The link used to be operator-only, and the old text
> said so. It is now published on the public event page and carried in the
> subscription feed, and the only thing standing between an unprotected meeting
> and the open internet is the operator's own care over what they paste —
> nothing in this application can check whether a meeting has a passcode set.
>
> So this is a warning rather than a note, and it is one line rather than a
> gate: the operator is told what will happen and what to make sure of, and
> then trusted, because a gate here could only ever be a checkbox asserting
> something the application cannot verify.

## src/app/operate/events/presentation.ts — describeTermCoordinate

> The derived coordinate in the club's words — "Michaelmas 2026-27, Week 1", or
> "Outside term" for a date no Oxford term contains.
>
> Takes the terms rather than a label because it is fed by
> `deriveTermCoordinate`, which returns ids: the same function runs in the
> browser as the operator picks a date and on the server when the draft is
> saved, and both need to say the same sentence.
>
> This is the **form's** sentence, about the coordinate that will be stored. The
> calendar's own answer is `@/lib/services/oxford-year`, which is a wider one:
> it names the vacation a date falls in, and the stored coordinate has no way to
> hold that (`events.week_number` is constrained to −1..8).

## src/app/operate/events/presentation.ts — describeAudienceRow

> The second line of a picker row — everything the club knows about that person,
> in labels and values and nothing else. LAN-294.
>
> One row is one human now, so the line has to carry every capacity they hold.
> Brian, 2026-09-10, on how much that matters: "it can be one thing; it can be
> subdivided, doesn't really matter." So the shape is the simplest one that
> stays readable — each capacity followed by its standing, in the order a write
> would pick between them, with the playing unit sitting where it belongs
> (against the player capacity, not stranded at the end) and one contact at the
> close:
>
>     Player · Active · Both · Committee · President · bertram@…
>
> No sentence, no explanation, no arithmetic — `docs/ux/slice-ux.md` §6.

## src/app/operate/events/presentation.ts — describeBuilderDefault

> What the builder says under its heading — and the one sentence in the
> application that D47 explicitly reverses.
>
> It used to read: "Nothing is selected to begin with, and there is no
> whole-roster default: the audience is stored as the explicit list you confirm
> here." The last clause is still true and is still what the database holds. The
> first is not: a type's template supplies a default audience, and the approver
> checks it rather than rebuilding it.
>
> So the sentence now names the template that put people there, and says what to
> do with them. A type whose template names no groups gets the second form,
> because on that event nothing did arrive and there is nothing to check.

## src/app/operate/events/presentation.ts — approval paragraph (removed, not replaced)

> A paragraph explaining what approving does used to sit at the foot of this
> screen — that it confirms the list, creates invitations, queues delivery and
> freezes the audience. Brian removed it on 2026-08-21: "You don't really have
> to explain what approving does because we already know what it is ... That's
> over-explaining for no reason."
>
> Nothing replaced it, deliberately. The screen shows what is being approved and
> the button says what it will do, and that is the whole of it.

## src/app/operate/events/presentation.ts — DELETE_DRAFT_DIALOG_DETAIL

> The confirmation's body — the reason a draft can be deleted at all.
>
> Brian, 2026-08-21, on the rule that an approved event cannot be deleted:
> "That warning should pop up if you try to delete an approved event ... I don't
> think it needs to be called out there specifically." So it is not here. It is
> on the refusal, where somebody has actually run into it.

## src/app/operate/events/presentation.ts — duplicatedFrom

> What the create form says when it opened from another event.
>
> D39 as Brian settled it on 2026-08-22: duplicate opens the create form
> prefilled, and nothing is written until the operator saves. The sentence says
> which event it copied, because "prefilled from something" with no name is a
> form an operator cannot check.

## src/app/operate/events/presentation.ts — formatPlanWhen

> One rung's instant, in the club's own zone — "Sat 10 Oct · 18:00".
>
> Compact rather than `formatDeadline`'s full sentence, because a plan lists
> several of these in a column and a reader scans it as a schedule rather than
> reading each line as its own fact. Still `Europe/London`, for the reason
> `formatDeadline` gives: rendering a plan instant at UTC would show every
> step an hour early for the whole of British Summer Time.
>
> The month comes from `shortMonthOf`'s fixed table rather than a second
> `Intl` call: recent ICU data renders `{ month: "short" }` for September as
> "Sept" in `en-GB`, four letters where every other month gets three, and
> this club abbreviates every month to three letters everywhere else in the
> application (`formatShortDate`, the events list). One September rendered
> differently on this one screen would be a defect a reader notices before a
> test does.

## src/app/operate/events/actions.ts — deleteEventDraftAction

> Deletes a draft, permanently — REQ-delete-draft, D29.
>
> Guarded on `event_calendar_management`, the same capability that creates and
> edits one: deciding an event should never have existed is drafting work, and
> it releases nothing and tells nobody. Approval's capability is for the act
> that sends messages to real people.
>
> The refusal for anything that is not a draft lives in the service, so a client
> skipping the confirmation reaches it anyway. This action does not check the
> status at all, deliberately — a second opinion here would be one more place
> for the two to disagree.

## src/app/operate/events/actions.ts — saveEventAudienceAction

> Saves the audience proposed against a draft, and moves to the confirmation.
>
> Separate from approval because the audience is now stored on the draft rather
> than assembled at the moment of approval — Brian's decision, after the first
> implementation lost a forty-person audience when he pressed **Edit draft**.
>
> It redirects rather than returning the saved list, so the confirmation screen
> renders from the database rather than from whatever the browser last held.
> That is what makes the audience survive an edit, a refresh, a closed tab and a
> second operator — the screen has no private copy to lose.
>
> An empty selection is saved, not refused. Clearing an audience is a thing an
> operator must be able to do; the confirmation screen then shows UX-42 and
> approval refuses it under invariant E1b.

## src/app/operate/events/[id]/change-presentation.ts — whoHearsAboutIt

> W5-03's sentence about who hears, counted in people.
>
> How many people get a message is the consequence of the tick, so it stays.
> Which of them declined, and why they are told anyway, was the application
> explaining its own audience rule; `all ${recipients} invited` already
> includes them.

## src/app/operate/events/[id]/change-presentation.ts — RESCHEDULE_RECOMPUTES_NOTE

> W8, `REQ-reschedule-recomputes`, acceptance #7 — "the application says a
> reschedule is happening". The mockup's own sentence: a reschedule
> recomputes the response deadline and every reminder counted from it, using
> W7's rules, and this is the one place the operator is told so before they
> commit to it.

## src/app/operate/events/[id]/change-presentation.ts — telling

> R156-B4. The mockup's one worked example is a venue — "told this is at
> **Iffley Road Astro**" — and the build applied that same "at" to every
> material field, including a delivery-mode change, which read "told this is
> at In person": a stored value printed as though the sentence around it did
> not matter. `MATERIAL_FIELDS` is five fields, not one, and each needs the
> preposition that makes the sentence a sentence rather than a template with a
> value dropped in. `scheduledOn`'s value already arrives formatted — see
> `renderValue` in `event-amendment-rules.ts` — so this is about grammar
> only, never about the value itself.

## src/app/operate/events/date-time-controls.ts — module header

> W154C-C1/C2 — pure conversions between the strings this form's state (and
> the server action) speak (`YYYY-MM-DD`, `HH:mm`) and the `Date` objects the
> MUI X pickers speak.
>
> These exist because C1 and C2 replace the native `<input type="date">` and
> `<input type="time">` controls with MUI X's `DatePicker`/`TimePicker`: a
> native control renders in the browser/OS locale and ignores the page
> entirely (D86's whole complaint), where MUI X's field is drawn by the page
> itself with an explicit `format`, so day-month-year and — since Q-27 — a
> deliberately-drawn 12-hour clock with AM/PM in five-minute steps hold
> regardless of what the browser or OS thinks a date or time looks like. The
> strings these functions round-trip stay plain 24-hour `HH:mm`; only the
> picker's own presentation changed.
>
> The conversions are local-calendar, not UTC — a `Date`'s day/month/year and
> hour/minute getters read whatever the JS engine's local time zone says,
> which is also what the picker's field displays and edits. Going through
> `Date` and back is round-trip safe for that reason: what the operator sees
> in the field is exactly what these functions read back out of it.

## src/app/operate/events/date-time-controls.ts — scheduledOnFromDate

> A `Date` (or `null`) → `"2026-08-24"`, or `""` for anything unusable.
>
> The year is zero-padded to four digits even though a real event year never
> needs it. `DatePicker` is controlled with this string round-tripped back
> through `dateFromScheduledOn` on every render (see the field below), and it
> fires `onChange` with a genuine, if provisional, `Date` the moment the year
> section holds even one digit — a day and month already typed, plus a year
> of "2", is a real 0002-08-24. An unpadded "2-08-24" fails
> `SCHEDULED_ON_PATTERN`'s four-digit year, so `dateFromScheduledOn` would
> hand back `null` on the very next render — a value the field reads as "the
> application cleared this field", which resets the day and month the
> operator had already typed. Padding keeps every provisional value inside
> the shape the round trip understands, so the field only ever sees its own
> value reflected back, never wiped out from under a still-typing year.

## src/app/operate/events/event-actions.tsx — module header + ApproveEventForm

> The one status change an operator can make from the event detail: approval.
>
> There were five. "Submit for approval" and "Withdraw submission" went on
> 12 August 2026, because they modelled a proposer asking a gatekeeper and this
> club has no such relationship — only calendar operators create events at all.
>
> LAN-151 removed three more. **Mark occurred**, **Mark not held** and
> **Correct this to not held** went with the occurrence assertion itself
> (D30): nothing asserts that an event happened, and the date passing without a
> cancellation is the whole of it. **Abandon draft** went with the `withdrawn`
> status it produced — an abandoned draft is deleted (D29), and that path is
> this mission's W4 work package rather than this file's.
>
> Each is a real `form` posting to a server action, not a link and not a
> fetch. That matters beyond style: the action re-resolves the operator from
> the verified session and re-checks the event's current status inside the
> transaction, so a button rendered a minute ago against a draft that has since
> been submitted produces a refusal rather than a second transition.
>
> A refusal is shown where the operator was working, next to the button they
> pressed, and the event is re-read on the next render — nothing here caches a
> status and nothing decides from one.
>
> ---
>
> The approve button, and only the button.
>
> A client component because it needs `useActionState` for the pending state and
> the refusal, and nothing else on the confirmation screen does — the audience,
> the count and the deadline are all server-rendered from stored rows. Keeping
> the client boundary this small is what stops the confirmation screen holding a
> private copy of the audience that could disagree with the database.
>
> It posts the event id and nothing else. The audience was saved before this
> screen rendered, so there is no list to send, and therefore no list a browser
> could alter between confirming and approving.

## src/app/operate/events/events-list-support.ts — statusLabel

> What the Status filter offers, and what each row's Status column says — Q-6.
>
> Brian, at the visual gate: "I want to be able to see the status on the status
> filter, and I want to see the events that occurred, to easily be able to tell
> which ones happened versus not." So **Occurred** is a fourth choice beside the
> three stored states, and a past approved event reads `Occurred` in the column
> rather than `Approved`.
>
> It stays derived. Nothing stores it, nobody asserts it, and the enum is still
> three values (D30) — `EVENT_STATUS_FILTERS` lives beside `derivedEventState` in
> the service layer for exactly that reason, so a reader who follows the word
> arrives at the rule rather than at a column.

## src/app/operate/events/events-list-support.ts — emptyTestId/emptyMessage

> Colour is never the only carrier — every chip states its status in words.
>
> Keyed on the word the chip actually shows rather than on the stored status, so
> an `Occurred` chip cannot be shaded as though it read `Approved`.
>
> ---
>
> Three empty states, distinguished, because the recovery differs.
>
> `slice-ux.md` § 9, and `W1`'s exception table: "nothing this week" is not
> "nothing all season", which is not "nothing matching your filter". Each says
> what is true and offers the smallest recovery the reader is authorized to
> take — and none of them explains a rule.

## src/app/operate/roster/presentation.ts — module header

> The words the roster screens use, fixed in one place.
>
> LAN-90 § 4 requires the mapping from the frozen model's internal state names
> to on-screen language to be decided once and used everywhere, "so three
> issues do not invent three labels for one state". These are that mapping for
> `membership_status` and `membership_entry`, read from the approved
> wireframes rather than invented here: UX-20's status column reads Active
> and Inactive; UX-20's entry column reads Returning and New.
>
> `onboarding_item_status`'s own mapping lives in `onboarding-item-shapes.ts`
> (`itemStatusLabel`), not here — D-002 (correction round 3/4, Q-14) settled
> that the word for a status varies per item ("Invoiced" is not "Complete"),
> so it cannot be one flat map the way these two genuinely-uniform
> vocabularies are.
>
> The status vocabulary shrank to five under LAN-182, so UX-20's "Confirmed"
> and UX-21's "Carried forward → Confirmed" no longer name anything: both
> states map onto Onboarding. Nothing here invents a replacement word — the
> three struck labels are simply gone.
>
> No client component and no page carries a label of its own.

## src/app/operate/events/templates/form-state.ts — module header

> What the template editor hands back to its screen — W8-02 and W8-03.
>
> Beside `actions.ts` rather than in it, for the reason the events' own
> `form-state.ts` gives: a `"use server"` module may only export async
> functions, so a shared type or constant declared there would be a build error.
>
> ## Two outcomes now — LAN-276 correction round 1
>
> `phase` says which. `"editing"` is a fresh form or a refused submission;
> `"confirming"` carries the blast radius W8-03 shows and has written nothing.
> There used to be a third, `"saved"`, reached after a successful write; the
> save actions redirect to the template list now (Brian, 2026-09-10: "it
> should take me back to the other test templates"), so a state the browser
> would render after the write is never reached — `redirect` throws before
> either action returns one.
>
> The plan travels back to the browser only to be **read**. It is never posted
> forward and never trusted: `saveEventTemplate` recomputes it under its own
> locks, so what the operator saw is a courtesy and what happens is derived from
> the rows again at the moment of the write.

## src/app/operate/events/templates/new/page.tsx — module header

> W8-01's **New template** — LAN-265.
>
> Brian, with Stu and Clint, 2026-09-09: "A template is anything the operators
> want to create: 'Kicking Clinic', 'Full Pads Practice', 'Film Review',
> whatever they name."
>
> ## Empty, deliberately
>
> Nothing is copied from another template. "Kicking Clinic" is not a variant of
> Practice, and pre-filling it with Practice's venue, questions and audience
> would put words in the operator's mouth on the one screen whose entire purpose
> is that they get to choose. Every field is optional except the name, exactly
> as it is on an existing template.
>
> ## No class control, and that is the decision
>
> A template's behavioural class — `public.event_type`, the thing D46's
> recruits rule and the Monday report's buckets key off — is `practice` on
> anything created here, and there is no control for it because LAN-265 says
> there is not one: "new behavioural classes (new enum values) ... stays a
> migration and a Brian decision." The audience groups offered are therefore
> that class's, which is what `templateGroupsForEventType` is asked for here.

## src/app/operate/events/[id]/audience-list.tsx — describeAudienceShape / AudienceList

> "All active players, all coaches — 35 people".
>
> The groups first and the headcount after, which is the order Brian asked for.
> People chosen by hand belong to no group and are counted rather than named
> here; the list underneath is where they are read. A partly-selected group is
> never named, because naming it would say the whole group is invited.
>
> ---
>
> The named list, used by the confirmation and by the event detail alike.
>
> D3 (round 2): the event detail page named a count and then people, with no
> group named anywhere — "I do see where it got confused because I'm one of
> the pages the audience is listed above. On the pre-send, it says who's sent
> to all players, but I wanted it to be here." `groupSummary` is optional
> because the approval review already states the shape in its own block
> above this list and does not repeat it here; the event detail has nowhere
> else to say it, so it passes one and this renders it — `describeAudienceShape`
> itself is the one place either surface knows how to say it.

## src/app/operate/events/edit-templates-button.tsx — module header

> A stopgap for one problem, and only that one — LAN-165.
>
> The mission's final workflow walk over `main` found that
> `/operate/events/templates` works correctly — per-field inheritance, its
> save preview, all seven types — and is reachable by nobody who does not
> already know the address: nothing in the application links to it. Brian,
> on being shown the screen: put a button here "for the time being."
>
> This is deliberately that and nothing more. It is not a considered
> navigation decision — where template management belongs long-term (its own
> area? folded into Administration?) is unexamined, and this button should
> not be read as having settled it. It exists so the seven templates stop
> being invisible today.
>
> Same outlined, small variant as `SubscribeToCalendarButton` immediately to
> its right, so the row of three reads as one set rather than one control
> styled apart from the other two — Brian's "white" described that existing
> outlined button's treatment, not a request for a new style.

## src/app/operate/events/[id]/delivery/delivery-filters.tsx — module header

> UX-51's search and status filter.
>
> Both live in the query string, so a filtered diagnostics view is a link an
> operator can send to somebody and the back button does what it looks like it
> does.
>
> The search behaviour comes from the shared `useFilterSearch`, which carries
> two corrections paid for on real screens: filtering as you type rather than
> on an unadvertised Enter, and not losing text typed inside the debounce
> window. The status select navigates from the change event's value rather than
> submitting the form, because MUI's `TextField select` is a combobox over a
> hidden input whose value React writes on the _next_ render — submitting
> inside the handler posts the previous selection.

## src/app/operate/events/[id]/renotify-panel.tsx — module header

> W5-04 — the recovery path, and the reason it exists.
>
> "Turning the notification off is one tick, and it is easy to get wrong at
> half past seven on a Monday evening. Without this, a missed notification is
> permanent and the only fix is WhatsApp. With it, the mistake costs one
> button."
>
> A client component because it needs the pending state and the refusal, and
> because nothing else on the event page does. It posts the event id and
> nothing else — there is no audience to send, because the audience is whoever
> the event already invited.

## src/app/operate/events/[id]/attendance/attendance-locked-screens.tsx — RegisterNotOpenYet

> The register's buffer, before it lifts — D71 and D72. LAN-152.
>
> One screen for both readers, unlike the two below. The reason those differ is
> authority: an operator can go and assert occurrence and a coach cannot, so
> the sentence has to change with who is reading it. Nobody can hurry a clock,
> so this one says the same thing to everybody, and only the way back out
> differs — a coach's route is their eligible events, not event administration
> that would refuse them.

## src/app/operate/events/templates/[templateId]/page.tsx — module header

> W8-02 — one template.
>
> The route carries the template's own identifier since LAN-265. It used to
> carry the `event_type`, because the type _was_ the template's identity — there
> were exactly seven, created by a migration, and nobody added or removed one.
> Operators create and rename templates now, so a route segment made of the name
> would change under a rename and break every link an operator had kept.
>
> `readEventTemplate` refuses anything that is not a live template, so a
> hand-typed URL — or a link to one somebody deleted while it was open — gets a
> sentence rather than an empty form.

## src/app/operate/events/[id]/cancel/page.tsx — module header

> W6 — cancelling an event, on its own route.
>
> The mockup draws the confirmation as a panel over the event page. A route is
> the same screen with one property the overlay does not have: it cannot be
> reached by a stray click, and the address bar says what is about to happen.
> For the one irreversible action in the mission, that is the right trade.
>
> There is no approval gate here and none is coming — any one of the four
> operator roles cancels alone (D56, D61), because a waterlogged pitch does not
> wait for a quorum.

## src/app/operate/events/[id]/attendance/actions.ts — recordWalkUpAction

> UX-73 — records somebody who was never invited, and nothing else.
>
> It creates the person, their contact points and a **recruitment prospect** —
> see `recordWalkUpAttendance` — and no season membership and no onboarding. On
> success it returns to the board, where the new row carries the walk-up flag
> the view computes for it and sits in the board's own Walk-ups group.

## src/app/operate/events/[id]/attendance/attendance-row.tsx — committed (server props vs. state)

> What is recorded comes from the **server props**, and only from them.
>
> This row used to prefer its own last save state over the props —
> `state.presence ?? participant.presence` in effect — on the reasoning that
> the state was fresher for one render after a save. That was unsound, and
> independent review demonstrated the failure: `removeAttendanceAction`
> revalidates and soft-navigates to the same route, so the row instance
> survives under its stable key while the props go to `null`. The stale save
> state then won, and the board went on displaying `Saved · … · 20:07` for a
> record that no longer existed — with the removal control still offered,
> whose second press returned "there is no attendance recorded for that
> person" directly beneath it. Two contradictory claims on one row about who
> was at a practice.
>
> The premise was wrong as well as the consequence: `recordAttendanceAction`
> calls `revalidatePath` **before** it returns, so the props a save produces
> have already been re-rendered by the time the state carrying them arrives.
> There was no window to cover.
>
> So `state` now does the one job props cannot: report a save that **failed**,
> which by definition left the server value alone.

## src/app/operate/events/[id]/attendance/attendance-row.tsx — grid layout (Brian's verdict)

> A grid, not a wrapping row. Brian's verdict on the real phone: four
> buttons flowing until they run out of width put three on the first
> line and one orphaned underneath, at three different widths — "super
> janky", and worse than janky at the side of a pitch, because the
> odd-one-out reads as the important one.
>
> Two by two, each half the width available, so the block is a
> predictable target square whichever state you are reaching for. Four
> across on the desktop, where there is room and a row scans faster.

## src/app/operate/events/[id]/delivery/presentation.ts — module header

> The words UX-50, UX-51 and UX-52 use, in one place.
>
> `docs/ux/slice-ux.md` § 6 fixes the delivery vocabulary — **Queued**,
> **Attempted**, **Delivered**, **Failed**, **Retryable** — and § 6 closes with
> the sentence this whole screen exists to honour: "Delivered never means
> responded." The RSVP column is therefore rendered from
> `invitation_response_state` and never from a delivery state, and no label
> below implies one from the other.
>
> Every string a wireframe shows verbatim is here rather than inline in the
> page, so that a test can assert the approved label and a reviewer can read
> the whole of the screen's copy without reading its layout.

## src/app/operate/events/[id]/delivery/presentation.ts — NOT_DISPATCHED_NO_CHANNEL / WHATSAPP_UNRESPONSIVE

> W6's two named exceptions to the plain five-state vocabulary above —
> `REQ-no-channel-backstop` and `REQ-whatsapp-outage-visible`. Both replace
> what would otherwise render as an undifferentiated **Failed**, on this
> screen and on the participation table's own Delivery column
> (`src/app/participation/presentation.ts` carries the identical two
> strings, for the same reason `DELIVERY_LABELS` there already duplicates
> this file's five rather than importing them — `docs/ux/standards.md` rule
> 7 asks the two surfaces to agree, not to share one module).

## src/app/operate/events/[id]/delivery/presentation.ts — matchesAttemptStatusFilter

> OWNER-LAN173-02's Status filter, read against one **attempt**'s own
> recorded outcome rather than against a `DeliveryState` — an attempt row has
> no job-level "queued" or "retryable" of its own, only what the provider (or
> the club, before ever offering it) actually returned.
>
> "attention" mirrors {@link matchesStatusFilter}'s failed+retryable pairing
> with the two outcomes that mean the same thing at the attempt level:
> `failed` and `rejected` are both a refusal, one retryable and one not.
> "queued" and "retryable" match no recorded attempt on purpose — a queued or
> awaiting-retry job has not produced an attempt yet, so the honest answer to
> "show me its queued/retryable attempts" is none, not a guess.

## src/app/operate/events/[id]/change-actions.ts — readBaseline

> The event as the submitting form loaded it — LAN-244.
>
> Posted as one JSON hidden field rather than eleven shadow inputs, because it
> is one value with one meaning: "this is the version I was editing". Read
> defensively — a missing or unparseable field yields `undefined`, which
> `amendApprovedEvent` treats as "apply the whole submission", the behaviour
> every caller had before this existed. There is no authorization in it either
> way: the guard above is what decides whether this operator may amend at all,
> and a forged baseline can only produce an amendment this operator was already
> entitled to make.

## src/app/operate/events/event-form.tsx — scheduledOnDate (C1)

> C1. `scheduledOn` (the `YYYY-MM-DD` the server action and the rest of
> this component read) is _derived_ from this Date, never the other way
> round. `DatePicker` is controlled, and its field fires `onChange` with a
> genuine, if provisional, `Date` the instant the year section holds even
> one digit — a day and month already typed plus a year of "2" is a real
> 0002-08-24. Round-tripping that through `scheduledOn` and back on every
> keystroke works until the field's own display keeps building a year the
> string briefly could not represent consistently; keeping the `Date`
> itself as the source of truth and only ever handing the field back
> exactly what it just gave us sidesteps the mismatch entirely, at the
> cost of one extra piece of state.

## src/app/operate/events/templates/actions.ts — module header

> The template editor's server actions — W8.
>
> ## Two actions, one submission shape
>
> `previewEventTemplateAction` computes the blast radius and writes nothing.
> `saveEventTemplateAction` writes, and recomputes that blast radius for itself
> rather than accepting the one the browser was shown. The confirmation an
> operator reads and the rows that move therefore come from the same code, run
> twice, under locks both times — a preview that could disagree with the write
> would be worse than no preview, because it would be a promise.
>
> Both read the identical fields, so the second is the first with an argument
> flipped. That is deliberate: a save path that read the form differently from
> the preview path is exactly how the two would drift.
>
> ## Authorization
>
> `event_calendar_management` — this is administration of the calendar, and W8
> says so: "Event management capability required, enforced in the service
> layer." It is not `event_approval`, which exists for the one act that sends
> messages to real people; editing a template sends nothing and tells nobody.
>
> As everywhere else in this application, `NotPermitted` is rethrown rather than
> rendered beside a field: a refusal shown as red form text reads as "fix your
> input", which is the wrong instruction and buries an authorization event
> inside a validation failure.

## src/app/operate/events/templates/actions.ts — saveEventTemplateAction

> Saves the template and updates the drafts the rule reaches, in one transaction.
>
> **Redirects to the template list on success** — LAN-276 correction round 1.
> Brian, walking the review environment, 2026-09-10: "When I create a test
> template and I save, it should take me back to the other test templates,
> and I should see the list automatically. Right now, when I save, it just
> stays on the same screen." Offered the alternative of edits staying on the
> editor, and confirmed the list either way: the editor is never a dead end,
> for a rename exactly as for a create. `redirect` throws, so it sits outside
> the `try` — caught, it would be reported as a failed save that had just
> succeeded. A refused save still returns the `"editing"` state below, with
> the field errors, exactly as before.

## src/app/operate/report/presentation.ts — EVENT_STATUS_LABELS re-export

> `event_status`, in the club's words — the events screens' own map, not a
> second copy of it.
>
> It was a copy, and it had already drifted: the two files disagreed about the
> word for a status while a comment asserted they matched.
>
> Re-exported rather than corrected in place, because correcting the string
> would have restored a claim that only a person re-reading both files could
> keep true. One event status now has one label wherever it is shown — three of
> them, since LAN-151.

## src/app/operate/events/templates/presentation.ts — TEMPLATES_DELETE_RULE

> The one sentence on this surface that states a rule, and it earns its place.
>
> It used to say the opposite — "there are seven because there are seven kinds
> of event; templates cannot be added or removed" — which W8 asked for because
> the place an operator looks for **Add a type** is the place to say there is no
> such act. LAN-265 makes it an act, and the sentence that earns its place now
> is the other half of the same courtesy: a template the club has used cannot be
> deleted, so the place somebody looks for **Delete** and does not find it is
> where to say why.

## src/app/operate/events/templates/template-editor.tsx — Colour section

> LAN-276 correction round 1. Brian, walking the review environment,
> 2026-09-10: "In the template, swatch color should be something
> that gets chosen, so it gets added as part of the template." A
> fixed palette of swatches, never a free hex value — the same
> pattern the audience-group buttons below use, so a value is
> posted only once it has genuinely been chosen.

## src/app/operate/events/[id]/event-detail-view.tsx — HeadlineNumbers

> ## Three deliberate absences
>
> **No percentages.** D62 asks for raw pairs. `20 / 37` is the fact; `54%` is
> the fact with both of the numbers the club wanted removed from it.
>
> **No sentence explaining the dash.** `Showed` reads `— / 37` until a register
> has been saved and `0 / 37` afterwards, and the packet is explicit that the
> application explains neither in words: "explanatory text about washouts
> belongs in a review artifact, not in the product". The two values carry it.
>
> **No judgment.** Nothing here is coloured, flagged or compared against a
> target. A quiet Tuesday in fifth week is a fact about the term, not a
> failing, and a screen that decided otherwise would be inventing a club
> policy nobody has agreed.

## src/app/operate/events/[id]/event-detail-view.tsx — RegisterPanel

> `isRegisterAvailable` is the same function the register itself calls, with
> `registerSaved` taken off the headline numbers this page has already read.
> `docs/ux/standards.md` rule 7 is why it has to be the same one: this panel
> offering **Attendance** beside a register that then says "not open yet" is
> two screens answering one question two ways, and it is what the LAN-152
> browser preflight found.

## src/app/operate/events/[id]/event-detail-view.tsx — EventDetailView, deliveryCounts

> LAN-243. Counted from the very rows the participation table below is about
> to draw, so the Distribution note and the Delivered chips are one reading
> of one set of rows rather than two that can — and did — contradict.

## src/app/operate/events/[id]/event-detail-view.tsx — joining URL fact

> LAN-284 reversed REQ-no-joining-url: this link is now published on
> the public event page and carried in the subscription feed. The note
> is the warning, and it belongs here rather than on the public page —
> the operator is the only person who can do anything about it.

## src/app/operate/events/[id]/event-detail-view.tsx — decision-reason fact

> A cancelled event's reason is shown by `CancelledPanel`, with the
> sentence that says it is internal and reaches nobody who was
> invited. Showing it here as well would be two surfaces answering
> "why is this off?" — `docs/ux/standards.md` rule 7 — and the one
> without that sentence is the one that reads as publishable.

## src/app/operate/events/[id]/event-detail-view.tsx — questions section

> Amendment W4-A1. The questions are read here and written on the form:
> "it's ingrained in the process, so you separated that inappropriately."
> The RSVP's own first question is not repeated — this panel is about what
> this event adds, and the approval review is where the whole page is read
> in order.

## src/app/operate/events/[id]/event-detail-view.tsx — questions section, no-questions state

> C4. There was filler here — "Nothing extra is asked. Add a
> question if this event needs one." — and Brian's reaction was
> "I hate extra text like this." The heading above already says
> what this panel is; an event with nothing extra to ask says so by
> showing nothing.

## src/app/operate/events/[id]/event-detail-view.tsx — duplicate-event button

> D39, as Brian settled it on 2026-08-22: duplicate opens the create
> form prefilled, and nothing is written until the operator saves. It is
> offered on every status, because the event worth copying is usually one
> that already happened.

## src/app/operate/events/event-core-fields.tsx — isFormattableScheduledOn

> W154C-F1: the date field used to be a native `<input type="date">`, which
> renders in the browser's locale (D86) and let Chrome's segmented editor
> land on a value like `20261-12-11` mid-edit — a five-digit year that is
> neither empty nor a parseable date. `scheduledOn === ""` let everything
> else through to `formatLongDate`, which only guards falsy input, so
> `Intl.DateTimeFormat` threw on the resulting `Invalid Date` and took the
> whole form with it.
>
> C1 replaced that native control with MUI X's `DatePicker`, whose field
> validates its own sections and only ever calls back with a complete,
> in-range `Date` or `null` — so the five-digit-year shape this guards
> against can no longer reach `scheduledOn` from the picker itself. The guard
> stays anyway: `scheduledOn` also arrives from a rejected submission's
> `state.values`, a path this function does not control, and the derived-term
> alert should fall back to its placeholder for any in-progress or malformed
> value on that path too rather than only an empty one.

## src/app/operate/events/event-core-fields.tsx — Type select field

> Still labelled **Type**, and that is deliberate rather than
> overlooked. LAN-265 changed what the control selects — a template
> the club created, not one of seven fixed types — but "what type of
> event is this?" is the question an operator is answering, and
> "Template" is the word for the row on the administration screen
> they are choosing from rather than for the choice they are making
> here.
>
> `shrink` is explicit because this select always has a value — the
> first template when nothing was chosen — and MUI was leaving the
> outline's notch closed, so the label sat on top of the value.
> Found in the LAN-151 browser preflight, on both the create and the
> edit screen; every other field on this form notches correctly
> because every other field can legitimately be empty.

## src/app/operate/events/event-core-fields.tsx — date/time fields

> C1 + C2. A native `<input type="date">`/`<input type="time">`
> renders in the browser/OS locale and ignores the page — that is
> what put an American mm/dd/yyyy date picker and a 24-hour clock
> in front of an operator who typed a British one, and is the root
> cause of W154C-F1's crash. MUI X's `DatePicker`/`TimePicker`
> draw their own field rather than delegating to the OS, so
> `format` holds no matter what the browser or OS thinks a date or
> time looks like. Each carries a hidden input for the form post —
> the visible field shows "24/08/2026"; the value the server
> action reads is still plain `scheduledOn`/`startsAt`/`endsAt`,
> exactly as before.
>
> D2 (round 2, Q-27): Brian reversed himself on the clock, not on
> locale-independence — "I want it to be a normal 12-hour clock
> with AM and PM" supersedes the 24-hour half of C2, and he was
> explicit that he misread his own earlier note. `ampm={true}` and
> `format="hh:mm a"` are still fixed props, not a return to the
> browser's locale: the whole reason a British operator on a
> US-locale machine crashed this form is not undone by which
> clock face is drawn, only by drawing one deliberately either
> way. The five-minute step (`minutesStep`/`timeSteps`) is
> unaffected, and so is the stored value — `startsAt`/`endsAt`
> still post plain 24-hour `HH:mm` through the hidden input;
> `dateFromTimeString`/`timeStringFromDate` never changed.

## src/app/operate/events/event-core-fields.tsx — joining link field

> LAN-284 reversed REQ-no-joining-url: this link is published on
> the public event page and carried in the subscription feed. The
> helper text is the warning, and it is a warning rather than a
> gate — nothing here can check whether a meeting has a passcode
> set, so the only real control is the operator's own care.

## src/app/operate/events/[id]/messaging-plan.tsx — reminder wording

> The first reminder after the invitation reads "have not answered";
> every one after that reads "still have not answered" — the escalating
> wording W1's approved mockup uses once a chase is under way.

## src/app/operate/events/question-editor.tsx — file header

> Writing the questions an event asks — amendment W4-A1, inside the create and
> edit form rather than on a screen of its own.
>
> Brian, 2026-08-21: "This is part of the create event workflow. It's not a
> separate screen that needs its own thing ... it's ingrained in the process, so
> you separated that inappropriately." Writing an event and deciding what to ask
> the people invited to it are one act, so this is a section of that form and
> posts through it.
>
> ## Every question is editable in place
>
> There is no read mode and no edit mode. A question is four small controls and
> hiding three of them behind an **Edit** button buys a tidier list at the cost
> of a click before every correction — on a form whose whole purpose is
> correcting things. What the operator can see, they can change.
>
> ## The order is the order asked, and moving one really moves it
>
> The arrows reorder the array, which is what `sort_order` is written from, and
> the hidden inputs below are emitted in that order. There is no drag and drop:
> a pointer gesture that a keyboard cannot perform would put the ordering out of
> reach of anybody not using a mouse, and this list is three items long.
>
> ## Controlled, because the type owns the template questions
>
> The parent holds the list. Changing the event's type has to swap the questions
> that came from the old type's template for the new one's while leaving the
> operator's own questions alone (D42), and a component holding its own copy
> could not be told.
>
> ## The hidden inputs are the payload
>
> Five parallel repeating fields, read back with `FormData.getAll`. `fromTemplate`
> travels with each one because it is what marks a question as having come with
> the type — the chip an operator reads, and the flag that decides whether a
> later template change may touch it.

## src/app/operate/events/question-editor.tsx — empty-list state

> C4. There was filler here — "Nothing extra is asked. Add a
> question if this event needs one." — and Brian's reaction was
> "I hate extra text like this." The Add a question control below
> already says what to do; an empty list needs nothing above it.

## src/app/operate/events/operator-list.tsx — file header

> Name (a link to the event — Brian, 21 August 2026: "the event itself should be
> a hyperlink that leads to the event page itself"), type with its shared
> colour, date, term and week, status, and the three counts an operator actually
> asks about: **Invited**, **Said yes**, and **Showed / Invited**.
>
> Brian, 20 August 2026: "If you're an operator, you get a slightly different
> view of these because you should be able to see attendance numbers in the
> list." The counts are raw pairs and never percentages (D62) — a club of
> forty-seven reading "43%" has to do arithmetic to recover the fact it wanted.
>
> **Audience**, which said "Chosen at approval" for everything a calendar
> operator can create and a count for the rest, is replaced by the two counts
> that answer the question it was standing in for. **Venue** merged into Where.

## src/app/operate/events/[id]/delivery/delivery-overview.tsx — empty-state sentence

> §9's Empty: distinguish "nothing yet" from "nothing matched". This is
> system-empty — no invitation job exists for this event.
>
> The sentence used to assert the cause ("Invitations and their delivery
> are created when the event is approved"), which is false on an event
> that IS approved and whose invitations were never dispatched — the
> state Brian found. It now says what is true and stops.

## src/app/operate/events/[id]/delivery/delivery-overview.tsx — NeedsAttention

> Brian, 2026-08-25: retries and the email fallback are automatic and offer no
> action; only a missing route is a person's job, and what it needs is a
> roster fix rather than a message.

## src/app/operate/events/[id]/approval-review.tsx — audience shape

> The audience by its groups, before its people — Brian, 2026-08-21:
> "it should say at the very top what groups it would be ... You don't
> have to show me how it's done." An approver checks a shape faster than
> they check a list of thirty-five, and the names are still underneath.

## src/app/operate/events/[id]/approval-review.tsx — WhatsApp errors placement

> D8, W1's exception table: a missing or unusable WhatsApp route is an
> error named before approval, not discovered afterwards. Placed beside
> the facts and ahead of the named list, exactly where the approved
> mockup puts it.

## src/app/operate/events/[id]/approval-review.tsx — messaging plan placement

> W1's purpose: an approver reads the whole plan before pressing
> Approve. Last in the review, per the approved acceptance contract —
> "the messaging plan appears last as an expandable disclosure".

## src/app/operate/events/templates/page.tsx — file header

> The administration surface D40 asks for, behind the Events area. It was a
> fixed list of exactly seven until LAN-265: "A template is anything the
> operators want to create: 'Kicking Clinic', 'Full Pads Practice', 'Film
> Review', whatever they name" (Brian, with Stu and Clint, 2026-09-09).
>
> **New template** is here because creating one is now an ordinary
> administrative act rather than a migration. Deleting is not symmetrical with
> it, and the sentence under the table is where that is said: a template an
> event was created from cannot be deleted, because an event's every label is
> read from its template and there is nothing for one to fall back to. The place
> an operator looks for **Delete** and does not find it is the place to say why —
> `docs/ux/standards.md` rule 4, the same reason this surface used to carry the
> opposite sentence about **Add a type**.

## src/app/operate/events/new/page.tsx — file header, duplicate (D39)

> `?from=<event id>` prefills the form from an existing event and writes
> nothing. Brian settled it on 2026-08-22: duplicate opens the create form
> prefilled, and nothing exists until the operator saves. So this is one route
> with one action, and "duplicate" is a way of arriving at it rather than a
> second way of creating an event.
>
> What is deliberately **not** copied is the date. A duplicate is the next one
> of something, and carrying last Wednesday's date over would be the one field
> guaranteed to be wrong — and the one whose being wrong is hardest to see.
> Everything else, including the questions, comes across.

## src/app/operate/events/[id]/share-panel.tsx — file header

> The link, one sentence saying what a holder of it can and cannot do, and
> **Copy link**. The approved mockup also carried a second paragraph — "It is a
> private link, not a secret one — a squad list is not a secret from the squad"
> — which is D81's reasoning rather than the control's consequence, and Brian
> has rejected copy of that shape on this mission five times. The deviation is
> recorded in the pull request.
>
> There is no **Revoke** and no expiry. Q2 is a nonblocking unknown the owner
> chose to settle by testing; the link ships without revocation and adding it
> later is additive.
>
> Rendering a page must not write. When no link has been issued the panel
> offers one button that issues it; until it is pressed, `club_link_tokens`
> holds no row for this event.
>
> An unconfigured deployment and a draft event both render a sentence in this
> panel rather than an error page — `docs/ux/standards.md` rule 6 — and the
> button that would fail is not offered. The action refuses again on its own
> behalf regardless: hiding a control is a courtesy, never the boundary.

## src/app/operate/events/import/presentation.ts — changeSummary

> Brian, 2026-08-21, rejecting an earlier draft of the mockup: "you should
> highlight the cell itself to show what changed … Row doesn't make sense …
> get rid of it." The highlighted cells are the change; this sentence is the
> summary of them, and it is computed from the same list so the two cannot
> disagree.

## src/app/operate/events/[id]/delete-draft.tsx — file header

> Brian, 2026-08-21: "there should be a Delete Event button ... I don't know
> where that button exists on this event." A saved draft has a page, and that
> page is where an operator edits it, chooses its audience, or decides it should
> not exist. There is nothing to delete on the create form.
>
> It names what is about to go, says it cannot come back, and says nobody will
> be told — because nobody was told in the first place, which is the whole
> reason a draft may be deleted at all.
>
> What it deliberately does **not** say is that an approved event cannot be
> deleted. Brian, again: "That warning should pop up if you try to delete an
> approved event ... I don't think it needs to be called out there
> specifically." A rule stated where it does not apply is a rule the reader has
> to work out is not about them.
>
> This whole component could be skipped by posting to the action directly, and
> `deleteEventDraft` would still refuse anything that is not a draft. The
> confirmation exists so a person does not do it by accident, not so the rule
> holds.

## src/app/operate/events/templates/template-form-fields.tsx — duration field (D78/C6)

> D78. A duration, not a start time — "the name is always going to
> be unique ... Usual time doesn't make any sense to me" (Brian,
> 2026-08-21). A type recurs; a particular Wednesday does not.
>
> C6. Brian: "In the template, the default times should be done
> in 30-minute increments between 30 minutes and 4 hours ... It
> shouldn't be freeform text." Eight options, each labelled by
> the same `describeDuration` the template list and the
> confirmation dialog already use.

## src/app/calendar/routes.ts — module header (LAN-153).

> One module rather than template literals scattered through the screens,
> because `REQ-three-arrangements` requires that "every tile and row leads to
> the same event page" — and a destination built in six places is a destination
> that will eventually be built five ways. The tile components take an `href`
> for the same reason; this is where the two tiers answer it.

## src/app/calendar/routes.ts — `OPERATOR_EVENT_TEMPLATES_PATH` (LAN-165).

> Reachable only by typing the address until this constant's one caller
> (`EventsPage`'s `Edit templates` button) was added: nothing linked to it,
> which the mission's final workflow walk found and Brian named as a stopgap
> to fix immediately rather than a considered navigation decision to design
> properly later.

## src/app/calendar/tile-status.ts — module header (LAN-153).

> `REQ-three-tiers` puts the status column on the operator's side of the line.
> The public tier still has to mark a cancelled event, because D57 keeps one
> visible with its history and `W2` keeps it in the subscription feed — hiding
> it on one public surface while another shows it would be two public answers to
> one question. So the public tier says **Cancelled** and nothing else, and the
> operator tier says whatever the stored status is.

## src/app/calendar/tile-status.ts — `operatorTileStatus()`.

> Brian's review, 14 August 2026: "If an event is in draft, I think it's
> important. If it happened in the past, that's fine, we don't need to see
> that." A card of sixty occurred practices repeating "Occurred" says nothing,
> so `approved` — the one state meaning _this is proceeding normally_ — is
> silent and the rest say so. The date already carries whether it is ahead of
> us or behind us, which since LAN-151 is the whole of occurrence (D30).

## src/app/calendar/feed.ics/route.ts — module header, R158-B1 (LAN-158).

> The route is fixed by the Lead's determination: no season in the path, so a
> subscriber adds it once and it keeps serving whatever season is open —
> "season-scoped" is satisfied by the _content_, not the address. When the
> season rolls over, every existing subscriber's entries change wholesale on
> their next fetch. That is `calendar-feed.ts`'s documented trade-off, not a
> bug in this handler.
>
> `Cache-Control: public, max-age=300` on a HEALTHY response — the Lead's
> determination, unchanged by this correction. No `Set-Cookie`, no session,
> and nothing here varies the response by who is asking, so a shared cache in
> front of a genuinely healthy response is safe. `docs/deployment.md`'s "Edge
> caching" confirms Firebase Hosting, the real front door (ADR 0031), honours
> that header for a dynamically rendered route rather than only for a
> prerendered one — it is a real mechanism, not a hopeful one.
>
> The independent security review of the head this correction resumes from
> proved, live, that this handler previously caught `isServiceError(error)` —
> a supertype test true for `NotFound`'s one genuine "nothing is open" case
> **and** for `UnexpectedDatabaseError`, `NotPermitted`, `InvalidTransition`,
> `ConstraintViolated` and `Conflict` alike. `UnexpectedDatabaseError` is what
> a real connection failure or unrecognised database fault becomes by the
> time it reaches this handler (`mapDatabaseError`, `withTransaction`), and it
> used to take the identical path as a genuinely empty season: `200`, a
> syntactically valid zero-`VEVENT` calendar, the same public, cacheable
> headers, and nothing logged.
>
> That is not a cosmetic wrong answer. This is the one route in the
> application designed to be polled forever, unauthenticated, by Google,
> Microsoft and Apple, and the response used to carry `public, max-age=300` —
> so one transient database hiccup during one request got baked into
> Firebase's _shared_ edge cache and served to every subscriber for up to
> five minutes as "the season now has zero events." Most calendar-
> subscription consumers read a re-synced empty feed as "remove everything I
> previously had," not "temporarily unreachable, keep the old copy" — so the
> failure mode was a silent, unlogged, edge-cached wipe of every subscriber's
> calendar, recovering on its own a few minutes later with no record
> anywhere of why it had ever happened.
>
> {@link isNoCurrentSeason} matches only an instance of `NotFound` whose
> `rule` is exactly {@link NO_CURRENT_SEASON_RULE} — the identifier
> `readCurrentSeasonIn` actually throws (`src/lib/services/seasons.ts`).
> Nothing else can produce that combination, including every other
> `ServiceError` subclass and kind. Everything else — another `ServiceError`,
> `UnexpectedDatabaseError` above all, or a genuinely unanticipated
> exception — is logged server-side and answered with a `503` and
> `Cache-Control: no-store`, so neither Firebase's edge nor a well-behaved
> subscribing provider caches the failure, and a provider retries on its own
> schedule instead of concluding the season is now empty.

## src/app/calendar/feed.ics/route.ts — `GET()`'s catch block, R158-B1.

> Never the cacheable 200 the success path uses, and never silent: an outage
> that answers `200` with a fabricated empty calendar is exactly the defect
> this branch exists to close, and replacing it with a silent `500` would
> only move the same failure mode one status code over.

## src/app/calendar/calendar-controls.tsx — `YearJumpControl()` header (LAN-153, BG-153-2, W153-F1).

> Stewart Humble, 17 August 2026, asking for exactly this — "you can do a
> continuous scroll and it's going to merge from Michaelmas to Christmas
> vacation to Hilary to Easter vacation to Trinity to long vacation to the
> next".
>
> Brian, at the visual gate: _"A drop down doesn't really make sense. Maybe
> some buttons there to 'jump' to the right place?"_ He is right about the
> shape: a select asks the reader to open something, read a list and commit,
> for an action that is one tap and is undone by scrolling. Seven segments
> fit on a row and wrap on a phone.
>
> The MUI `disableScrollLock` workaround went with the select, and was
> checked rather than assumed. It existed because MUI renders a select's
> menu inside a `Modal`, which locks body scroll while open and restores the
> previous scroll position when it closes — so the jump happened and was
> silently undone (W153-F1's first half). A `Button` opens no `Modal`, locks
> nothing and restores nothing, so there is no longer anything to disable.
> Confirmed by measuring `scrollY` at five widths rather than by reasoning
> about it.
>
> Brian, 21 August 2026: "that filter should be removed entirely from the
> calendar … we know what calendar we're looking at." One season is open and
> the mission knows no other (`REQ-one-open-season`), so a control offering
> another would offer something that does not exist. The page header names
> the season.

## src/app/participation/presentation.ts — `SHARE_CONSEQUENCE` (D81).

> The approved mockup carried a second paragraph: "It is a private link, not a
> secret one — a squad list is not a secret from the squad. Share it where you
> would share the squad." That is D81's _reasoning_, and reasoning is what
> Brian has rejected on this mission's screens five times.

## src/app/e/[token]/page.tsx — module header (W7-03, D2, D81, LAN-157).

> Coaches hold no operator account. Without this they cannot see who is
> coming to their own session. Brian, 2026-08-21: "The event ID shared with
> anyone should be openable by anyone … Here's the list of everyone here."

## src/app/e/[token]/page.tsx — module header, R157-B5.

> Not the compiler. This file used to claim the boundary was "enforced by the
> compiler rather than by this file remembering", and it is not: adding
> `delivery: person.delivery` to the club-link literal in
> `@/lib/services/participation` passes `tsc` and the whole unit project,
> because TypeScript's excess-property check is a freshness rule on object
> literals and freshness is lost through `.map()`. What proves it is
> `src/lib/services/participation.test.ts`'s payload assertions, which are the
> only thing in the repository that catches the widened literal.

## src/app/e/[token]/page.tsx — module header, R157-B4/W157-R1.

> Every request here reaches the database: a full outer join plus a question
> scan, then a best-effort `use_count` stamp, with `force-dynamic` and
> `no-store` so nothing caches. One link forwarded past the squad is therefore
> unbounded load against the single production database and unbounded Cloud Run
> instance time — and with no revocation shipped, the only remedy would be
> rotating `CLUB_LINK_SECRET`, which kills every club link for every event.
>
> The limiter is not what keeps this page up under a squad — its allowance is
> 240 a minute per link, and one link opened by forty people in the same
> second is far inside that and is the case the link exists for. What used to
> fail there was the `use_count` stamp taking a row lock inside the read
> transaction; that is fixed in `@/lib/services/club-link`, not here. The
> limiter bounds a link that has escaped the squad, and only that.

## src/app/e/[token]/page.tsx — `ClubLinkPage()`, W157-F1.

> The one thing on this page that can send somebody to the wrong place. Every
> reader here holds no account and has no other surface: a squad member
> forwarded the link for a cancelled session read a mandatory practice with
> thirty-one people saying yes, and would turn up to a locked pitch.

## src/app/calendar/[id]/page.tsx — module header (LAN-153, LAN-284, LAN-272 F1).

> Brian, 20 August 2026: "people who see the calendar should see a normal
> calendar of events … descriptions, what gear to bring, what type of events,
> everything like that … They shouldn't be able to see other details about it.
> There are going to be private details per event, like RSVP attendance and
> things of that nature, that shouldn't be on the public calendar."
>
> The page used to say the event was online and where it was _called_, and
> deliberately not how to join it (`REQ-no-joining-url`, Brian, 21 August
> 2026). Brian reversed it on 2026-09-09. The calendar stays public — no
> password gate on `/calendar`, no token on the feed, no change to the three
> access tiers. The protection moved to the meeting instead: a Teams meeting
> requires its passcode, shared with the squad privately, on top of the
> Oxford-domain approval. The consequence is accepted knowingly: nothing in
> this application can verify that a given meeting has a passcode set, so an
> operator who pastes an open meeting publishes it to the world. The editor
> warns them; the control is theirs.
>
> This is finding F1 of the LAN-272 review: this page shipped with the link
> straight off the row, so a `javascript:` value pasted into "Joining link"
> became an anchor on an unauthenticated page whose href ran script in this
> application's own origin — with the operator's session live in the same
> browser. The form refuses such a value now, and `readPublicEvent` strips one
> that predates the form's refusal, so this call is the third of three and
> should never be the one that fires.

## src/app/calendar/page.tsx — module header (LAN-153, D1/D5).

> LAN-114 deliberately did **not** open the calendar and recorded why: opening
> one to unauthenticated visitors "would be a change to the security posture
> rather than a calendar feature, and `AGENTS.md` reserves that for Brian."
> That reservation is satisfied here, not overridden.

## src/app/calendar/public-list.tsx — module header (LAN-153).

> An online event says **Online** and stops there. Brian, 21 August 2026:
> "When it says online, you do not need to show no link shown. That's not
> important."

## src/app/calendar/subscribe-dialog.tsx — module header (LAN-158).

> The first mockup carried five; Brian's instruction was explicit — "you're
> overcomplicating this … These extra screens aren't really necessary" — and
> the approved packet has exactly two.
>
> "Their own calendar app opens and asks them to confirm. That confirmation
> belongs to that app, not to this one" — the workflow is explicit that this
> control's job ends at getting the reader's own app to open.

## src/lib/services/events/shared.ts — EventListEntry.templateName

> What the club calls this kind of event, read from the template.
>
> The single source of the word, everywhere — this list, the event page, the
> public calendar, the ICS feed, the RSVP page and the Monday report. Read at
> render time from the template rather than stored on the event, which is what
> makes a rename retroactive: rename "Chalk" to "Film Review" and last term's
> sessions read "Film Review", with no row in `events` rewritten (Brian,
> 2026-09-09).

## src/lib/services/events/shared.ts — EventListEntry.templateColour

> The template's own colour — LAN-276 correction round 1. A key into
> `TEMPLATE_COLOUR_PALETTE`, read from the template exactly as
> `templateName` is, and for the same reason: the calendar and every event
> list colour a tile by the template rather than by its class, so a rename
> or a colour change reaches every past and future event of it with no row
> in `events` rewritten.

## src/lib/services/events/shared.ts — EventListEntry.eventType

> The behavioural class, `public.event_type`.
>
> Kept on the entry because a handful of rules genuinely need a closed
> vocabulary — the recruitment audience, the Monday report's buckets, coach
> attendance — and none of them can key off a name an operator may change.
> Never shown to anybody: the word a reader sees is `templateName`.

## src/lib/services/events/shared.ts — EventListEntry.registerSaved

> Whether anything at all has been recorded against this event — D72.
>
> On the list because the coach's own card has to ask the same question the
> register asks, and `isRegisterAvailable` needs it: a register with anything
> in it has already been opened, so the buffer cannot take it back. Without
> it the card would answer a different question from the two surfaces either
> side of it, which is finding W-F1.
>
> An `exists`, not a count. Nothing displays how many rows there are, and a
> count over a table that grows with every session recorded would be read as
> though it meant something.

## src/lib/services/events/shared.ts — EventListEntry.showedCount

> Attendance rows recorded `present` or `late` — the club's "showed".
>
> Meaningless on its own, and never rendered on its own: it is zero both for
> a session nobody attended and for a session nobody has recorded, and D74
> requires those to be distinguishable at a glance. `registerSaved` is what
> separates them, and `formatShowedAgainstInvited` is the one formatter that
> consults both.

## src/lib/services/events/shared.ts — EventDetail.joiningUrl

> The online event's link. Published — LAN-284 reversed REQ-no-joining-url —
> so `PublicEventDetail` and the subscription feed carry it too. This is the
> operator's own copy, shown with the warning that it is public.

## src/lib/services/events/shared.ts — EVENT_SORT_COLUMNS header

> The columns an operator may sort the list by, and the SQL each one means.
>
> A whitelist rather than interpolation: `sort` arrives in the query string,
> and the only safe way to put a caller's word in an `order by` is to look it
> up in a list written here. An unrecognised value is the default, never an
> error and never the caller's text.
>
> `status` sorts by the lifecycle's own order rather than alphabetically —
> `event_status` is an enum, so PostgreSQL already sorts it draft, approved,
> cancelled, and an operator scanning for what needs attention wants that
> rather than "approved, cancelled, draft".

## src/lib/services/events/shared.ts — EVENT_SORT_COLUMNS.term

> Term and week — **the same SQL as the date**, which is the requirement
> rather than an optimisation.
>
> `REQ-list-shape`: "Term and week sorting identically to Date". The Oxford
> coordinate is derived from the date and nothing else (`./oxford-year`), so
> ordering by the coordinate and ordering by the date are the same ordering —
> and writing it as the same expression is what makes them provably the same
> rather than two orderings that agree today. Sorting by the stored
> `week_number` would not: it is null outside term, so a vacation event would
> sort to one end of the list instead of into its own week.

## src/lib/services/events/shared.ts — EVENT_SORT_COLUMNS.type

> By the template's **name**, since LAN-265, and no longer by the enum's own
> declared order.
>
> The column reads "Chalk" or "Kicking Clinic", and a sort that ordered by
> `e.event_type` would now group a club's own templates by a class nobody is
> shown — every operator-created template sitting together under `practice`,
> in an order the screen gives no account of. Sorting by what the column
> prints is the only ordering a reader can check.

## src/lib/services/events/shared.ts — EVENT_SORT_COLUMNS.showed

> Showed against invited sorts by what was actually recorded.
>
> An event with no register sorts with the zeroes and not above them: it has
> no number, and inventing an ordering for "not recorded" would put the
> sessions nobody has assessed either first or last for a reason no operator
> asked for. The column still _reads_ "—" for them, which is the fact.

## src/lib/services/events/shared.ts — orderBy (nulls last)

> `nulls last` on both directions: an event with no date yet, or no venue, is
> incomplete rather than earliest, and burying it at the top of a descending
> list would put the least finished events in front of the operator first.

## src/lib/services/events/shared.ts — TEMPLATE_JOIN

> The template join every event read carries — LAN-265.
>
> An inner join, and safe as one: `events.template_id` is `not null` and
> `events_template_fkey` is `on delete restrict`, so an event without a template
> row cannot exist. Written once here because eight queries need the name and a
> ninth written by hand would be the surface that quietly kept showing the old
> word after a rename.

## src/lib/services/events/shared.ts — TEMPLATE_COLUMNS

> The template columns every projection selects, public tier included.
>
> `colour_key` joined LAN-276 correction round 1: the calendar and every
> event list colour a tile by the template's own colour now, not by
> `event_type`, and it is exactly as public as `template_name` — a colour
> says nothing about anybody.

## src/lib/services/events/shared.ts — EVENT_NOT_FOUND_MESSAGE

> Deliberately says only that the event is gone.
>
> An earlier draft added "or it belongs to a season this club is not
> operating", which `readEventIn` does not check — it reads by id alone, and an
> event from any season resolves. A refusal that describes a rule the code does
> not apply teaches the reader something false about the system.

## src/lib/services/attendance-vocabulary.ts — WalkUpInput header

> What the walk-on form collects — Brian, 14 August 2026.
>
> The same four fields the returner intake asks for, in the same order, because
> adding somebody who turned up should not be a different act from adding
> anybody else: "it should be almost identical to adding a player… first name,
> last name, phone, and email, to grab as much as they can".
>
> Stricter than intake in one direction, and that is deliberate too. Intake
> requires only a first name, because the club's own files are full of records
> that never had more. A walk-on is different: they are standing in front of
> you, and the whole point of recording them is that somebody follows them up
> afterwards — a walk-on with no surname and no number is a row nobody can act
> on. So first name, last name and phone are all required, and only the email
> is optional.

## src/lib/services/attendance-vocabulary.ts — SHOWED_PRESENCES

> The attendance states that mean somebody **turned up**.
>
> `late` counts. Arriving at 20:20 is arriving; the distinction the club draws
> with it is about punctuality, not about presence, and a turnout figure that
> dropped the people who were late would say fewer people came to a session
> than the coach watched walk onto the pitch. `excused` and `absent` are the
> two that did not come, and both are genuine observations rather than silence
> — which is the whole point of the axis below.

## src/lib/services/attendance-vocabulary.ts — AttendanceSummary.registerSaved / interface header

> One event's attendance, counted.
>
> ## `registerSaved` is the whole idea
>
> Attendance is a **two-state axis**: _not recorded_ against _recorded_. The
> save is the signal, and nothing else is — there is no finalisation column and
> this deliberately does not invent one. A sheet saved with all thirty-seven
> people marked absent is a real, hard-won zero, and it has to be
> distinguishable at a glance from a sheet nobody opened. That is why `showed`
> means nothing until this is `true`, and why every reader consults it before
> printing a number.
>
> The counts themselves are **raw pairs, never percentages** (D62). A club of
> forty-seven reading "43%" has to do arithmetic to get back to the fact it
> wanted, and the fact it wanted was "twenty of them came".
>
> `true` once **anything** has been recorded against the event.
>
> Not "everybody has been marked". A partly-filled sheet is a sheet somebody
> opened and saved, and the club's answer to "was this session assessed?" is
> yes.

## src/lib/services/attendance-window.ts — file header (buffer rationale)

> Why a buffer at all
>
> The realistic moment somebody takes a register is standing at the pitch as
> people arrive, which is before the session's own start time. Opening it
> exactly at kick-off would mean the person holding the phone could not use it
> for the ten minutes they actually have free.

## src/lib/services/attendance-window.ts — ATTENDANCE_REGISTER_BUFFER_HOURS

> Six hours, and it is a **tuning value** rather than a rule.
>
> D71 says "approximately six hours" and the packet delegates the exact length,
> which is why it is one exported number with one name rather than an
> expression spelled out at each call site. Changing the club's mind about it
> is editing this line; nothing else in the repository knows the number.

## src/lib/services/attendance-window.ts — isRegisterAvailable header

> The whole availability answer: the buffer, plus D72's promise kept.
>
> **A register with anything recorded against it has already been opened**, so
> the buffer cannot take it back. Without that disjunct "never closes" is only
> nearly true, and the case where it is false is the worst one — a coach
> halfway through a sheet, told to come back later.
>
> It is one function rather than two expressions because two surfaces ask the
> question: the register itself, and the event page's way in to it. A page
> offering **Attendance** beside a register that then refuses is the shape
> `docs/ux/standards.md` rule 7 exists to stop.

## src/lib/services/calendar-feed.ts — descriptionFor

> `DESCRIPTION`, or `null` to omit the property entirely — never an empty or
> dangling one. Q-29.
>
> Blank strings are treated the same as `null`: an operator can save an empty
> description or equipment field, and that is not "one word of content", so
> an event with both fields blank still emits no `DESCRIPTION`, matching the
> public event page's own `{event.description ? … : null}` / `{event
.requiredEquipment ? … : null}` guards.

## src/lib/services/calendar-feed.ts — buildCalendarFeed

> An empty `events` array produces a complete, valid, zero-`VEVENT` document —
> the workflow's own exception: "the season has no events yet ⇒ the feed is
> valid and empty. A calendar app subscribing to it succeeds and shows
> nothing, rather than erroring."

## src/lib/services/club-link.ts — clubLinkSecret

> The signing key, or a refusal.
>
> A missing value is a **refusal, not a default**, and there is deliberately no
> fallback: a derived-from-nothing key would produce links that silently stop
> working the moment a real one was configured, and a hard-coded one would put
> a signing key in a public repository.

## src/lib/services/club-link.ts — resolveClubLinkIn (incident W157-R1)

> **Use is recorded, and not from here — W157-R1.** `use_count` and
> `last_used_at` exist for Q2: settling expiry by testing means knowing whether
> a link is still being opened. This function used to stamp them itself, in the
> caller's transaction, and that made every reader of one link take a row lock
> on that link's single row and hold it until the read committed.
>
> Concurrent readers of **one** link therefore serialized on one tuple, each
> holding a pooled connection while it waited. Measured on this branch: 40
> simultaneous readers of one token produced 29 HTTP 500s, while the same 40
> spread over four tokens produced none. The pool (`DATABASE_POOL_MAX`, 10)
> filled with waiters, later requests exceeded `connectionTimeoutMillis`, and
> Next rendered its own error page rather than this package's unavailable
> panel — so a squad opening a link the operator had just pasted into WhatsApp
> read "the club's system is broken" instead of a squad list. That is the exact
> moment this link exists for, and it is far inside the rate limiter's own
> per-link allowance, so `R157-B4`'s brake never sees it.

## src/lib/services/club-link.ts — recordClubLinkUseIn (Q2 imprecision)

> **A stamp can be lost.** When two requests for the same link try to stamp in
> the same instant, the second finds the row locked, skips, and that view is
> never counted. The window is one short transaction — the `update` and its
> `commit`, sub-millisecond — rather than the whole participation read, which
> is why this shape loses far less than skipping inside the read would. But
> `use_count` is now a **floor on** views rather than a count of them, and it
> undercounts exactly when a link is busiest.
>
> Q2 — whether club links need expiry — will be settled from this number, so
> the number's meaning matters more than its precision: "was this link opened,
> and recently" survives undercounting, and that is the question Q2 asks.
> A count that has to be exact needs an append-only row per view, which is a
> migration, and this package owns none.

## src/lib/services/club-link.ts — recordClubLinkUseByToken (WhatsApp crawler)

> `readClubLinkParticipation` used to call `recordClubLinkUse` itself, at the
> end of the page's `GET`. A club link is handed to coaches over WhatsApp, and
> WhatsApp fetches the URL to build its preview card before anybody taps it, so
> the count included every crawler that had ever seen the message. Q2 asks
> whether coaches still open these links; a bot is not a coach.

## src/lib/services/events/public-tier.ts — PublicEventDetail.joiningUrl

> On the **detail** and in the feed only. The public _list_ has no column for
> it and does not want one — a list row says what and where, and a page of
> thirty join links is not a calendar.

## src/lib/services/events/public-tier.ts — PUBLIC_EVENT_COLUMNS

> `joining_url` **is** among them, and that reverses what this comment used to
> say — LAN-284, Brian, 2026-09-09. The calendar stays public: there is no
> password gate on `/calendar`, no token on the feed, and no change to the
> three access tiers. The protection moved to where it can actually work,
> which is the meeting itself — a Teams meeting requires its passcode, shared
> privately, on top of the Oxford-domain approval — so publishing the link is
> safe because the link alone admits nobody. Stated once because it is the
> accepted cost: nothing in this application can verify that a given meeting
> has a passcode set, so an operator who publishes an open meeting publishes it
> to the world. The control is operator discipline, and the editor warns them.
>
> `TEMPLATE_COLUMNS` folded in `tpl.colour_key` for LAN-276 correction round 1,
> which reaches here too: a template's colour is exactly as public as its
> name, and the public calendar has always coloured its tiles.

## src/lib/services/events/read.ts — EventListFilters.templateId

> The filter used to be an `event_type`, when the type was the template and
> the seven values were the seven things an operator could think of. It
> selects by template now for the same reason the column shows a template's
> name: the operator picks the word they see, and two templates may share a
> class. An id that matches no template matches no rows, which is what an
> unknown filter should do.

## src/lib/services/events/read.ts — participationJoins (LAN-227/LAN-228 perf)

> ## Why grouped rather than correlated
>
> These were six correlated subqueries on `e.id` until LAN-227 measured them
> and LAN-228 replaced them: 591–846 ms of CPU and 742 680 buffer hits to
> return one season's 110 events on the local seed. `current_rsvp` is a
> `distinct on (invitation_id)` view over the whole of `rsvp_responses`, and
> correlating it on `i.event_id` gives the planner nothing to push down — so it
> re-derived the club's every standing answer **once per event row**, and did it
> twice, for `response_count` and again for `said_yes_count`. The cost was
> linear in events and linear in answers at the same time, which is quadratic
> across a season that is filling up.
>
> Grouped once and joined once, the view is derived a single time whatever the
> row count. Measured on the same seed, the same statement went from 591–846 ms
> to 6–8 ms. No index was missing and none was added; the shape was the whole
> cost.
>
> ## Why the scope is a parameter
>
> The season list scopes on `p.season_id` rather than on a subquery over
> `events`, and the two are the same set rather than nearly the same one: all
> three tables carry the season denormalised behind a composite foreign key
> (`invitations_event_same_season`, `attendance_records_event_same_season`,
> `event_audience_members_event_same_season`, each
> `(event_id, season_id) references events (id, season_id)`), so a row's season
> cannot disagree with its event's. The database enforces the equality; this
> only spends it.

## src/lib/services/events/read.ts — listCurrentSeasonEvents (Q-6 status filter)

> Q-6. The Status filter selects the rows whose Status column reads the word
> that was chosen — which is not the same as comparing `e.status`.
>
> The list shows that word in the column, so the filter has to
> mean the same thing, or choosing **Approved** returns rows visibly
> labelled _Occurred_ and choosing **Occurred** misses none of them but
> overlaps the other — two controls answering one question two ways, which
> is what `docs/ux/standards.md` rule 7 exists to stop. Brian asked to
> "easily be able to tell which ones happened versus not", and two filter
> values that both match the same evening do not.
>
> So the expression below is `statusLabel` in `src/app/operate/events/page.tsx`,
> in SQL, and the four values partition the season.

## src/lib/services/events/write.ts — updateEventDraft (origin/template_id absent)

> `origin` is deliberately absent from this statement. An event that came
> from somewhere else — a BUCS fixture, a negotiated slot — keeps the
> provenance it arrived with, and editing its name here must not quietly
> reclassify it as the club's own. Nothing in this slice creates such an
> event; the schema does, and later issues will.
>
> LAN-265. The template is deliberately absent from this statement, on the
> same reasoning `origin` already is: a different template is a different
> kind of event, and an edit that silently changed one would reclassify an
> event underneath the audience and the questions it already carries. The
> form does not offer it, and neither does amendment.

## src/lib/services/events/write.ts — deleteEventDraft header

> ## Why deleting is the right verb, and the only one
>
> "Withdrawn" used to mean _it never became an event_, and LAN-151 removed the
> status because that is not a state an event is in — it is an event that should
> not exist. So an abandoned draft is removed, and a `cancelled` event is
> something quite different: one that _was_ approved, that people were told
> about, and that was called off. They are not two flavours of one thing.
>
> Brian, 2026-08-21, on where the rule is stated: "That warning should pop up if
> you try to delete an approved event ... I don't think it needs to be called out
> there specifically." So the confirmation on a draft says what deleting _that
> draft_ does, and this sentence appears only to somebody who tried it on
> something else.

## src/lib/services/attendance/shared.ts — closedReasonFor (LAN-152/D72 tidy-up finding)

> That is not a hypothetical tidy-up. It was found on the screen: the synthetic
> season carries sessions recorded as having happened whose dates are still
> ahead of today — an assertion invariant E5 permits and the seed makes — and
> without this branch the product refused to show a coach a register they had
> already filled in twenty-one names on. A rule that shuts a sheet somebody is
> halfway through is the opposite of the one D72 asks for.

## src/lib/services/attendance/read.ts — mismatch filtering (D74, LAN-152/LAN-165)

> Filtered **here** rather than in `public.rsvp_attendance_mismatches`
> deliberately: the view is schema, and this mission's schema belongs to
> the status-and-occurrence migration package. This function is the
> view's only reader today, so the rule is applied wherever the view is
> read — but a future direct reader of the view, written after this
> package and not looking here, would over-count every unrecorded yes on
> a sheet somebody has started. Recorded in the residual-risk section of
> the pull request that merged LAN-165.

## src/lib/services/attendance/read.ts — readEventAttendanceSummary header

> ## Why this is not `readAttendanceBoard`
>
> The board answers "may the register be opened, and who is on it?", and for
> an event whose buffer has not lifted the honest answer to the first half is
> no — so it returns no participants. The headline is a different question:
> **forty-seven people were asked and twenty-one said yes** is true of an
> approved event a fortnight away, and the event page has to print it.
>
> So it is five counts in one round trip rather than a `full outer join` and a
> view read the page has no use for.

## src/lib/services/event-templates/read.ts — EventTemplateSummary.eventCount

> How many events were ever created from this template.
>
> On the list so that **Delete** can be absent rather than present-and-
> refusing on a template the club has used: a control that is always there and
> usually says no teaches an operator to ignore it. The number is also the
> honest answer to "may I get rid of this one", which is the question somebody
> looking at a list of templates is actually asking.

## src/lib/services/event-templates/write.ts — createEventTemplate header

> Brian, 2026-09-09: "Creating a template also creates its messaging cadence,
> which starts from a default cadence and can then be edited on the Messaging
> schedule screen like the seven existing ones."
>
> All three rows in one transaction, and that is the whole design. A template
> without a `messaging_schedules` row could be picked on the create form and
> would then refuse at approval, naming a table no operator has heard of — the
> failure would land on whoever approved next Wednesday's session rather than on
> whoever created the template, days later and on a different screen. The
> primary key and the cascading foreign key added by
> `20260916090000_event_templates.sql` make the pairing structural; this
> function is what keeps it true at the moment of creation.
>
> The new template arrives empty of defaults. Nothing is copied from another
> template: "Kicking Clinic" is not a variant of Practice, and pre-filling it
> with Practice's venue and questions would put words in the operator's mouth on
> a screen whose whole purpose is that they get to choose.

## src/lib/services/event-templates/write.ts — DEFAULT_CHASE_THRESHOLD_DAYS

> Two days, which is what six of the seven shipped rows say and what the
> migration calls "the routine events". A game's seven and a social's five are
> decisions about a game and a social, not about an unnamed new kind of event.

## src/lib/services/event-input.ts — EVENT_TYPES

> LAN-151 narrowed the enum from ten values to these seven: `camp` became a
> practice, `fixture` and `varsity` became `game`, and `other` became
> `meeting`. There is no longer a subset that a draft may be created as,
> because there is no longer a type whose defining fields the form cannot
> record — the opponent went with `fixture` (D14: the name carries it) and the
> side went with it.

## src/lib/services/event-input.ts — EventStatus

> LAN-151 narrowed `public.event_status` from eight values to these three, and
> what went is worth naming because each was a thing the club turned out not to
> do. `pending_approval` modelled a proposer asking a gatekeeper, and Brian
> removed the Submit step on 12 August 2026. `rejected` and `withdrawn` were
> two flavours of "it never became an event", which is a draft. `occurred` and
> `not_held` were assertions somebody typed, and `derivedEventState` below now
> answers that from the date instead.

## src/lib/services/event-input.ts — DerivedEventState / derivedEventState

> What replaced the assertion is not another flag but the register itself: its
> saved-versus-untouched state is the record of whether the session was
> assessed (D71-D74), and a sheet saved with everybody absent is a real zero
> rather than a sheet nobody opened.

## src/lib/services/event-input.ts — RawEventDraft.templateId

> The form posts an identifier and never a class: an operator picks "Kicking
> Clinic" from a list of the club's own templates, and what class of event
> that is underneath is the template's answer, read server-side inside the
> transaction that writes the row.

## src/lib/services/event-input.ts — FIVE_MINUTE_INCREMENT_MESSAGE (D78)

> Deliberately not a database check constraint. The club's own historical
> records carry minute-level drift — the seeded dataset reproduces it, because
> the real term card does — and a constraint would refuse that data when the
> migration ran. The rule is about _entry_, which is where it is applied.

## src/lib/services/event-input.ts — deriveTermCoordinate week bound check

> The schema permits −1 to 8 and nothing else. A term whose dates and week
> bounds disagree would otherwise produce a week the database refuses, and
> an event that cannot be saved is a worse answer than one outside term.

## src/lib/services/event-input.ts — trimmed (LAN-264 CRLF defect)

> The normalisation is not tidiness. HTML says a `<textarea>` submits its value
> with every newline as CRLF, whatever was typed and whatever was rendered into
> it, so the moment description and required equipment became multi-line the
> stored `\n` came back as `\r\n` on the very next save. Nothing had changed and
> `diffAmendment` compares the normalised value, so every amendment to an event
> with a kit list recorded a second, invented change — "Required equipment:
> <three lines> → <the same three lines>" — and rewrote the column to CRLF.

## src/lib/services/event-input.ts — validateEventDraft joiningUrl safety check (LAN-272 F1)

> LAN-284 made this field public, on the event page as an `href` and in the
> subscription feed as a raw `URL` property. Finding F1 of the LAN-272 review
> is what makes the check live _here_ rather than only at those two readers:
> a `javascript:` value typed into this box became an anchor on an
> unauthenticated page that ran script in the application's own origin. The
> readers guard themselves as well, but a value that can never be published
> should not be stored, and refusing it at the form is the only place the
> operator finds out — a reader's guard is silent by design.
>
> Same rule as the feed's, one function: absolute, `http` or `https`, no
> control character or line break.

## src/lib/services/event-approval/read.ts — readEventAudienceGroupSummary header

> D3 (round 2): the event detail page showed a count and then names, with no
> group named anywhere, which is the same fact the approval review already
> states with `summariseAudienceGroups`. This calls that same function so the
> rule is one rule in two places, not two — the detail page just does not get
> a payload built for an approver working the review, which is the whole
> reason this is its own read rather than a second use of
> `readApprovalPreview`.

## src/lib/services/event-audience.ts — listAudienceCatalogueIn header (eventType gate)

> D46 puts recruits on a Recruitment event alone, and Brian restated it on
> 2026-09-10: "Recruits should only ever be selectable and only ever be
> available for a recruitment event. Every other event, they're non-factors."
> Before LAN-295 that rule lived only in `AUDIENCE_GROUPS` — the _Recruits
> button_ was withheld, while the recruits themselves stayed in the catalogue as
> individually tickable rows that `resolveSelection` would happily resolve and
> approval would happily invite.
>
> So the gate is here, in the read every one of those paths shares, and it is a
> required parameter rather than an optional filter: a caller that forgets it
> does not compile. On a non-Recruitment event a recruit is not merely hidden —
> they are not in the catalogue, so their key resolves to nothing and
> `saveEventAudience` refuses the selection outright.

## src/lib/services/event-questions.ts — writeEventQuestionsIn unnest rationale

> Every other bulk write in this service layer is a single `insert … select from
unnest(…)`, and this one is not, because `choices` is an array _per row_.
> PostgreSQL's `unnest` flattens a multidimensional array completely — three
> questions offering four options each arrive as twelve rows, not three — so the
> set-based form silently produces the wrong shape rather than failing.

## src/lib/services/calendar.ts — monthGridEvents (type legend defect)

> Independent review found
> it being fed the whole season instead, which named colours for types that
> were nowhere on the screen.

## src/lib/services/event-csv/compare.ts — valueOf type column

> The template's own name, not a class token: it is what the
> screens print, what `resolveTemplate` reads back, and the only value that
> survives a rename. An export re-imports unchanged because the name it
> wrote matches by name on the way back in.

## src/lib/services/event-periods.ts — periodBounds header (Q-18 fix detail)

> This is the whole of the fix. The old bucketing anchored every period at
> today and only ever looked forward — "This week" was `addDays(today, 13)`,
> a rolling fortnight with no Monday in it anywhere, and every period
> silently dropped the part of itself that had already happened. Q-18 is
> explicit that each period is its own fixed stretch of the calendar,
> including the days in it that are already past:
>
> - **This week** — Monday to Sunday of the week containing today.
> - **This month** — the 1st to the last day of the current calendar month.
> - **This term** — the Oxford segment's (term's) own first to last day.
> - **All upcoming** — today forward, no end.
> - **All events** — every event the club has, no boundary at all.

## src/lib/services/event-periods.ts — bucketEventsByPeriod header (two-pass fix)

> Collapsing these into one pass — as the pre-C7 code did, testing `day < today` as
> both the inclusion rule and the grouping rule at once — is exactly how a
> period came to mean "today forward" everywhere rather than only on
> **All upcoming**, where Q-18 says it should.

## src/lib/services/event-periods.ts — file header (All events, bucket order)

> Past events stay reachable (D57 keeps a cancelled event visible with its
> history, and an occurred event is the register's own record), and they are
> never the default view. **All events** is the widest bucket and is where they
> are, with every sort and every filter working there exactly as everywhere
> else — Brian, 21 August 2026: "we do need an all events thing … All the sorts
> should work here. All the filters should work here as well."
>
> ## The order inside a bucket is the sort's, not this module's
>
> Buckets preserve the order they are handed. The list has one sort control and
> `docs/ux/standards.md` rule 7 is about one question having one answer, so
> "Already happened" reads in the same direction as everything above it rather
> than quietly reversing itself. An operator who wants the most recent first
> flips the direction, and the whole page follows.

## src/lib/services/event-template-input.ts — file header (LAN-265 reopening, no-date/no-RSVP rationale)

> ## Operators create templates, and name them — LAN-265
>
> D12's seven event types and D40's one-template-each were the same fact until
> Brian reopened it on 2026-09-09: "A template is anything the operators want to
> create." A template is now a row with its own id and its own name, and the
> seven-value enum survives underneath it as the behavioural class the code
> needs a closed vocabulary for. Adding a _class_ is still a migration and
> Brian's decision; adding a _template_ is an ordinary administrative act.
>
> ## What a template deliberately does not hold
>
> No date and no start time (D40, Brian 2026-08-21: "the name is always going to
> be unique ... Usual time doesn't make any sense to me"). That quotation is
> about the **event's** name, which a template still never supplies; the
> template's own name, added by LAN-265, is what the kind of event is called
> rather than what any one of them is called. What a template can usefully say
> about time is how long it runs, so it holds a duration.
>
> And no RSVP timing of any kind. The per-type chase threshold lives in
> `event_type_settings` for Mission 4 to consume; a template is what an event
> arrives looking like, and when somebody is chased is not part of what an event
> is.

## src/lib/services/event-template-input.ts — TemplateColourSwatch header (LAN-276 R1)

> Brian, walking the review environment, 2026-09-10: "In the template, swatch
> color should be something that gets chosen, so it gets added as part of the
> template." Before this, the calendar coloured a tile by `event_type` — the
> behavioural class an operator never sees or picks — so every template an
> operator created showed Practice's blue by accident, because `practice` is
> `DEFAULT_TEMPLATE_CLASS`.
>
> The seven values that carry a seeded template's name below are exactly the
> seven hex pairs `EVENT_TYPE_COLOURS` gave those seven event types before
> this correction, so the migration's backfill keeps the calendar looking
> exactly as it did. The rest exist only so an operator has more than seven
> choices; nothing associates them with a class.

## src/lib/services/events/read.ts — 4a. src/lib/services/events/read.ts — EventListFilters.templateId

> A template id, or `null` for all — LAN-265.
>
> The filter used to be an `event_type`, when the type was the template and
> the seven values were the seven things an operator could think of. It
> selects by template now for the same reason the column shows a template's
> name: the operator picks the word they see, and two templates may share a
> class. An id that matches no template matches no rows, which is what an
> unknown filter should do.

## src/lib/services/events/read.ts — 4b. src/lib/services/events/read.ts — participationJoins

> The three grouped reads those counts come from, joined to `e` once. LAN-228.
>
> ## Why grouped rather than correlated
>
> These were six correlated subqueries on `e.id` until LAN-227 measured them
> and LAN-228 replaced them: 591–846 ms of CPU and 742 680 buffer hits to
> return one season's 110 events on the local seed. `current_rsvp` is a
> `distinct on (invitation_id)` view over the whole of `rsvp_responses`, and
> correlating it on `i.event_id` gives the planner nothing to push down — so it
> re-derived the club's every standing answer **once per event row**, and did it
> twice, for `response_count` and again for `said_yes_count`. The cost was
> linear in events and linear in answers at the same time, which is quadratic
> across a season that is filling up.
>
> Grouped once and joined once, the view is derived a single time whatever the
> row count. Measured on the same seed, the same statement went from 591–846 ms
> to 6–8 ms. No index was missing and none was added; the shape was the whole
> cost.
>
> ## Why the scope is a parameter
>
> `scope` is the caller's own `where` on the participation row, and it is
> required rather than optional. Without it each group would aggregate every
> invitation, every audience row and every attendance record the club has ever
> recorded, in every season, to answer a question about one season or one
> event — which trades a per-row cost for an unbounded one and gets slower
> every year as the seasons pile up behind it. The season list
> passes the season; the single-event read passes the event. It is SQL written
> in this file, never anything a caller supplied, and the values it compares
> against stay parameters.
>
> The season list scopes on `p.season_id` rather than on a subquery over
> `events`, and the two are the same set rather than nearly the same one: all
> three tables carry the season denormalised behind a composite foreign key
> (`invitations_event_same_season`, `attendance_records_event_same_season`,
> `event_audience_members_event_same_season`, each
> `(event_id, season_id) references events (id, season_id)`), so a row's season
> cannot disagree with its event's. The database enforces the equality; this
> only spends it.
>
> The alias inside each group is `p` — participation — so one scope string fits
> all three.

## src/lib/services/events/read.ts — 4c. src/lib/services/events/read.ts — Status filter query comment

> Q-6. The Status filter selects the rows whose Status column reads the word
> that was chosen — which is not the same as comparing `e.status`.
>
> `occurred` is derived and never stored (D30): an approved event whose date
> has passed. The list shows that word in the column, so the filter has to
> mean the same thing, or choosing **Approved** returns rows visibly
> labelled _Occurred_ and choosing **Occurred** misses none of them but
> overlaps the other — two controls answering one question two ways, which
> is what `docs/ux/standards.md` rule 7 exists to stop. Brian asked to
> "easily be able to tell which ones happened versus not", and two filter
> values that both match the same evening do not.
>
> So the expression below is `statusLabel` in `src/app/operate/events/page.tsx`,
> in SQL, and the four values partition the season. Today is a parameter
> rather than `current_date` so the club's zone decides which day it is: at
> 00:30 in Oxford in June, `current_date` at UTC is still yesterday.
>
> A value that is none of the four matches nothing, which is what an unknown
> filter should do.

## src/lib/services/events/read.ts — 4d. src/lib/services/events/read.ts — lockEventIn

> The event, read under a row lock that is held until the transaction ends.
>
> ## What this is for, and the bug that produced it
>
> `withTransaction` opens a plain `begin`, so the isolation level is READ
> COMMITTED. That is the right default and it is not enough on its own for a
> read-then-write across _several_ tables: two transactions can each read a
> consistent picture, each decide it is safe to proceed, and each be right about
> a state that no longer exists by the time they write.
>
> Independent review proved exactly that against LAN-77's approval path, with
> three real connections. `approveEvent` read the audience, then flipped the
> status; `saveEventAudience` checked the status with a plain `select`, which
> does not block on another transaction's uncommitted `update`, and deleted the
> audience rows underneath it. The committed result was an **approved event with
> no audience and no invitations** — precisely the state invariant E1b exists to
> prevent, and one `uninvited_audience_members` cannot even report, because
> there are no audience rows left to report on.
>
> `select … for update` closes it: the second transaction blocks here until the
> first commits or rolls back, and then sees the truth rather than a memory of
> it. Every path that reads an event and then writes rows that depend on the
> event's state takes this lock **first**, before reading anything it will make
> a decision from.
>
> The guarded `update … where status = 'draft'` stays where it is. It is still
> the thing that makes a double submission safe, and it now has a lock in front
> of it rather than instead of it.
>
> ## Why it returns the event rather than just locking
>
> So that a caller cannot take the lock and then act on a copy it read before
> taking it — which is the bug in miniature. The returned detail is read after
> the lock is held, so it is authoritative for the rest of the transaction.

## src/lib/services/participation-view.ts — ParticipationTier doc

> Who may read a participation table. Delivery is the only difference (D3).
>
> R157-B7. This is `@/lib/auth/event-tier`'s `EventReadTier` with `public`
> removed, and it is a separate declaration rather than an import for one
> mundane reason: that module is `server-only`, and this one is imported by the
> filter bar, which is a client component. The two are pinned together by a
> compile-time assertion in `src/lib/auth/event-tier.test.ts`, so they cannot
> drift into being two vocabularies.
>
> They do not collapse into one type. `EventReadTier` includes `public`, and
> there is no public participation payload for a `tier: "public"` to
> discriminate — `Participation` could not represent it, and every switch over
> the tier would gain a branch that cannot occur. Narrowing is the honest
> relationship, and the assertion is what makes it provable.

## src/lib/services/participation-view.ts — ParticipationDiscrepancy doc

> Q4 asked whether the RSVP-versus-attendance discrepancy is a column, a flag,
> or derived from the two columns. **It is derived**, and the reasoning is
> worth keeping next to the code that does it.
>
> 1. **The approved mockup derives it.** W7's table marks Alaric Brindlewood
>    (yes, then absent) and Cassian Wolvercote (never answered, then present)
>    with the same `≠` beside the name, and marks neither in a column of its
>    own. It also marks a case `public.rsvp_attendance_mismatches` does not
>    classify at all — "never answered, attended" — so reading the view would
>    not have reproduced the screen Brian approved.
>
> 2. **The stored view flags nothing during the session.** Its
>    `occurred_events` term requires `scheduled_on < today` in Europe/London,
>    so on the evening of the event — exactly when the register is open and
>    being filled, and exactly when a coach would notice somebody who said no
>    standing on the pitch — it emits no row at all. D64's marker would
>    appear the following morning. Deriving it here has no date term and is
>    therefore correct at the moment it is useful. This is the finding
>    carried into this package, and this is the answer to it.
>
> 3. **Derived cannot be auto-reconciled.** D64 and the frozen model both say
>    the mismatch is never silently reconciled. There is no row to update, no
>    column to clear and no control that clears one: the marker is a function
>    of two authoritative records, and the only way to change it is to change
>    one of them on its own surface.
>
> 4. **It costs no migration.** This package owns none.
>
> A column or a stored flag remains available later; nothing here forecloses
> it, which is what the packet meant by "it can change".
>
> ## Where the two vocabularies differ, and why they are spelled the same
>
> R157-B3. The classes are named in `./discrepancy-vocabulary.ts`, which is
> also where the divergence from `public.rsvp_attendance_mismatches` is stated
> once, for both readers. The shared cases now carry the **stored** spelling —
> `said_no_but_attended`, not `said_no_attended` — because the stored one is in
> shipped migrations and cannot be renamed without one, and because two
> near-identical spellings are what a future join or report mapping misses in
> silence.

## src/lib/services/participation-view.ts — discrepancyFor doc

> The marker for one person, or `null`.
>
> **Both records must exist.** A person who said yes and is not on the sheet is
> not a disagreement — it is an absence, and the club already has a word for
> it: _not recorded_. That is the rule LAN-152 wrote when the board reported
> "0 recorded, 30 mismatches", and it is the same rule one row at a time: a
> half-filled register must not accuse the half nobody has reached yet.
>
> `excused` never marks. It is a recorded, accepted absence, and calling it a
> discrepancy would make the marker a judgement — which the workflow says in
> as many words it is not.
>
> A walk-up never marks either. The mockup leaves Wilfrid Danecroft unmarked:
> the Capacity column already says **Walk-up** and the Invitation column
> already reads "—", so a marker beside the name would say a third time what
> the row says twice.

## src/lib/services/participation-view.ts — applyParticipationView doc

> The filtered, sorted rows — one pure function, so the operator table and the
> club-link table cannot drift apart.
>
> Every filter combines with every other (W7: "the filters combine and apply as
> you type"), and `delivery` is simply never populated at the club-link tier,
> where the column does not exist.
>
> The sort is **stable and total**: ties fall back to the display name, so two
> people with the same answer come out in the same order on every render. An
> unstable order on a table somebody is reading down is a table that appears to
> shuffle itself.
>
> The tie-break stays **ascending** in both directions, and that is deliberate.
> Sorting descending by Answer puts the people who have not answered at the
> top, and A before Z inside that group is predictable; reversing the names as
> well would be a second reversal nobody asked for.

## src/lib/services/participation-view.ts — readParticipationFilters doc

> The filters as they arrived, with anything unrecognised dropped.
>
> Unrecognised is dropped rather than refused, for the same reason the events
> list does it: a stale link with a filter that no longer exists should show
> the table, not an error.
>
> ## The tier is an argument, and it has no default
>
> R157-F9a. `?delivery=queued` on a club link used to empty the table: every
> club-tier person has no delivery field, so nothing matched, and the reader
> was told "No one matches these filters" for a filter their page has no
> control for and no data behind. The value is now dropped unless the caller
> says it is reading at the operator tier, and validated against
> `DELIVERY_FILTERS` even then — an unrecognised state was previously accepted
> whole and compared against a column.
>
> The parameter is required rather than defaulted, and deliberately so: a
> default is a fail-open, and the tier is a fact every caller already knows.

## src/lib/services/oxford-year.ts — LEADING_VACATION_WEEKS doc

> How much of the year's two Long Vacations is drawn — BG-153-1.
>
> Brian, at the visual gate, on a leading vacation rendered to its full length:
> _"It just shows a really dead calendar, and that's not what I want to see."_
> A season opening at an AGM can sit three months before Michaelmas, and every
> one of those weeks was being drawn empty above the first thing that happens.
>
> So the two ends are trimmed to where the club's records actually reach: the
> **last** `LEADING_VACATION_WEEKS` of the vacation before the year's first
> term, and the **first** `TRAILING_VACATION_WEEKS` of the one after its last —
> each extended, never shortened, to include an event that sits further out.
> Brian: _"if there was an event 7 weeks beforehand, it should show 7, 6, 5, 4,
> 3, 2, 1, all the way down"_, and _"if there's an event 3 weeks after the
> season, it should show weeks 1, 2, and 3."_
>
> ## What this does not do
>
> **It does not renumber anything.** Those counts are distances from the term
> boundary, describing how far to extend; they are not labels. Vacation weeks
> are numbered forward from 1 from the vacation's real start and meet the next
> term at its own first week (D85, Stewart Humble) — a leading vacation trimmed
> to its last five weeks therefore _starts_ at whatever number those weeks
> already carry, which on a fourteen-week vacation is "Long Vacation 10".
>
> **It does not touch terms.** Michaelmas, Hilary and Trinity keep every
> configured week, empty or not: an empty term week is the term card, and is
> the thing the club reads a term card for.
>
> **It does not special-case Christmas or Easter.** Those sit _between_ terms
> and are neither the leading nor the trailing vacation, so the rule simply does
> not reach them — which is the outcome Brian asked for without a rule of their
> own.

## src/lib/services/safe-uri.ts — module header

> ## Why this is its own module
>
> LAN-284 published an online event's joining link. That single decision gave
> the same operator-entered string three destinations that all treat it as a
> _link_ rather than as text: the `URL` property of the subscription feed
> (`calendar-feed.ts`, emitted raw because RFC 5545 3.3.13 types it as a URI),
> the `href` of the anchor on the fully public `/calendar/[id]` page, and the
> value the write path stores in the first place (`event-input.ts`).
>
> The guard was first written for the feed alone. Finding F1 of the LAN-272
> review found the second consumer with no guard at all: a `javascript:` value
> typed into "Joining link" became an anchor on an unauthenticated page, and a
> visitor who clicked it ran that script in the application's own origin, with
> their operator session live in the same browser. Two copies of a rule is how
> that happens, so there is now one, and everything that turns this field into
> a link goes through it.
>
> ## The rule
>
> - **No control characters, and no line break of any kind.** Load-bearing in
>   the feed, where a newline in a raw value ends the content line early and
>   lets whatever follows be parsed as its own iCalendar property. Refused
>   everywhere else too, because a value that cannot be published safely in
>   one place is not a value worth storing anywhere.
> - **`http` or `https` only, parsed rather than pattern-matched.** `new URL`
>   decides what the scheme is; a regular expression only decides what it
>   looks like. `javascript:`, `data:`, `vbscript:` and anything that is not
>   an absolute URL at all fail the same way.
