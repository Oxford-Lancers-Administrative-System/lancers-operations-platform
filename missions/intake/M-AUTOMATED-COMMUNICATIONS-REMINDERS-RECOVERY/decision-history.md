# M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY — decision history relocated from source

Paragraphs that explained a decision inside a source comment, moved here by LAN-300 so the
source reads as code. Each keeps a one-line pointer at its old location. Nothing here changes
a decision; it records where one was explained.

## src/app/operate/events/presentation.ts — NOTHING_DELIVERED_YET / DistributionCounts / describeDistribution family

> The half of the Distribution fact that stops "invitations created" being read
> as "invitations sent". Until a job has run, nothing has reached anybody, and
> the screen has to say so rather than implying contact.
>
> This is now **one state among several** rather than the only thing the fact
> can say — see {@link describeDistribution}.
>
> ---
>
> What the Distribution fact says about delivery, from the real job states.
>
> ## The defect this replaces — LAN-243
>
> `NOTHING_DELIVERED_YET` used to be interpolated unconditionally whenever the
> event had any invitation at all. Every approved event therefore claimed
> nothing had been delivered **forever**, directly above a participation table
> where most rows carried a green **Delivered** chip — two answers to "did it
> reach them?" on one screen, which is exactly what `docs/ux/standards.md`
> rule 7 forbids. `docs/operating-the-slice.md` expects those three words in
> one state only: after approval, before any job has run.
>
> ## The counts come from the table on the same page
>
> Not from a second query. The event page already holds the operator
> participation rows in order to draw that table, and each row carries the
> delivery state `DELIVERY_STATE_EXPRESSION` produced — so this line and the
> chips beneath it are one reading of one set of rows and cannot disagree.
>
> ## What it says, and what it will not say
>
> Values and states, in the delivery vocabulary `slice-ux.md` § 6 fixed, and
> only the states that are actually present: an event with everything
> delivered reads "61 delivered" and does not go on to list four zeroes.
> **Attempted** is deliberately folded into neither delivered nor failed —
> "Delivered never means read", and a message we have asked about and not yet
> heard back on is its own state. **Held** and **Cancelled** are the club's own
> doing rather than the provider's, and they are named for that reason.

## src/app/operate/events/presentation.ts — PLAN_DISPATCHES_IMMEDIATELY

> W1's settled guarantee, stated rather than derived — Brian, 2026-08-22: "if
> practice happens in 2 days and we're approving and we're sending it out,
> that needs to go out now, right? It should say that."

## src/app/operate/events/presentation.ts — PLAN_LATE_APPROVAL

> `REQ-late-approval`, named on the panel rather than shown as a quietly
> shorter list — W1's "see a short-notice event labelled as one".

## src/app/operate/events/[id]/change-presentation.ts — expectingToBeThere

> W6-01 leads with the number of people expecting to be there, not with the name.
>
> ## Why the invited count is in the same sentence — LAN-242
>
> "Expecting to be there" means **said yes**, and that is settled: the
> attendance board splits on the standing RSVP for exactly this phrase, and
> Brian's own words there are that a no and a nonresponse are the same
> expectation — "those are not the people I'm expecting to be there"
> (14 August 2026). This function does not reopen that.
>
> What it fixes is the sentence a freshly approved event produced: nobody has
> answered yet, so the headline read **0 people are expecting to be there** in
> `h5` over an event with sixty-one invitations out, and a walker reported it
> as the same "0 people" defect the audience heading had (LAN-239, M2). The
> count was true and the screen was still misleading, because the number that
> makes a cancellation consequential — how many people were told this is on —
> was one size down in secondary text. Both numbers now lead together, so the
> zero is a state rather than a claim that cancelling reaches nobody.

## src/app/operate/admin/follow-ups/presentation.ts — RANGE_FROM_LABEL / RANGE_TO_LABEL

> The date-range filter's own two labels — LAN-281, Clint's ask of 2026-09-09.
>
> He was shown this board, said he likes it organised by player, and asked for
> one thing: "the only thing I think that would be good to filter is to just
> have it be like filter by a date range… who's not responding to the stuff
> that we need them to respond to next week?" So the range is over the event's
> own date — the "When" column — and reaches forward as readily as back.
>
> They name the event rather than saying only "From" and "To" because a filter
> control is read on its own by anybody using a screen reader, and "From" alone
> does not say from what. LAN-259 found this board's neighbours with no
> accessible name at all; these carry one because `DateField` renders the label
> as the input's own.

## src/app/operate/events/event-form.tsx — openingTemplate

> What the Type control opens on.
>
> An edit and a refused submission both bring their own. A blank create opens
> on a **practice**, which is what D15 settled and what the club schedules
> most of — and it used to be the literal string `practice`, which was safe
> while the seven types were the seven templates and one of them was always
> called Practice.
>
> After LAN-265 a club can rename or delete any of them, so the rule is
> expressed against the behavioural class instead: the first practice-class
> template on the list, which is the Practice template on a club that has not
> created its own and remains a practice on one that renamed it. A club whose
> templates are all something else opens on the first of them, and one with no
> templates at all gets an empty control and a refusal on save rather than a
> form that silently posts an id nobody has.

## src/app/operate/events/event-form.tsx — D17 required equipment field

> D17: its own field, so it is not buried in a paragraph — and
> free text that behaves exactly like Description above (Brian,
> 2026-09-09; LAN-264). It was a one-line input, which meant Enter
> submitted the form and a kit list could not be written at all.

## src/app/operate/events/templates/actions.ts — createEventTemplateAction

> Creating a template — LAN-265, W8-01's **New template**.
>
> There is deliberately no preview step. `previewEventTemplateAction` exists
> because saving an existing template can reach drafts the operator did not
> think about; a template that did not exist a second ago has no events, no
> drafts and no blast radius, so a confirmation would be a dialog asking
> somebody to approve nothing happening to anybody.
>
> **Redirects to the template list** — LAN-276 correction round 1. Brian,
> 2026-09-10: "When I create a test template and I save, it should take me
> back to the other test templates, and I should see the list automatically."
> This used to redirect to the template it had just made; the list is where
> the new template is now visible among the others, which is what he asked
> to see. `redirect` throws, so it is outside the `try`: caught, it would be
> reported as a failure to create the template that had just been created.

## src/app/operate/events/templates/actions.ts — deleteEventTemplateAction

> Deleting a template nothing was created from — LAN-265.
>
> The service decides, not this action and not the screen: `deleteEventTemplate`
> counts the events inside the transaction and refuses with a sentence, and
> `events_template_fkey`'s `on delete restrict` is underneath that. The editor
> hides the control when the count is non-zero, which is a courtesy; a direct
> POST gets the sentence.

## src/app/operate/admin/messaging/validation.ts — FieldBoundsShape helperText

> What the number does, read at the field itself — MUI `helperText`, the
> same idiom `invite-form.tsx` and `operator-actions.tsx` already use to
> explain a field without a reader having to go elsewhere for it.
> OWNER-LAN171-08, round 3: the grid label alone left what a number
> actually governs unstated — Brian, on the President field: "it just
> says 12 hours, but that doesn't explain what 12 hours after the deadline
> before the meeting is." Present only on the fields Brian named; the two
> day-count fields' short labels already say what they count.

## src/app/operate/events/templates/template-editor.tsx — Name section

> LAN-265. The one field a template cannot leave undecided, and the
> first one on the screen because it is the only thing an operator
> ever sees of a template anywhere else in the application. The helper
> text states the consequence of a rename rather than leaving somebody
> to discover it: Brian, 2026-09-09, asked for it out loud.

## src/app/operate/events/templates/template-editor.tsx — Delete button visibility

> LAN-265, "delete when unused". Absent rather than disabled on a
> template the club has used: a control that is always there and
> usually refuses teaches an operator to ignore it, and the sentence
> under the list already says why this one is missing. The service
> refuses regardless — `events_template_fkey` is `on delete
restrict` — so this is a courtesy and never the boundary.

## src/app/operate/report/chase-grid.tsx — file header

> Brian's own specification, 15 August 2026: "I then want to see RSVP status
> and attendance status for the two of them. For each one of the events, did
> they come? Did they RSVP, or did they not RSVP? Did they attend, or did they
> not attend? We're looking for discrepancies there." Four events gives the
> eight values he counted.
>
> A single collapsed verdict per event — which is what this was — hides the
> comparison that is the whole point of the section. Here the two are side by
> side and the eye does the work.

## src/app/operate/report/chase-grid.tsx — sortRows

> `issues` sorts on the **proportion** rather than the count, because that is
> the comparison Brian asked for: four of four is a worse week than two of
> five, and ranking on the bare count would put them the other way round.

## src/app/join/[code]/opengraph-image.tsx — module header (LAN-279). Destination: `docs/ux/design-system.md`

> Every other route in the application shows the club's supplied `OG Image.png`
> (LAN-269). This one does not, because it is the one link the club pushes at
> strangers — off a poster at the freshers' fair, into a group chat somebody
> forwards. A general club card asks a fresher to work out what they are being
> offered; "Join the Lancers" tells them, and the card is the whole of what
> most of them will ever read before deciding.
>
> LAN-279: "generate it from the logo in code so it stays in step with
> LAN-278". If Brian supplies finished artwork instead, this file is replaced
> by an `opengraph-image.png` in this same directory and the metadata does not
> change.

## src/app/calendar/presentation.ts — `TypeColour` (LAN-276 correction round 1).

> This used to be one colour per `event_type`, which was the club's own
> seven kinds of event and nothing else. LAN-265 let operators create their
> own templates, and every one of them takes `practice` as its class — so
> colouring by class showed every operator-created template Practice's blue,
> by accident. Brian, walking the review environment, 2026-09-10: "In the
> template, swatch color should be something that gets chosen, so it gets
> added as part of the template." Colour is now a fact the template itself
> carries, chosen from a fixed palette on the editor.
>
> The club's own term cards colour their cells by what the event _is_, and
> Brian's review on 14 August 2026 asked for the same: "I really like the type
> colour coding here… every event is grey versus by type." Scanning a term card
> is looking for the shape of a week — two practices, a chalk, a game,
> something social — and colour is what carries that at a glance. Status
> answers a different question and is carried in words on the tile.
>
> Deliberately not the spreadsheet's palette. The issue puts "reproducing the
> term-card spreadsheet's branding or colors pixel for pixel" out of scope, so
> these are chosen for separation and for legible dark text on the tint, not
> sampled from the source. `src/theme.ts` is still a neutral placeholder with
> no branded palette, so there is nothing there to draw from either.

## src/app/join/[code]/signup-form.tsx — module header (LAN-202). Destination: `missions/intake/M-RECRUITMENT/`.

> First name, last name, mobile, **college email** and the consent tick are
> the required fields. Mobile joined the set on Brian, 2026-09-01 ("Mobile is
> required no matter what… Nothing else works if we don't have a phone
> number"), and the college email on Brian, 2026-09-09 (LAN-268), which
> supersedes LAN-246's three-field minimum: "the required set on both the
> onboarding questionnaire and the recruitment forms is four things: first
> name, last name, phone number, college email." It is the club's own proof
> that whoever is at the stand is actually a student — "I had a weird online
> guy trying to join one year and he wasn't a student."
>
> The mobile is the shared two-part control (LAN-211): the country code is a
> dropdown, so a fresher at a stand never carries the burden of writing "+44"
> correctly, and the value this form still hands the server is the same single
> string `validatePhoneNumber` has always received.

## src/lib/services/event-amendment-rules.ts — AmendableField

> **The template is not among them either, since LAN-265.** Brian, 2026-09-09:
> "New event picks a template. Amend does not change template." A template
> decides what an event _is_ — its class, its default audience, its questions
> and the cadence forty people were already messaged on — and swapping it on an
> approved event would reclassify the event underneath all four without a single
> one of them being recomputed. The honest way to hold a different kind of event
> is to cancel this one and create that one. It was `eventType` here until
> LAN-265, on the reasoning that whatever `W4`'s editor shows, `W5` compares;
> `W4`'s editor no longer shows it either.

## src/lib/services/event-amendment-rules.ts — MATERIAL_FIELDS

> What is deliberately **not** here: `name`, `description`, `requiredEquipment`,
> `joiningUrl` and `isMandatory`. D55 lists description, equipment
> and name as the silent ones, and D14 says a name change is not material
> because the name is where the club writes "vs Bath". The remaining two are
> not on D55's list in either direction; treating them as silent-by-default is
> the same answer as the fields they most resemble, and the operator can still
> turn the tick on for any of them with no confirmation asked.

## src/lib/services/event-amendment-rules.ts — mergeAmendment (LAN-244 defect)

> ## The defect
>
> The amend form posts a whole snapshot of the event, every field, whether or
> not the operator touched it. Two tabs open on one event is then destructive
> by construction: tab A saves a new venue; tab B, loaded before that and never
> refreshed, saves a description and carries the _old_ venue along with it, so
> the venue silently reverts. Worse than the data loss is the record it wrote —
> the change history stated as fact "Venue: M2W Tab A Venue → Blues Gym, Iffley
> Road", an amendment no operator made, attributed to whoever saved second
> (LAN-239, walker M2).
>
> Two operators editing two different fields both get their change; two editing
> the _same_ field is still last-write-wins, which is honest and is recorded as
> the change it actually was.

## src/lib/services/event-amendment/shared.ts — recordNoticesOwedIn (channel/scheduled_for null)

> `channel` and `scheduled_for` are left null on purpose, and — checked while
> building W8 — that purpose still holds. The obvious next step, giving these
> a channel and letting the sweep claim them, runs the same `claimJobIn` path
> every other job takes, and that path unconditionally mints an RSVP token
> (`issueTokenIn`) before it will send anything. `issueTokenIn` refuses a
> **cancelled** event exactly as it refuses a started one — so a
> `cancellation_notice`, whose event is cancelled by definition, would throw
> on every claim, roll back before `attempt_count` increments, and be
> reclaimed by the very next tick forever: the identical unbounded-retry
> failure `readDueJobs`'s own comment documents for a started event's player
> rungs, reached here by a different door. A notice needs a send path that
> mints no token — the escalation's `dispatchEscalationJob` is the existing
> precedent for exactly that shape — and building one is real, undone work
> this package did not reach; see the PR for the limitation recorded against
> it rather than a silent implementation here.

## src/lib/services/event-amendment/cancel.ts — RENOTIFY_ALREADY_SENT_MESSAGE (R156-A5)

> R156-A5. The rule W5-04 states — re-notify exists for a change that "went
> out to nobody" — used to live only in `page.tsx`, as the condition that
> decided whether to render the button. A second caller reaching
> `renotifyEvent` directly skipped it entirely and could send a duplicate
> notice for a change everyone had already been told about. The service is
> now where this is enforced; the page's own check becomes the courtesy of
> not offering a control that would refuse.

## src/lib/services/event-amendment/cancel.ts — renotifyEvent header (Brian quote)

> "Turning the notification off is one tick, and it is easy to get wrong at
> half past seven on a Monday evening. Without this, a missed notification is
> permanent and the only fix is WhatsApp."

## src/lib/services/event-amendment/cancel.ts — nonresponse_flags resolution (LAN-169)

> LAN-169. W5: "The event is cancelled — outstanding chase work stops; the
> queue drops the event." Half of that is free, because `nonresponse_queue`
> only reads approved events. The other half is not: a raised flag survives
> its event's cancellation, and a flag is cleared **only by resolution and
> never by time** (`REQ-one-flag-per-threshold`), so nothing else would ever
> close it and the follow-up queue would carry a permanent row about an
> event that is not happening.

## src/lib/services/event-amendment/amend.ts — AmendmentOptions.baseline

> The event as the form that is submitting loaded it — LAN-244.
>
> Given it, this call amends only the fields that differ from it, and every
> other field keeps whatever the row holds now. Omitted, `input` is applied
> whole, which is the behaviour that let a stale second tab revert a field it
> never touched and record the reversion as somebody's amendment. Every
> screen passes it; it is optional only so that a service-level test may
> state an amendment as one complete intention.

## src/lib/services/event-amendment/amend.ts — amendApprovedEvent (LAN-244 merge)

> LAN-244. What this form actually asks to change, against the row as it
> stands under the lock — not the whole snapshot it happens to be carrying.
> `mergeAmendment` explains why a form that never touched a field must not
> be able to revert it, and the history entry below is built from `applied`
> for the same reason: it must describe the amendment that happened.

## src/lib/services/event-amendment/amend.ts — F-A2/F-C3 plan-less event trigger

> F-A2/F-C3. `rescheduled` alone used to decide whether this ran, which
> is why amending one of the 97 approved-but-plan-less events into a new
> venue, still on the same date, froze `event_messaging_plans` from
> nowhere and created nothing (F-C3), and an event whose date an operator
> never touches had no route back to a working ladder at all (F-A2). An
> approved event that has never been given a plan needs the identical
> repair a reschedule already does — resolve one against its own current
> schedule, freeze it, and create the jobs it promises — whether or not
> this particular amendment moved the date.

## src/lib/services/messaging-schedule/plan.ts — MessagingPlan.dispatchesImmediately

> The event is closer than its own invitation lead, so the invitation goes
> now. W1's guarantee, stated rather than derived, because an approver
> depends on it: "if practice happens in 2 days and we're approving and we're
> sending it out, that needs to go out now, right? It should say that."

## src/lib/services/messaging-schedule/plan.ts — MessagingPlan.lateApproval

> The runway was too short to run the ordinary ladder before the deadline.
>
> Replaces compression entirely (Brian, 2026-08-25). Such an event still
> chases — it is not downgraded to a single announcement — but it is WhatsApp
> only and it never escalates.

## src/lib/services/messaging-schedule/plan.ts — buildLadder header (REQ-count-forward)

> `REQ-count-forward`, and Brian's words on 2026-08-25: "Count forward from the
> invitations." Anchoring backwards from the deadline was the earlier model and
> it produced the gap W7's preview exposed — a game invited twenty-one days out
> finishing its ladder eleven days before the deadline it was chasing.

## src/lib/services/messaging-schedule/plan.ts — resolveMessagingPlanIn header (PostgreSQL arithmetic)

> `events.scheduled_on` is a bare `date` and `starts_at` a bare `time`; neither
> carries a zone. "Two days before this event's start" is therefore a
> wall-clock rule, and Britain changes offset twice inside a season. PostgreSQL
> carries the IANA database and `((date - n) + time) at time zone 'Europe/London'`
> is correct across both transitions. The equivalent in JavaScript is a
> hand-rolled offset search that is one edge case away from putting a deadline
> an hour out every October.

## src/lib/services/messaging-schedule/plan.ts — lateApproval computation

> A late approval is one whose runway cannot carry the ladder the club
> configured — not merely one that dispatches immediately. The two differ:
> a practice approved four days out with a five-day lead dispatches
> immediately AND has room for only two of its three rungs, so it is both;
> a game approved on its lead day exactly is neither.

## src/lib/services/messaging-schedule/plan.ts — recruit follow-up <= boundary

> The same "chasing nothing after the deadline" reasoning the player
> ladder's own `available = floor(runway / cadence)` arithmetic uses, at
> a cap of one rung — including its boundary: `available` counts a rung
> landing exactly on the deadline as fitting (a runway of exactly two
> cadence periods schedules two rungs, the second at the deadline
> itself), so this is `<=`, not `<`. With the shipped defaults
> (`recruit_invitation_lead_days = 5`, `recruit_follow_up_cadence_hours =
72`, the Recruitment row's own `rsvp_by_days = 2`) the follow-up lands
> exactly at the shared deadline — five days minus three days is two —
> and a strict `<` would silently never schedule it under the defaults
> this table ships with.

## src/lib/services/messaging-schedule/schedule.ts — MessagingSchedule.whatsappReminderCount

> Every WhatsApp message the ladder sends, **counting the invitation
> itself as the first one** (Q-19, `REQ-ladder-order` governs over W7's
> looser "reminders" wording). A club that wants one further WhatsApp
> reminder after the invitation sets this to 2, not 1 — the count column
> never calls the invitation a reminder, but it does count it.

## src/lib/services/messaging-schedule/schedule.ts — DEFAULT_MESSAGING_SCHEDULE

> Brian, 2026-09-09: a new template's cadence "starts from a default cadence and
> can then be edited on the Messaging schedule screen like the seven existing
> ones". These are the numbers six of the seven shipped rows already carry, and
> which `20260825120000_messaging_schedule_and_chase.sql` calls the routine
> events': answer two days before, invite five days before, a rung a day, two
> WhatsApps counting the invitation, one email, and the President told twelve
> hours after the deadline. A game's seven days and a social's five are
> decisions about a game and a social, and there is nothing to base such a
> decision on for a kind of event that did not exist a minute ago.

## src/lib/services/messaging-schedule/schedule.ts — createMessagingScheduleIn

> `event_type` travels with it because `messaging_schedules_template_fkey` is
> composite — the class on this row is provably the template's own rather than
> conventionally so — and because
> `messaging_schedules_recruit_fields_are_recruitment_only` still reads it: a
> template of the `recruitment` class must carry the two recruit columns and any
> other class must not. Operators cannot create a recruitment-class template
> (`DEFAULT_TEMPLATE_CLASS` is `practice` and nothing offers the choice), so the
> two columns are left null here; the day that changes, this is where the
> recruit defaults go, and the check constraint is what will insist on it.

## src/lib/services/messaging-schedule/schedule.ts — updateMessagingScheduleIn audit entityId

> `entityId` is the template's own id, and OWNER-LAN171-01's workaround is
> retired with it. `audit_events.entity_id` is `uuid not null`, and this table
> used to be keyed by `public.event_type` — a plain enum label such as
> `"practice"`, which Postgres rejects outright as a uuid, rolling back the
> whole transaction and silently failing every save. The key that LAN-265 gave
> this table _is_ a uuid, so the audit row now names the real row rather than
> a hash of its natural key, and `context` goes on carrying the full before
> and after.

## src/lib/services/messaging-schedule/freeze.ts — freezeMessagingPlanIn header

> `REQ-schedule-not-retroactive`, and the reason it is stored rather than
> recomputed: the schedule is editable at runtime now. Recomputing a chase from
> `messaging_schedules` would mean an operator who shortens the cadence on
> Tuesday retroactively changes when Monday's already-approved event chases
> forty people — and, worse, that the plan the approver read before committing
> stops being the plan that runs.

## src/lib/services/chase-position.ts — ChaseInput.escalationJobStatus

> F-B1, mechanism 4. The `notification_jobs.status` of the one escalation
> job addressed to the President for this invitation's event — `null` when
> `escalated` is true but no job exists yet (the office is vacant) or when
> `escalated` is false. Deliberately not read from {@link jobs}: an
> escalation is addressed to the office about the _event_, not to one
> invitee, so it is never keyed to `invitation_id` and this array — built
> by joining on `invitation_id`, in both `participation.ts` and
> `follow-ups.ts` — can never contain it. This is the fact that used to be
> missing entirely, which is why `escalated` alone used to be trusted:
> three people read "Escalated to the President" while their own
> escalation job was `failed`, and nothing here could have told the
> difference.

## src/lib/services/chase-position.ts — ANSWERED_STATES chase-stopped narrowing (OWNER-LAN173-04)

> OWNER-LAN173-04. "Chase stopped" only tells an operator something they
> did not already know from the Answer column two cells away when a
> reminder actually went out before the answer arrived — the person was
> chased despite answering. Narrowed from "any non-invitation job that
> was cancelled or completed": on an ordinary event everybody answers,
> every one of their still-pending rungs is cancelled in the same
> transaction (W3), and that cancellation alone used to read "Chase
> stopped" on every single row — true of every answered person and
> therefore informative about none of them. A reminder that was only
> cancelled, never sent, is the ladder being stood down before it ever
> reached them, which is not a chase to report as stopped.

## src/lib/services/chase-position.ts — escalation status branch (F-B1)

> F-B1. Used to return `ESCALATED_TO_PRESIDENT` the instant `escalated` was
> true — the flag says the threshold was crossed, not that the President
> was ever told. `escalationJobStatus` is what the job itself actually did:
> `null` covers both "not escalated" (unreachable here, `escalated` is
> already false) and "escalation held, the office is vacant" (F4's own
> separate state, read from `flag_open` alongside `escalation_job_id`
> elsewhere, not from this sentence); anything not in
> `ESCALATION_SENT_STATUSES` — `failed`, `cancelled`, or a job the sweep
> has not reached yet — reads `ESCALATION_NOT_DELIVERED` rather than a
> claim that has not been earned.

## src/lib/services/follow-ups.ts — QueueRow.escalation_status

> F-B1, mechanism 4. `notification_jobs.status` of the escalation job
> itself — `null` when `escalation_job_id` is null (the office was vacant
> when the threshold was crossed). Read here rather than through
> `readChaseJobsForIn` below, which joins on `invitation_id` and can never
> reach an escalation job: those are addressed to the office about the
> event, keyed to `event_id`/`person_id`, never to one invitee.

## src/lib/services/follow-ups.ts — escalationDelivered

> `escalation_job_id` being non-null used to be read
> as "escalated", full stop — three people read "Escalated to the
> President" while their own escalation job was terminally `failed`
> and would never be looked at again.

## src/lib/services/messaging-schedule/plan.ts — MessagingPlan.dispatchesImmediately

> The event is closer than its own invitation lead, so the invitation goes
> now. W1's guarantee, stated rather than derived, because an approver
> depends on it: "if practice happens in 2 days and we're approving and we're
> sending it out, that needs to go out now, right? It should say that."

## src/lib/services/messaging-schedule/plan.ts — MessagingPlan.lateApproval

> The runway was too short to run the ordinary ladder before the deadline.
>
> Replaces compression entirely (Brian, 2026-08-25). Such an event still
> chases — it is not downgraded to a single announcement — but it is WhatsApp
> only and it never escalates.

## src/lib/services/messaging-schedule/plan.ts — buildLadder header

> The ladder, in its fixed order, counting **forward** from the invitation.
>
> `REQ-count-forward`, and Brian's words on 2026-08-25: "Count forward from the
> invitations." Anchoring backwards from the deadline was the earlier model and
> it produced the gap W7's preview exposed — a game invited twenty-one days out
> finishing its ladder eleven days before the deadline it was chasing.
>
> `available` is how many cadence steps fit between the invitation and the
> deadline. Rungs beyond it are not scheduled, because a reminder that lands
> after the answer was due is chasing nothing.
>
> Exported for one reason: LAN-171's schedule page previews the dates a policy
> _would_ produce for a worked example, without an event to resolve one
> against. Replaying this same function against a frozen plan's stored
> `invitationAt` and counts is also how the event page renders an **approved**
> event's committed ladder, since `event_messaging_plans` stores the counts and
> the anchor but not each rung's own instant. Both callers get the one
> arithmetic rather than a second copy of it.
>
> `whatsappReminders` and `emailReminders` are rungs **after** the invitation
> — the invitation is rung 0, built unconditionally below. Neither caller
> passes `schedule.whatsappReminderCount` unchanged: `resolveMessagingPlanIn`
> passes `schedule.whatsappReminderCount - 1`, because that column counts the
> invitation as WhatsApp #1 (Q-19); the event page passes a frozen plan's own
> `whatsappRemindersScheduled`, which was computed the same way at approval
> and already excludes it.

## src/lib/services/messaging-schedule/plan.ts — resolveMessagingPlanIn header

> The whole plan for one event, resolved against a specific moment.
>
> `asOf` is the approval instant on the write path and `now()` on the preview
> path, so the approver reads the same plan the transaction is about to freeze.
>
> ## Why every instant is computed by PostgreSQL
>
> `events.scheduled_on` is a bare `date` and `starts_at` a bare `time`; neither
> carries a zone. "Two days before this event's start" is therefore a
> wall-clock rule, and Britain changes offset twice inside a season. PostgreSQL
> carries the IANA database and `((date - n) + time) at time zone 'Europe/London'`
> is correct across both transitions. The equivalent in JavaScript is a
> hand-rolled offset search that is one edge case away from putting a deadline
> an hour out every October.
>
> The subtraction happens on the **date**, before the zone is applied, which is
> what makes "two days before, at the same local time" true rather than "48
> hours before". Those differ by an hour twice a year, and the club means the
> former.

## src/lib/services/messaging-schedule/plan.ts — WhatsApp-only email drop

> WhatsApp only. Brian, 2026-08-25: "Late events should be WhatsApp only."
> On a short runway the club uses the channel everybody has and does not add
> a second one — so the email rung is dropped even where a spare cadence step
> would have carried it.

## src/lib/services/messaging-schedule/plan.ts — recruit follow-up boundary

> The same "chasing nothing after the deadline" reasoning the player
> ladder's own `available = floor(runway / cadence)` arithmetic uses, at
> a cap of one rung — including its boundary: `available` counts a rung
> landing exactly on the deadline as fitting (a runway of exactly two
> cadence periods schedules two rungs, the second at the deadline
> itself), so this is `<=`, not `<`. With the shipped defaults
> (`recruit_invitation_lead_days = 5`, `recruit_follow_up_cadence_hours =
72`, the Recruitment row's own `rsvp_by_days = 2`) the follow-up lands
> exactly at the shared deadline — five days minus three days is two —
> and a strict `<` would silently never schedule it under the defaults
> this table ships with.

## src/lib/services/messaging-schedule/plan.ts — late approval definition

> A late approval is one whose runway cannot carry the ladder the club
> configured — not merely one that dispatches immediately. The two differ:
> a practice approved four days out with a five-day lead dispatches
> immediately AND has room for only two of its three rungs, so it is both;
> a game approved on its lead day exactly is neither.

## src/lib/services/person-validation.ts — validateDateOfBirth doc

> The one date-of-birth rule — LAN-245 and LAN-258, fixed from one place.
>
> Two surfaces refused a future date of birth two different ways, and neither
> of them named the field. The player questionnaire's own step 1
> (`/me/[token]/details`) let the value through to `updatePersonField`, where
> `people_date_of_birth_in_the_past` refused it and the resulting error
> escaped the server action — the player got the generic error boundary and a
> 500, with no idea which of fourteen fields was wrong (LAN-245, walker M7
> finding M7-03). The operator's own edit form
> (`/operate/people/[personId]/edit`) reached the identical constraint and
> showed "The database refused this change because it breaks one of the
> club's recorded rules" — true, but it never said _which_ rule or _which_
> field (LAN-258, walker M5 finding M5-03).
>
> `DEC-w2-09`'s "validated before the save is offered, per field, naming the
> rule" is what both surfaces were missing, and it is what every other
> function in this module already provides. So this is that function, in the
> same shape, sitting beside its siblings rather than being written twice:
> the player form calls it through `saveDetailsStep`, the operator form calls
> it before its first write, and `updatePersonField` calls it as the service
> layer's own backstop so no third caller can reach the constraint raw.
>
> ## Why it duplicates the database's check rather than replacing it
>
> `people_date_of_birth_in_the_past` stays exactly as it is. A check
> constraint is the club's last line and must never be the _first_ one an
> operator or a player meets: the constraint's job is to make the bad state
> unrepresentable, and this function's job is to explain, in the club's own
> words and against the right field, why a value will not be accepted. The
> two agree by construction — "strictly before today" is the constraint's own
> text — and `today` is injectable only so a test can pin it.
>
> ## The lower bound
>
> The database has no lower bound on a date of birth, and this does not
> invent one as a club rule. It refuses a year outside the same 1900–2200
> window `validateAcademicYear` already applies, for the same reason that
> window exists: a segmented picker and a typed date both produce "0002" as
> readily as "2002", and a year that cannot be a living person's is a typo,
> named as one, not a fact the club is recording.

## src/lib/services/person-validation.ts — Oxford college address module note

> The Oxford college address — LAN-268, Brian 2026-09-09.
>
> > "I had a weird online guy trying to join one year and he wasn't a student.
> > At the end of the day, every student at freshers fair or MBA will have this
> > very basic item."
>
> The college email is the club's own proof that a recruit or a player is
> actually at the university, so the forms ask the tough question: an address
> is a college address only when its domain is `ox.ac.uk` or a subdomain of
> it. Every Oxford college and department address ends that way —
> `@ox.ac.uk`, `@balliol.ox.ac.uk`, `@sbs.ox.ac.uk`,
> `@dept.college.ox.ac.uk`. Nothing else is accepted: not `gmail.com`, not
> another university, and not the look-alikes that matter most.
> `oxford.ac.uk` is a different domain, `notox.ac.uk` merely ends in the same
> letters, and `ox.ac.uk.evil.com` is somebody else's domain wearing the name.
>
> ## One rule, one message, one function
>
> LAN-268's own instruction. Four surfaces ask this question — the sign-up
> door, add-by-hand, the player questionnaire's step 1, and the operator's
> edit form — and a second copy of a rule whose whole job is to keep the wrong
> person out is a copy that drifts. Everything below is pure and carries no
> `server-only`, exactly like its siblings, so a form's own check and the
> write path that finally commits the value give the same answer.
>
> ## Shape first, domain second
>
> `validateEmailAddress` already owns "does this look like an email at all",
> and this defers to it rather than re-deriving it: a value that is not an
> email is refused as one, naming the shape rule, and only something that got
> that far is asked which domain it is in. So a player who typed their name
> into the box is told they have not typed an address, not that their address
> is not Oxford's.
>
> ## Required-ness is somewhere else
>
> This says whether a supplied value is a college address. Whether a college
> address is _required_ of a particular person is `person-required.ts`'s tier
> table, and whether a blank field blocks a particular form is that form's own
> required-ness check. The three are kept apart on purpose, exactly as they
> already are for every other fact: a coach who supplies no college email is
> not chased for one, but a coach who supplies `x@gmail.com` is still refused,
> because a value stored as a college address has to be one.

## src/lib/services/roster/write.ts — enterReturningPlayer, contact-linking inline comment

> LAN-257, and the same rule as the alias above for the same reason.
>
> "Use selected person" used to append every typed value to the chosen
> person's `contact_points`. A number typed from memory that differed from
> the one on file went in as a second, non-preferred row — which no screen
> in the product lists, so the operator saw their number accepted, saw the
> person's real number on the confirmation, and had no way to tell that a
> third value now existed. Meanwhile `/operate/people/new`'s "This is
> them" wrote nothing at all. Two link flows, two behaviours, neither
> stated.
>
> Both now discard. Linking says "this human is that human"; it is not an
> edit of that human's record, and an intake form is not where somebody's
> known-good number gets superseded or quietly doubled. What was discarded
> is returned so the confirmation says so — `contactsNotRecorded`. The
> person record's own edit surface (`W2`) is where a contact changes.

## src/lib/services/roster/write.ts — insertContactPoint

> ## Why `is_preferred` is still conditional
>
> This used to be reached for an **existing** person too, and recorded the new
> value as _not_ preferred rather than demoting the old one. That was the
> conservative direction on the demotion, but it was still a write onto
> somebody's record from a form that never said it would edit one — and
> because no screen in the product lists a non-preferred contact point, the
> row it left was invisible. LAN-257 stopped that at the call site: only a
> person this submission minted reaches here, and a typed value that would
> have become that second row is discarded and named on the confirmation
> instead.
>
> The condition stays because the invariant it respects is real and this
> function must not be the place that breaks it if it is ever called again on
> a person who already holds one.
