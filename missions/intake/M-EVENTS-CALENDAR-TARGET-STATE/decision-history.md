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
