# M-OPERATOR-ADMIN-WITHOUT-SQL — decision history relocated from source

Paragraphs that explained a decision inside a source comment, moved here by LAN-300 so the
source reads as code. Each keeps a one-line pointer at its old location. Nothing here changes
a decision; it records where one was explained.

## src/app/operate/admin/roles/[roleId]/page.tsx — `RoleRecordPage` (file header)

> `REQ-admin-surfaces` names the three things this page presents, and it
> presents exactly those three: "current holder, a plain-language Permissions
> summary and holder history".
>
> ## The current holder, including when there is not one
>
> `DEC-account-state-separation` puts three different situations on this page
> and each has to read as itself:
>
> - a holder whose operator access is **deactivated** is still the holder,
>   and the page says so rather than showing a vacancy;
> - a successor who is still **Invitation pending** holds the seat "without
>   capabilities until activation", which is the state chip beside their name;
> - **Not assigned** appears only where a role was ended, because only End
>   role creates a vacancy.
>
> ## Permissions
>
> `describeRoleCapabilities()` is the projection of the arrays server
> enforcement reads — `REQ-capability-copy-consistency`, so "a later approved
> grant change updates authorization and plain-language UI copy together". No
> sentence on this page is written by hand, and half the catalogue's seats
> legitimately hold nothing, which is a sentence rather than an empty list.
>
> ## The seat itself is not editable
>
> `DEC-no-runtime-role-editing`. What the actions below change is who holds it.

Ids named: REQ-admin-surfaces, DEC-account-state-separation, REQ-capability-copy-consistency, DEC-no-runtime-role-editing.

## src/app/operate/admin/roles/[roleId]/page.tsx — Current holder panel, scheduled-holders block (now `current-holder-panel.tsx`)

> The half the index already showed and this page denied. Brian, on
> finding a seat that read "Not assigned + Alwyn Cholmondley from
> 1 Sept 2026" on the index and "Nobody holds this role" here: "That
> doesn't make sense."
>
> It sits inside the Current holder panel rather than in one of its own,
> because it is part of the answer to "who holds this seat" - the part
> about the near future. It is drawn whether or not the seat is filled:
> a successor lined up behind a departing holder is exactly as much a
> surprise, later, as one lined up behind a vacancy.

Ids named: REQ-admin-surfaces.

## src/app/operate/admin/roles/[roleId]/page.tsx — Permissions section, `limits` line

> The negative half — LAN-141 finding 10, and the reviewed prototype's
> own second paragraph. Without it the General Manager and the President
> produced word-for-word identical panels, in the mission whose subtlest
> locked decision is that one outranks the other. Every phrase is
> projected from `PROTECTED_LEADERSHIP_AUTHORITY`, the same table the
> guards read, so it cannot say one thing here and refuse another.

Ids named: REQ-capability-copy-consistency, LAN-141.

## src/lib/services/operator-administration.ts — module header (top of file)

> Administration of roles and of operator access — LAN-132, mission
> M-OPERATOR-ADMIN-WITHOUT-SQL, work package `WP-assignment`.
>
> Five administrator actions, one read for role detail, and one hook the
> password screen calls:
>
> - {@link assignRole} — give somebody an ordinary seat
>   (`REQ-effective-dated-role-history`);
> - {@link endRoleAssignment} — end one, with a reason, today or on a date
>   still to come;
> - {@link replaceRoleHolder} — end the outgoing holder's assignment and
>   create the successor's, in one transaction and without rewriting either;
> - {@link deactivateOperatorAccess} / {@link restoreOperatorAccess} —
>   `REQ-deactivate-and-reinstate`;
> - {@link startOperatorEmailRehome} and {@link verifyOperatorEmailRehome} —
>   `REQ-rehome-email`;
> - {@link readRoleHolders} — who holds a seat in one operating year, and in
>   what state their access is.
>
> ## The four rules every write here obeys
>
> These are not stylistic. Each has already been a finding on an earlier
> package in this mission, and each is checked by a test that fails if the line
> enforcing it is deleted.
>
> That last sentence was **false when it was written**, and LAN-141 finding 1
> is the record of it: rule 4 held at all eight sites in this module, but only
> three of them were bound by a test, so flipping the option at the other five
> changed nothing any suite could see. It is true now, two ways. Every action
> below has a case in `operator-administration.test.ts` § "the guard, on every
> write" that stages a protected target whose only seat is scheduled and fails
> if that site loses the widening; and one test reads this module's own source
> and fails if any call to `readAdministrationSubject` here omits it, so a
> ninth site cannot be added without one. A claim like this is worth only what
> the test behind it is worth, which is why the mechanism is named rather than
> asserted.
>
> 1. **Every write asks the target-aware question.**
>    `assertAdministrationTarget` and never `assertCapability("role_management")`
>    alone — the capability floor admits the President, and the President may
>    not act on the General Manager. The floor is used for exactly one thing
>    here, {@link readRoleHolders}, and the note there says why.
>
> 2. **The role code handed to the guard is the catalogue's own.**
>    `WP-authorization` refuses an unrecognised code outright and normalises
>    nothing — `" general_manager "` is refused rather than trimmed — which is
>    only safe if the caller resolves the code against `public.roles` first.
>    Every guard call below is given `roles.code` read from the row the write
>    will name, never a string a form supplied and never a string this module
>    tidied up.
>
> 3. **The target's seats are read inside the transaction that writes.** A
>    snapshot taken before the transaction is stale by construction, and a
>    stale snapshot is the one way to disarm the leadership rules.
>
>    {@link startOperatorEmailRehome} is the one write that cannot be a
>    single transaction — it has to move the address on the Auth server
>    between deciding and writing, and holding a database transaction open
>    across an unbounded network call is the thing this repository's
>    transaction helper exists to prevent. It therefore asserts **twice**:
>    once to refuse before anything is touched, and again inside the
>    transaction that writes, against a freshly locked row. The second
>    assertion is the one that is load-bearing; the first only saves a
>    pointless Auth call.
>
> 4. **A scheduled seat reaches the guard.** `readAdministrationSubject` is
>    always called with `includeScheduled: true`, so a seat dated to begin at
>    a handover protects its holder _now_ rather than from the handover date.
>    It can only ever make the guard stricter, and the last blocking finding
>    of the previous package was exactly this option being absent.
>
> ## Two questions about scheduled seats, answered differently
>
> Both reads see seats that have not started yet, and they do different things
> with them, because they are asked different questions:
>
> - the guard asks "does this target need protecting?" — a President-elect
>   whose seat begins at the handover needs protecting **now**, so the seat
>   counts from the moment it is recorded;
> - the path check asks "can somebody still administer the club?" — which has
>   no answer without a date, so it is asked on every date the answer can
>   change. A seat beginning next month is not a path today and is one then,
>   and a seat _ending_ next month is a path today and is not one then. The
>   second half is LAN132-B2: reading only today let two scheduled endings
>   each pass while the other holder was still effective, and empty the club
>   on the day they both lapsed.
>
> ## Nothing here deletes anything
>
> `REQ-deactivate-and-reinstate` is unambiguous: "No action deletes Person,
> membership, binding, attribution or history." Ending a role sets
> `effective_to`; deactivating sets `is_active = false`; re-homing an address
> moves it and records what it was. `service_role` holds no `delete` on
> `operator_accounts` at all, and this module issues no `delete` against any
> table — `operator-administration.test.ts` reads the module's own source and
> fails if one ever appears.
>
> ## What this module does not do
>
> It renders nothing. `WP-surfaces` owns the Administration screens and the
> server actions behind them; every function here takes a `ResolvedOperator`
> and returns data or throws a `ServiceError`, exactly as
> `./operator-invitations.ts` does.
>
> It also creates and closes no operating year. `REQ-explicit-cycle-assignment`
> puts that outside this mission, and the consequence is worth stating rather
> than discovering: **no write here takes a cycle**. Assignments inherit the one
> active context, which is what "forms do not ask for or repeat the year" means
> and what makes a past year read-only — there is no code path by which an
> assignment can be created in one. {@link readRoleHolders} accepts a cycle so
> that a past year can be _looked at_, and reports `readOnly` for anything that
> is not the active one.

Ids named: LAN-132, REQ-effective-dated-role-history, REQ-deactivate-and-reinstate, REQ-rehome-email, LAN-141, WP-authorization, REQ-explicit-cycle-assignment.

## src/lib/services/operator-administration.ts — `requireRole` (now `.../operator-administration/shared.ts`)

> Not trimmed, not lowercased, not aliased. `" kit_manager "` is refused rather
> than tidied up, for the reason `./operator-invitations.ts` and
> `WP-authorization` both give: a role code comes from a fixed list of twenty
> chosen from a control, whitespace around one means the request was built
> wrongly, and guessing what a caller meant about the most dangerous seat in the
> club is not a leniency worth having. Two layers refusing identically is one
> fewer thing to reason about than two layers disagreeing harmlessly.

Ids named: WP-authorization.

## src/lib/services/operator-administration.ts — `lockAssignment` (now `.../operator-administration/shared.ts`)

> It does not close every race — the administration-path count reads rows this
> statement does not lock — and the residual is recorded in the pull request
> rather than implied away.

Ids named: none named directly.

## src/lib/services/operator-administration.ts — `earliestEndFor` (now `.../operator-administration/shared.ts`)

> Exported because the surfaces need the same answer the guard uses. LAN-141
> finding 2: both the end date and the start default to today, so a role
> assigned this morning could not be ended by any route today, while the form
> said "Leave blank to end it today" and the refusal named no usable date at
> all. The date is one rule and this is where it lives.

Ids named: LAN-141.

## src/lib/services/operator-administration.ts — `refuseUnlessRehomable` (now `.../operator-administration/shared.ts`)

> Active, or already pending — a retry. Everything else is refused and told
> where to go instead, because each other state has its own flow:
>
> - Invitation pending and Delivery failed belong to correct-and-resend,
>   which exists, and which refuses an activated account so the two meet
>   exactly;
> - Deactivated has to be restored first, because re-homing an address on an
>   account nobody may sign into achieves nothing and would leave two reasons
>   for the same lock-out.

Ids named: REQ-rehome-email.

## src/lib/services/operator-administration.ts — `AdministrationSeat` / `readAdministrationSeats` (now `.../operator-administration/shared.ts`)

> Seats rather than people, and dates rather than a snapshot, because
> LAN132-B2: an administrator already scheduled to lapse is still effective
> _today_, so a today-only snapshot counts them as the surviving path and
> nothing ever re-evaluates on the date they go. Two ordinary endings by one
> administrator, no race and no second actor, then left the club with nobody
> able to administer it — which is the state `REQ-final-admin-protection`
> exists to prevent.
>
> ---
>
> Three things about it are decisions rather than shape:
>
> - **Seats that have not started are included.** The previous version
>   excluded them, on the reasoning that an administrator whose seat begins
>   next month cannot help the club this afternoon. That is true of _this
>   afternoon_ and it is the wrong shape for the question: the guard now asks
>   what the club looks like on each date, and on the date that seat begins
>   it is a path. Excluding them made a legitimate succession — schedule the
>   outgoing officer's departure, schedule the incoming one's start — refuse
>   for no reason, while the far worse case it was meant to catch went
>   through.
>
> - **Seats that have already lapsed are excluded**, because they are history
>   and no future date brings them back.
>
> - **`usable` is a present-tense fact carried forward unchanged.** Whether
>   somebody's invitation will have been taken up by September is not
>   knowable, and guessing either way would be inventing a fact. Carrying
>   today's answer forward is the conservative direction: a pending
>   invitation counts as unusable at every date, so it can only make the
>   guard stricter, never permissive.

Ids named: LAN132-B2, REQ-final-admin-protection.

## src/lib/services/operator-administration.ts — `assertClubKeepsAnAdministrator` (now `.../operator-administration/shared.ts`)

> `REQ-final-admin-protection`: "No action may eliminate every usable
> administration path."
>
> Applied to the three actions that can remove one — ending a role, replacing a
> holder and deactivating an account — and deliberately not to email recovery.
> Recovery temporarily makes an account unusable, and refusing it when the
> account belongs to the club's last administrator would be a trap: the person
> whose mailbox was lost is exactly the person who most needs it moved, and the
> `AdministrationPathEffect` union does not model it because `WP-authorization`
> decided it should not.
>
> ## It is checked on every date the answer can change, not only today
>
> This is LAN132-B2, and the defect it closes needed no race and no second
> actor. `effectiveOn` is the date the pending action takes hold — today for a
> deactivation, the chosen date for an ending or a handover — and the club's
> paths are recomputed on **every** date at which any administration seat
> starts or stops, because between two such dates the answer cannot change.
> Evaluating only today let one administrator schedule two endings for the same
> future date, each permitted because the other holder was still effective _at
> the moment of asking_, and leave the club with nobody on the day they both
> lapsed — recoverable only by Brian, through a migration or the owner-run
> bootstrap.
>
> ## The effect is applied only from the date it takes hold
>
> A seat ending in September is still held in August, so applying the effect at
> every date would refuse legitimate successions by pretending the departure
> had already happened. Before `effectiveOn` the club is unchanged; from it,
> `remainingAdministrationPaths` projects the change — which is also why
> replacement is still handed to that function whole rather than decomposed
> here (LAN129-A1): it is the one place that knows a successor's `usable` must
> merge as a conjunction.
>
> ## "Eliminate" is still a comparison, now per date
>
> An action cannot eliminate what is already gone, so each date is judged
> against itself: a date that had no usable path before this action is not one
> this action emptied. That keeps a freshly migrated database — role
> assignments from the seed, no `operator_accounts` rows, which is what CI runs
> against — from refusing every ending and every deactivation with a message
> about administration roles that has nothing to do with the action.

Ids named: REQ-final-admin-protection, LAN132-B2, LAN129-A1.

## src/lib/services/operator-invitations.ts — module header (top of file)

> /**
>
> - Operator invitation — LAN-131, mission M-OPERATOR-ADMIN-WITHOUT-SQL,
> - `REQ-invite-existing-person`, `REQ-invitation-states` and
> - `REQ-email-invitation-path`.
> -
> - One guided flow: find the durable Person or create a minimal one, bind at
> - most one operator login to them, give them at least one approved role in the
> - active operating year, and email them a link that lets them set a password.
> - Then the three things that happen afterwards — resend, correct-and-resend,
> - and the activation that ends the invitation.
> -
> - ## Where the authorization is, and which call it makes
> -
> - `assertAdministrationTarget()` from `@/lib/auth/administration-authority`,
> - which is the **target-level** guard, not the capability floor. Calling
> - `assertCapability(operator, "role_management")` alone is the documented
> - mistake: it answers "may this operator administer anybody?" and would let a
> - President invite somebody straight into the General Manager seat. The
> - capability floor is the first thing `assertAdministrationTarget` does, so the
> - target-aware call is strictly stronger and there is never a reason to make
> - the weaker one.
> -
> - ### Why the pure `assert…` and not the request-scoped `require…`
> -
> - `requireAdministrationTarget()` is the same rules with the actor resolved
> - from the verified session inside it — one extra network round trip to the
> - auth server. It cannot be used here, and the reason is a rule of this
> - package rather than a preference:
> -
> - > **the target's currently-effective role codes must be read inside the write
> - > transaction.** The guard reads no database; it judges a snapshot the caller
> - > supplies, and a stale or empty snapshot silently disarms every leadership
> - > rule.
> -
> - So the transaction has to be open before the guard can be given an honest
> - snapshot, and resolving a session — two HTTP calls to Supabase — from inside
> - an open transaction holds a pooled connection across the network for no
> - reason. The actor is therefore resolved by the caller, exactly as
> - `./administration-audit.ts` has every read take a `ResolvedOperator`, and the
> - same `assertAdministrationTarget` `requireAdministrationTarget` would have
> - called is called here with a snapshot read moments earlier in the same
> - transaction. `null` is accepted and refused, so "forgot to resolve" and "no
> - session" fail identically.
> -
> - ### Where the snapshot is read, stated exactly — because it differs
> -
> - An earlier version of this note claimed "every write below asserts twice…
> - once inside the transaction", and independent review found that true of one
> - of the three writes. The accurate account:
> -
> - - **`inviteOperator` asserts twice.** Once in a pre-flight transaction, so
> -     an unauthorized attempt costs nothing and creates no login; and again
> -     inside the transaction that does the writing, against a snapshot read
> -     from the row it is about to insert against. That second assertion is the
> -     control and the first is courtesy.
> -
> - - **`resendOperatorInvitation` and `correctOperatorInvitation` assert
> -     twice too**, and for the same reason `inviteOperator` does. The
> -     pre-flight transaction refuses before the Auth call, so an unauthorized
> -     attempt moves nobody's login; the write transaction locks the row,
> -     re-reads the target's seats and re-asserts the guard, the state rule and
> -     the address rule against the row as it is *then*. The second assertion is
> -     the control and the first is courtesy.
> -
> - An earlier version of this note argued the window between those two
> - transactions "confers nothing" and recorded it as deliberately open. That
> - argument was wrong on the state rule, and LAN-141 finding 3 is the case it
> - missed: the holder can **activate** inside the window. `refuseUnlessResendable`
> - had already passed on a pending account, so the write proceeded, and
> - "correct the invitation" became an address change on a working account —
> - `REQ-rehome-email`'s flow without its `recover_email` authority list, without
> - a recorded reason and without Email change pending. The guard half is real
> - too, for the reason `startOperatorEmailRehome` gives at length (LAN132-B3):
> - seats can be assigned inside an unbounded network window, and a snapshot
> - from before it is not the snapshot the write is judged on.
> -
> - The transaction still does not span the Auth call, and must not: holding a
> - pooled connection open across the network is the thing the paragraph above
> - declines to do for session resolution, for the same reason. Two transactions
> - with the decision made in the second is the shape that satisfies both.
> -
> - ### The role code passed to the guard is the exact `roles.code`
> -
> - A role-scoped decision naming a code the catalogue does not have is refused
> - outright and nothing is normalised — `" general_manager "` is refused, not
> - trimmed. This module resolves the caller's role code against
> - `public.roles.code` **before** the guard and passes the catalogue's own
> - spelling, so a decision is judged on the seat it really concerns.
> -
> - ### A pending invitation's seat is real from the moment it is sent
> -
> - `resend_invitation` and `correct_invitation` are deliberately not
> - role-scoped: they are judged on the seats the target holds. Correction
> - redirects a credential-establishing link to an address the administrator
> - chooses, so an invitation that _conferred_ a protected seat while its target
> - held nothing would be correctable by somebody who may not assign that seat.
> -
> - This module closes that by materialising the role assignment when the
> - invitation is sent, which is what `REQ-deactivate-and-reinstate` describes
> - when it says a successor "may remain Invitation pending without capabilities
> - until activation" — the assignment exists, the account does not. The seat is
> - therefore in the target's snapshot, and the leadership rules protect a
> - pending invitation exactly as they protect a sitting holder.
> -
> - One consequence has to be handled rather than assumed away: an assignment
> - dated to begin later is not _currently_ effective, so a future-dated
> - President invitation would be invisible to the guard. So the snapshot for the
> - two invitation actions includes assignments that have not started yet —
> - {@link readAdministrationSubject} with `includeScheduled` — which is the
> - fail-closed direction: a seat somebody is about to hold protects them now.
> -
> - ## What is written, and what is not
> -
> - Every state change and its audit event commit together, through
> - `recordAdministrationEvent`, in the caller's transaction. There is no second
> - ledger: `REQ-invitation-states` asks that send and delivery attempts be
> - recorded, and `administration.operator.invited`, `…invitation_resent`,
> - `…invitation_corrected` and `…invitation_delivery_failed` already are that
> - record. The columns this package added hold the _current_ status; the ledger
> - holds every attempt that produced it.
> -
> - ## The one thing that is not transactional
> -
> - Supabase Auth. Creating the login, sending the email and moving an address
> - are network calls that cannot be rolled back, so they are ordered so that a
> - failure leaves a state the club can act on:
> -
> - 1.  **create the login** — no email, so a failure here has created nothing;
> - 2.  **write every row** — and if that fails, delete the login just created,
> -      which is the only compensation in this module and applies only to a
> -      login nothing yet points at;
> - 3.  **send the email** — so a delivery failure happens with the Person, the
> -      account and the assignment already committed. That is exactly what
> -      `REQ-invitation-states` requires: "delivery failure preserves the same
> -      Person and operator account and never creates a duplicate."
>
> */

Ids named: LAN-131, REQ-invite-existing-person, REQ-invitation-states, REQ-email-invitation-path, REQ-rehome-email, LAN-141.

## src/lib/services/operator-invitations.ts — `findOperatorCandidates` (now `.../operator-invitations/candidates.ts`)

> Every existing Person who might already be the human being invited.
>
> ## Why this is not `roster.findPersonCandidates`
>
> That function answers a different question and carries a dependency this one
> must not have: it resolves the open season first and refuses outright when
> there is none, because a returner intake without a season to enter them into
> is pointless. An operator invitation is not. `REQ-coach-operator-onboarding`
> is explicit that "coaching onboarding neither requires nor automatically
> creates player membership: an external coach may have none" — and a club
> between seasons must still be able to invite its Secretary.
>
> What it _does_ share is the matching rule, and that is deliberate rather than
> accidental duplication: a given name alone is enough, aliases count, and
> phones compare on their last nine digits. `roster.ts` records the reasoning
> at length and it is not restated here. What replaces the membership column is
> the operator account, because "this person already has a login" is the fact
> that decides whether this flow can proceed at all.
>
> People merged away under invariant I6 are excluded, for the reason
> `roster.ts` gives: offering one invites an administrator to resurrect a
> record the club has already decided is a duplicate.

Ids named: REQ-coach-operator-onboarding.

## src/lib/services/operator-invitations.ts — `readAdministrationSubject` (now `.../operator-invitations/subject.ts`)

> The target's role codes, read from the database inside the caller's
> transaction. **This is the input the leadership rules stand on.**
>
> `includeScheduled` widens "currently effective" to "not yet ended", and every
> caller that hands the result to a guard passes it. A pending invitation may
> carry a seat dated to begin at a handover; that seat is not in force today,
> and a guard that could not see it would let somebody who may not assign the
> President seat redirect the link that confers it. Including it is the
> fail-closed direction — it can only ever make the guard stricter.
>
> **No production caller asks for the narrow answer.** It stays an option so
> that a test can read the snapshot both ways and show what the widening is
> doing — but a guard judging the narrow answer is a defect, and LAN-141
> finding 1 is what it cost when six of the ten sites were left to the default.
> `operator-administration.test.ts` and `operator-invitations.test.ts` each read
> their own module's source and fail if a call to this function reaches a guard
> without it, so a tenth site added later cannot repeat the omission quietly.

Ids named: LAN-141.

## src/lib/services/operator-invitations.ts — `resolveCommitteeYearForActivation` (now `.../operator-invitations/cycles.ts`)

> The active committee year, and — unlike every other caller — the most recent
> one when there is no active one. That is the one place this module is lenient
> about the year, and the reason is worth stating rather than discovering:
>
> Activation is not an administrator's act. It is the moment an invited person
> chooses their password, in `src/app/reset-password/actions.ts`, and by then
> their password has already been changed. Refusing to record it would fail
> that action _after_ the credentials existed — so somebody who had been
> invited perfectly legitimately would see an error, and the club's record of
> their account would say the invitation was still pending.
>
> The state that produces it is real and not exotic: `committee_years.ends_on`
> is a date, and a club that has closed one year before recording the next has
> a gap. Anyone invited before the gap would be unable to complete their
> invitation during it.
>
> Nothing is invented by the fallback. Every other operation here still
> requires an _active_ year, because every other operation creates or moves an
> assignment that has to hang off a real cycle; this one records that something
> happened, and dating it to the club's most recent committee year is the
> truthful answer available. With no committee year at all it still refuses —
> but then nobody could have been invited either, since `inviteOperator`
> requires an active one.

Ids named: none named directly.

## src/lib/services/operator-invitations.ts — `resolveCommitteeYearForReading` (now `.../operator-invitations/cycles.ts`)

> The committee year a _reading_ surface means by "this year", or `null`.
>
> The two resolvers above fail closed because they are asked before a **write**:
> an assignment with no cycle to hang off cannot be recorded, and refusing is
> the only truthful answer. A reading screen must not inherit that refusal, and
> LAN-141 finding 8 is what that costs when it does — `resolveActiveCommitteeYear()`
> throwing took the whole of Administration down and told the reader the current
> committee year "has to be recorded first", from a page with no route in the
> application to record one. Half-open currency (`ends_on` exclusive) gives a
> one-day hole at every handover, so this is an ordinary Monday rather than an
> exotic state.
>
> The season was wrapped for exactly this reason when `WP-surfaces` was built.
> The committee year was not, and this is the missing half.

Ids named: LAN-141.

## src/lib/services/operator-invitations.ts — `resolveSeasonForReading` (now `.../operator-invitations/cycles.ts`)

> The season a reading surface means by "this season", or `null`.
>
> `resolveActiveSeason()` accepts `open` and `active` only, which is right for
> the write it guards. `closing` is an ordinary `season_status` and it is
> reached by every season the club ever runs — so under it, every coaching
> assignment (written open-ended) was still in force while the Roles index said
> "No season under way" and role detail named the live holder. LAN-141 finding
> 4, found independently by three of the four hunters.
>
> So reading widens by exactly one status and says so on the way out: a
> `closing` season is current, and it is not writable. Nothing here relaxes the
> write guard, and a coaching assignment against a closing season is still
> refused by `resolveActiveSeason()` where it always was.
>
> `open`/`active` is preferred over `closing` when both exist, which is the
> ordinary shape of a handover between two seasons.

Ids named: LAN-141.

## src/lib/services/administration-events.ts — module header

> The canonical administration event vocabulary — LAN-130, mission
> M-OPERATOR-ADMIN-WITHOUT-SQL, `REQ-append-only-audit-evidence`.
>
> Pure. No database, no `server-only`, no framework. It is the closed set of
> things operator administration can record, the envelope those records carry,
> and the rules that decide whether a proposed record is one of them. The
> writing and the reading live in `./administration-audit.ts`; this module is
> what both of them — and any screen that renders an entry — agree on.
>
> ## The one property everything here exists to protect
>
> **One event, two projections, no duplicate records.** Operator audit history
> and Holder history are two _readings_ of a single `public.audit_events`
> stream, not two streams. A role assignment appears in both because it names
> both a target Person and a role — not because it was written twice. Writing
> the same fact twice so that two screens can each read it easily is precisely
> the reconciliation problem register D9 refuses, and it is the failure this
> vocabulary is shaped to make impossible: there is one writer, it writes one
> row, and the projections differ only in which key they filter on.
>
> That is why the envelope below carries `targetPersonId` _and_ `roleId` on the
> same record rather than splitting them across two record types. The row is
> indexed for both readings from the start.
>
> ## Why the envelope lives in `context`
>
> `public.audit_events` predates this mission
> (`20260810121000_domain_reporting.sql`). It already carries actor, action, a
> deliberately polymorphic entity pointer, before/after state, reason,
> timestamp and a `jsonb` `context` constrained to an object. Four of the
> fields `REQ-append-only-audit-evidence` names have no column of their own —
> authority at the time, the target Person when it is not the entity, the
> affected role, and the operating year — and `context` is the column that
> exists for exactly that. Nothing here changes the schema, and this package
> deliberately owns no migration.
>
> The envelope is versioned (`ADMINISTRATION_ENVELOPE_VERSION`) so that a later
> shape change is detectable in stored rows rather than silently ambiguous.
>
> ## What is deliberately absent
>
> - **No view action.** Ordinary page views are excluded by the requirement,
>   and the enforcement is that the vocabulary contains no term for one. An
>   unknown action is refused by `prepareAdministrationEvent`, so "audit the
>   page view" cannot be done by passing a string.
>
> - **No update and no delete.** Append-only is not a convention here. There
>   is no term for amending or retracting an event, `service_role` holds only
>   `select, insert` on the table, and a correction is a new event.
>
> - **No general audit browser.** The Stage-4 cross-system search, filter,
>   export and investigation surface stays out of scope. The two projections
>   are keyed reads of one target or one role; neither takes a free-text
>   query, a date range or an entity type.

Ids named: LAN-130, REQ-append-only-audit-evidence.

## src/lib/services/administration-events.ts — `ADMINISTRATION_EVENTS` (the two modelling choices)

> Two modelling choices worth naming, because a reviewer should be able to
> disagree with them explicitly rather than discover them:
>
> - **Creating the Person is not a separate event.** `REQ-invite-existing-person`
>   makes duplicate-checked create-or-link part of one guided invitation. One
>   administrator action, one event; whether the Person was created or linked
>   is `detail`, not a second row. A second row would be the first duplicate.
>
> - **Replacing a role holder is two events, not three.** `REQ-effective-dated-role-history`
>   says replacement ends the outgoing assignment and creates the successor
>   "without rewriting history" — two assignment rows change, so two events
>   are written, one `role.ended` and one `role.assigned`, sharing a
>   `correlationId`. There is deliberately no `role.replaced` action: it would
>   record for a third time facts the other two already carry, which is the
>   duplication this package exists to prevent. Holder history renders a
>   correlated pair as a replacement.

Ids named: REQ-invite-existing-person, REQ-effective-dated-role-history.

## src/lib/services/administration-events.ts — `AdministrationEventDefinition.instantOrder`

> `audit_events.occurred_at` defaults to `now()`, which is **transaction**
> time, not statement time. Two events written in one transaction therefore
> carry an identical timestamp, and a projection ordered on that column alone
> falls through to an arbitrary tie-break — which is not a cosmetic problem
> for a replacement: it renders the successor's assignment and the outgoing
> holder's ending in a random order, half of them implying that the successor
> was appointed before the seat was vacated.
>
> Two pairs are written in one transaction, and both are covered by one rule:
> **an assignment begins only after the account it hangs off exists, and only
> after any outgoing assignment has ended.** So a role assignment beginning
> sorts last within an instant, and everything else shares position 0 —
> `role.ended` before `role.assigned` in a replacement, and
> `operator.invited` before `role.assigned` in an invitation that carries an
> initial role.
>
> A later package that writes two events in one transaction whose order
> matters, and which this rule does not already separate, declares its
> position here. Events that genuinely happen at once — two holders assigned
> to one non-Office seat — share a position and fall back to a stable but
> arbitrary tie-break, which is the honest answer for facts with no order
> between them.

Ids named: none named directly.

## src/lib/services/administration-events.ts — `email_rehome_retried`

> A second or later verification link, on an account already held in Email
> change pending — LAN-132, `REQ-rehome-email`: "Failure is correctable and
> retryable on the same account."
>
> It exists because a retry genuinely is not a transition. The account was
> pending before it and is pending after it, and
> `prepareAdministrationEvent` refuses a transition whose before and after
> are the same — correctly, because a row saying the state changed from
> `email_change_pending` to `email_change_pending` is a record of nothing.
> What _did_ change is the address the link went to, which is on the detail,
> exactly as `invitation_corrected` carries it.
>
> `attempt`, therefore, and for the same reason `invitation_resent` and
> `invitation_corrected` are: a thing that was tried, against an account
> whose state it did not move.
>
> `instantOrder` is 0. It shares its instant with nothing — one retry is one
> event in one transaction — and 0 is the position everything that is not an
> assignment beginning already holds.

Ids named: LAN-132, REQ-rehome-email.

## src/app/operate/shell-nav.tsx — administration prop

> LAN-133. The Administration entries, or empty for an operator who holds no
> administration authority. They render as a separated group at the bottom of
> the sidebar, immediately above the signed-in account, which is what
> `DEC-administration-navigation` decides and what the reviewed prototype
> draws. Empty is the ordinary case and renders nothing at all — not an empty
> heading.

## src/app/operate/admin/presentation.ts — OPERATOR_SECTION_LABELS

> `DEC-administration-navigation`: "Operators are separated into Standing
> Officers, Club Officers and Coaches."
>
> Three sections for three catalogue groups, and the mapping is by group code
> because the _sections_ are Administration's words for the groups rather than
> the groups' own names. The Roles page shows "Operational Administration",
> "Club Committee" and "Coaching Staff" — the catalogue's labels, read from
> `public.role_groups` — and the Operators page shows the three names above for
> the same three groups, because it is naming people rather than seats. Both
> lists are locked by the same decision and neither may be derived from the
> other.
>
> A group code the catalogue grows and this map has not heard of falls back to
> the group's own label, which is honest rather than wrong: a new group would
> appear on the Operators page under its catalogue name until somebody chooses
> a club word for it. It never silently merges into another section.

## src/app/operate/admin/presentation.ts — UNASSIGNED_SECTION_LABEL

> The section an operator holding no seat at all falls in.
>
> `REQ-admin-surfaces` names three sections and every operator in the reviewed
> prototype holds a seat, so this case is not drawn there. It is nevertheless
> reachable and must be: `REQ-deactivate-and-reinstate` keeps the account when a
> seat ends ("No action deletes Person, membership, binding, attribution or
> history"), so an operator whose only role has been ended is an account that
> can still be restored, deactivated or given a new seat — and one that is
> absent from the only page listing accounts cannot be any of those things.
>
> It is deliberately last, deliberately named in the same plain register as the
> three above, and deliberately not a fourth _grouping_ rule: it is the
> remainder, and it is empty on a club whose records are tidy.

## src/app/operate/admin/presentation.ts — operatorSections

> Operators, split into the approved sections, in catalogue order.
>
> ## Somebody appears under every part of the club they serve
>
> An operator holding seats in more than one group appears in **each** of those
> sections, once per section — LAN-141 finding 9. The first version placed each
> account once, under the earliest group it sat in, and the consequence was
> that a coach who also held a committee seat was absent from **Coaches**
> entirely. `DEC-one-person-multiple-capacities` makes that combination
> ordinary rather than exotic ("a returning player who becomes a coach or an
> officer keeps the same record"), and `REQ-coach-operator-onboarding` requires
> Administration to "visually separate Coaching Staff" — a Coaches section that
> silently omits some of the club's coaches does not separate them, it hides
> them.
>
> The objection the first version recorded was that listing an account twice
> makes the page's own count wrong. It does not: the heading counts operator
> _accounts_, which the directory supplies, and no section carries a count. The
> second objection — two different-looking routes to one record — was never
> true either; both rows link to the same page, and each row still names every
> seat the person holds, so a reader meeting them under Coaches can see at once
> that they are also on the committee.
>
> The order of the sections is the catalogue's `sort_order`, carried on every
> seat, so the page never restates "Operational Administration first". Sections
> with nobody in them are omitted rather than shown empty: the prototype shows
> three populated sections, and an empty "Coaches" heading on a club that has
> not invited its coaches yet reads as a fault.

## src/app/operate/admin/presentation.ts — describeSeats

> The seats an operator holds, as one line: "President · Wide Receivers Coach".
>
> "No current role" rather than an empty cell, for the reason every label map in
> this repository keeps a fallback: a blank reads as an omission.
>
> A seat that has not begun is named **and dated**, under the same rule the
> roles index follows: the current answer is never replaced, and a date the
> club already knows is never withheld. The reader of this column was
> previously told "Offensive Coordinator" flatly about somebody who does not
> hold it until September — the third surface to answer "who holds this seat"
> differently from the other two, and the one Brian had not yet reached.

## src/app/operate/admin/presentation.ts — describeSeat

> One seat, with whichever of its two dates the club already knows.
>
> **A seat that is due to end says so** — LAN-141 finding 11. This column's own
> note claimed to follow the roles index's rule and followed half of it: a
> scheduled start was shown, a scheduled end was not, on the page an
> administrator scans to see who is leaving. Brian's ruling was both directions
> at once — "I like showing the successors and also showing people when they
> go" — and one of them had quietly not shipped.

## src/app/operate/admin/presentation.ts — accountStateColour

> The colour each account state wears.
>
> `REQ-invitation-states` requires the five states to be told apart by "distinct
> text and visual treatment" — the text is the state definition's own `label`,
> and this is the other half. Three colours for five states is deliberate and
> is the reason a chip never travels without its words: the two states that
> share `warning` are both "sent, not taken up", and the two that share
> `default` are both "cannot sign in", which is exactly the distinction colour
> is good at and exactly the one it must not be relied on for.

## src/app/operate/admin/presentation.ts — describeInvitationProgress

> What the Operators list says in its invitation column.
>
> Four sentences for four situations, and the failed one **carries the
> transport's reason** — LAN131-A5. The reason is the only place the
> administrator is told that an invitation which was opened and abandoned is
> recovered through Forgot password rather than through another invitation, and
> before this package it was written to `invitation_delivery_failure_reason` and
> rendered nowhere. A state badge saying "Delivery failed" with no reason beside
> it is the defect that finding names.

## src/app/operate/admin/presentation.ts — describeHolders

> Who holds one seat, as the Roles index says it.
>
> Four states, and Brian fixed all four on 20 August 2026 after seeing the
> first two: "Don't do the strict version. I like showing the successors and
> also showing people when they go."
>
> | Situation                    | Reads                             |
> | ---------------------------- | --------------------------------- |
> | Filled, no end date          | the holder alone                  |
> | Filled, with an end recorded | the holder, and when it ends      |
> | Vacant, successor recorded   | Not assigned, and who starts when |
> | Vacant, nobody recorded      | Not assigned alone                |
>
> **The current answer is always first, and is never replaced.** A seat nobody
> holds today reads `Not assigned` even when a successor starts next week, and
> a seat held today names its holder even though the assignment ends on Friday.
> `REQ-admin-surfaces` asks the top level for current holders and that is what
> the head of every cell is; the scheduled half is context after it, never
> instead of it.
>
> The reason it is there at all is the one Brian gave for wanting both
> directions: he does not want to find out that a seat is uncovered on the day
> it empties, and he does not want to find out that somebody has left after
> they have gone. Both are the same complaint about being surprised by a date
> the club already knew.
>
> Three further facts survive from before and are unchanged:
>
> - **Not assigned** is a real state and the _only_ thing that produces it is
>   a seat nobody holds today (`DEC-account-state-separation`: "only End role
>   creates a Not assigned vacancy"). It is never what a deactivated account
>   looks like.
> - A holder whose operator access is deactivated is still the holder, and
>   says so: `REQ-deactivate-and-reinstate` requires role detail to show "that
>   the current holder's operator access is deactivated" instead of a vacancy,
>   and the index would be lying if it disagreed with the page behind it.
> - A seat whose operating year does not exist yet is not vacant — nobody has
>   ended anything. Coaching seats hang off the season, and a club between
>   seasons has none.

## src/app/operate/admin/presentation.ts — permissionsSummary

> The plain-language Permissions summary for one seat, and whether it is empty.
>
> `describeRoleCapabilities()` is the projection `REQ-capability-copy-consistency`
> requires — "derived from the same reviewed capability definition used by
> server enforcement, so a later approved grant change updates authorization and
> plain-language UI copy together". Nothing here writes a capability sentence,
> and nothing here may: the phrases are the map's own `action` strings, which
> are already the words a refusal quotes.
>
> `empty` exists because the two cases read differently. Ten of the twenty seats
> hold nothing, and their summary is one complete sentence saying so; the others
> are a list of verb phrases that needs a subject in front of it.

## src/app/operate/admin/presentation.ts — limitsLine

> What one seat may **not** do, as one sentence, or `null`.
>
> The other half of the Permissions panel — LAN-141 finding 10, and the
> prototype's own second paragraph. General Manager and President hold the same
> nine grants and produced word-for-word identical summaries, in the mission
> whose subtlest locked decision is that one of them outranks the other; what
> separates them is which protected seats they may act on, and that is already
> data. `describeLeadershipLimits()` reads it.
>
> `null` for the seventeen seats that do not administer at all. Telling a Kit
> Manager which seats they may not manage would imply they may manage the rest.

## src/app/operate/admin/presentation.ts — INDEX_PERMISSION_PHRASES

> How many phrases the Roles **index** shows before it stops.
>
> The catalogue's strongest seats hold nine capabilities, and nine verb phrases
> in a table cell is a paragraph: it dwarfs the seat's own name and the holder
> beside it, which are what a reader scanning twenty rows is looking for. The
> reviewed prototype's third column is one short line per seat, and this is the
> nearest honest equivalent — a shortened summary that says it is shortened,
> with the complete one on the seat's own page.
>
> Three is a presentation choice and nothing is written or reworded to fit it:
> every phrase shown is the capability map's own, in the map's own order, and
> the remainder is counted rather than elided silently.

## src/app/operate/admin/presentation.ts — toInstant

> The moment to render, and the zone to render it in.
>
> Administration receives dates in three shapes and they are **not**
> interchangeable, which the agent's browser preflight proved the hard way: an
> audit entry's `occurredAt` is a full ISO instant, and reading a string as a
> calendar date built `new Date("2026-08-20T00:39:14.123Z" + "T00:00:00Z")`,
> which is an invalid date, which threw out of `Intl.DateTimeFormat` and took
> the whole server-rendered page down with it.
>
> - `YYYY-MM-DD` — a stored calendar date. It has no time and no zone, and is
>   read and rendered as UTC so that "2026-08-18" is 18 August everywhere.
>   The same rule `events/presentation.ts` follows for `scheduled_on`.
> - any other string — an ISO instant, rendered on club time.
> - a `Date` — an instant already, likewise.
>
> `null` for anything that does not parse, which the two formatters render as
> {@link UNREADABLE_DATE}. A history surface that throws is worse than one that
> says a value could not be read — one bad row must not take the other twenty
> with it. Showing the raw value instead was the first answer and was wrong in
> both directions (LAN-141): `"2026-13-45"` reached the screen unchanged, and an
> invalid `Date` reached it as the string `"Invalid Date"`, on pages where every
> other date reads `27 Aug 2026`.

## src/app/operate/admin/presentation.ts — describePeriod

> How one assignment's period reads: "From 18 Aug 2026", "18 Aug 2026 – 1 Jun
> 2027", or "Starts 1 Sep 2026" for a seat that has not begun.
>
> `REQ-effective-dated-role-history` asks for "no routine end date", so an open
> period is the ordinary case and reads as one rather than as "18 Aug 2026 –
> null".

## src/app/operate/admin/roles/[roleId]/role-actions.tsx — module header

> Changing who holds one seat — LAN-133.
>
> Three actions, named by `DEC-administration-language-and-states`: **Replace
> role**, **End role**, and the assignment into a vacancy. They are three
> because `DEC-account-state-separation` makes them three different facts —
> "Replace role ends the outgoing assignment and creates the successor … only
> End role creates a Not assigned vacancy" — and a single "change holder" form
> with an optional successor would have collapsed that distinction into a
> checkbox.
>
> Nothing here edits the role or what it can do. `DEC-no-runtime-role-editing`
> puts the catalogue and the capability map beyond the application, and this
> component has no field that could reach either.
>
> ## Choosing a person is a search, not a list
>
> `findOperatorCandidates` matches **exactly** — a whole given name, a whole
> family name, a whole address, the last nine digits of a phone. That is its
> rule and not this screen's, and the reason it is not a dropdown of everybody:
> a picker listing the club's members would disclose the roster to anybody who
> opened a role, and a loose search would do the same one letter at a time.
>
> So the administrator types who they mean, and gets the people who are
> certainly that person. An empty result is a real answer — the successor has
> to exist as a Person before they can be given a seat, and the invitation flow
> is where a new one is created.

## src/app/operate/admin/roles/[roleId]/role-actions.tsx — assignable prop

> Whether the cycle this seat hangs off can take a new assignment today.
>
> False between committee years, and false for a season in `closing` — which
> is current to read and closed to write. Offering Assign there would open a
> form the service is certain to refuse, which is the same defect as the end
> date below wearing different clothes.

## src/app/operate/admin/roles/[roleId]/role-actions.tsx — admitsMultipleHolders prop

> `DEC-assignment-dates-and-cardinality`: "Single-holder restrictions follow
> the constitution, with General Manager additionally single-holder; other
> roles permit multiple holders unless another authoritative rule says
> otherwise." A seat that admits several can be assigned again while it is
> held — two Social Secretaries is in the club's own 2025 AGM record — and
> one that does not cannot, which is why Assign is not simply "when vacant".

## src/app/operate/admin/roles/[roleId]/role-actions.tsx — replace offered / earliestFrom

> Replacement hands **one** assignment over, so it is offered only when
> there is exactly one to hand over. On a seat with several holders the
> question "who is being replaced?" has no single answer, and End plus
> Assign say the same thing without guessing. It creates the successor's
> assignment, so it needs a cycle to hang it off exactly as Assign does.
>
> ---
>
> A replacement's start date is also the outgoing assignment's end
> date, so it carries the same floor End does — LAN-141 finding 2.
> Handing over a seat somebody took up this morning cannot happen
> until tomorrow, and the form is where that has to be said.

## src/app/operate/admin/roles/[roleId]/role-actions.tsx — searchSlot (two slots)

> Two slots on one panel, not one — LAN-141 finding 15.
>
> This panel runs **two** actions: a search that asks something, and a submit
> that changes something. Only the second was inside the slot, so a failed
> search sat above a fresh confirmation and both read as current — which is
> exactly the state LAN133-BRIAN-3's rule exists to forbid, reached on the
> screen with three panels rather than the one with two. Registering the
> search as its own panel is what puts it under the rule: starting either
> clears the other.

## src/app/operate/admin/roles/[roleId]/role-actions.tsx — terms state

> The search terms, held here rather than in the DOM — LAN133-BRIAN-7.
>
> React resets a form after its action runs, which is right for a form that
> _submits_ something and wrong for one that _asks_ something: pressing
> Search emptied the three fields the administrator had just typed, so the
> result appeared beneath a blank form with no way to tell what had been
> searched for, and refining a near miss meant retyping all of it.
>
> Controlled inputs survive that reset, because their value comes from state
> the reset does not touch. It also makes the terms available to the empty
> result below, which can then say what it looked for.

## src/app/operate/admin/roles/[roleId]/role-actions.tsx — empty-result alert (LAN133-BRIAN-8)

> LAN133-BRIAN-8, below. The constraint an empty result expresses is real — a
> seat goes to somebody the club already holds a record for — but stating a
> rule is not the same as showing the way out. It told the administrator to
> invite the person first, then left them on a screen with no link to do it
> and a submit button that could never enable, which reads as a broken page
> rather than as a rule. The alert now carries the route, and the disabled
> button says what would enable it.

## src/app/operate/admin/roles/[roleId]/role-actions.tsx — EndPanel earliestEnd

> The earliest end the chosen assignment can be given, and whether that is
> today — LAN-141 finding 2.
>
> The period is half-open and `role_assignments_period_ordered` requires
> `effective_to > effective_from`, so a seat filled this morning cannot be
> vacated until tomorrow. Both this field and the service's own default were
> "today", so leaving it blank produced a refusal every time — under helper
> text that read "Leave blank to end it today", on the only action that
> corrects a role given to the wrong person. There is no delete, and
> deactivating the account deliberately does not vacate the seat, so this was
> the whole of the recovery route.
>
> Correcting it same-day would mean relaxing a schema constraint on the
> frozen domain model, which is Brian's decision and not this package's. What
> is this package's is that the form stops offering a date the service will
> refuse, and names the one it will accept.

## src/app/operate/admin/actions.ts — module header

> Administration's server actions — LAN-133, `WP-surfaces`.
>
> `operator-administration.ts` says in its own module note that "`WP-surfaces`
> owns the Administration screens and the server actions behind them", and this
> is that half. Every function here is a thin adapter: read the form, call one
> service, turn a `ServiceError` into a sentence the operator can act on.
>
> ## Not one of these actions decides who may do anything
>
> Each opens with `requireCapability("role_management")`, which resolves the
> actor from the **verified session** — a server action is a POST endpoint the
> browser can call directly, so an action that accepted "who am I" would accept
> whatever was sent. That is the floor and not the decision: the target-aware
> question (`assertAdministrationTarget`, the self rule, the leadership rules,
> the final-path rule) is asked _inside_ the service, against role codes read
> from the database in the transaction that writes. Nothing here reimplements
> any of it, and nothing here may.
>
> The one exception is `searchCandidatesAction`, whose service guards at the
> same floor for the reason `findOperatorCandidates` records: a search has no
> target yet.
>
> ## A refusal is never a form message, and never an exception either
>
> `NotPermitted` used to be excluded from every `catch` and rethrown, as
> `roster/actions.ts` and `events/actions.ts` do it. Half of that was right: a
> refusal rendered as red text beside a button reads as "try again", which is
> the wrong instruction and hides an authorization event inside a validation
> failure. The other half was wrong, and Brian found it by inviting somebody to
> a protected seat — rethrowing out of a server action does not reach a refusal
> screen, it reaches the framework, and the guard's carefully written sentence
> arrived as a stack trace.
>
> A refusal now comes back in `refusal` on the action state, which is neither
> `error` nor `notice`, and every screen renders it as a rule rather than as a
> failed attempt. `./action-state` carries the full reasoning.
>
> ## The one thing worth reading twice
>
> `startEmailRehomeAction` moves somebody's sign-in address. It is the most
> dangerous action on these screens and it is deliberately the plainest: it
> takes a replacement address and a required reason, hands both to the service,
> and adds nothing. Every protection — the target guard, the leadership
> recovery rule, the "unused address" check, `Email change pending`, the
> disabled old path — belongs to `startOperatorEmailRehome` and is not repeated,
> weakened or anticipated here.

## src/app/operate/admin/actions.ts — failure()

> A service failure the operator can act on, or a refusal the club's rules make.
>
> Both come back as state; neither escapes as an exception. A refusal used to be
> rethrown, which reached the operator as a Next.js error page — see the note on
> `refusal` in `./action-state`. Anything that is not a service error still
> throws, because an unexpected fault is not something to render beside a
> button.

## src/app/operate/admin/actions.ts — searchCandidatesAction

> Who this might already be — `REQ-invite-existing-person`'s first step, and the
> successor picker for an assignment or a replacement.
>
> The search matches exactly rather than by prefix, which is
> `findOperatorCandidates`' rule and not this screen's: a duplicate check that
> matched loosely would disclose the club's contact details to anybody who
> typed a letter. An empty result is a real answer and is rendered as one.

## src/app/operate/admin/actions.ts — inviteOperatorAction

> One guided invitation — `REQ-invite-existing-person`.
>
> `personId` present means the administrator chose an existing Person from the
> duplicate check; absent means they are creating one, and the service requires
> a first and last name for that case. The operating year is not a field: the
> active context is inherited (`DEC-active-operating-year`, "forms do not ask
> for or repeat the year"), and no code path here can name another.
>
> On success it redirects to the new operator's record, which is where the
> delivery result, the resend control and the audit history are. `redirect()`
> throws, so it sits outside the `try`.

## src/app/operate/admin/action-state.ts — AdminActionState

> The state every Administration action returns.
>
> `error` is the service's own sentence — those are written for the operator
> and never carry a row, a host or a connection string — and `notice` is the
> screen's confirmation. Both are `null` before anything has been attempted.
>
> A refusal is never either of them, and `refusal` is why it now has a field of
> its own rather than being rethrown — LAN133-BRIAN-1.
>
> The original reasoning was sound and is preserved: a refusal rendered as red
> text beside a button reads as "try again", which is the wrong instruction and
> hides an authorization event inside a validation failure. The conclusion drawn
> from it was not. Rethrowing `NotPermitted` out of a server action does not
> produce a refusal _screen_; it produces an unhandled exception, and Brian met
> it as a Next.js error page with a stack trace when he invited somebody to a
> protected seat. The guard had done its job and written a good sentence —
> "This action affects the President. Only the General Manager role may assign
> this role for that seat." — and the screen threw it away.
>
> So the refusal is carried back deliberately, in its own field, and rendered
> as a rule rather than as a failed attempt. Keeping it out of `error` is what
> stops it reading as "try again"; keeping it out of an exception is what stops
> it reading as a crash. Authorization itself is unaffected: every action asked
> the whole question again inside its own transaction before this state was
> built, and nothing here decides anything.

## src/app/operate/admin/follow-ups/presentation.ts — STATUS_FILTER_OPTIONS

> The mockup's own vocabulary, W5-01/OWNER-LAN173-01.
>
> The Status dropdown is built exactly as drawn — search plus a Status filter
> over the same chip vocabulary the last column already shows. The mockup's
> second dropdown, "Entry", is dropped rather than guessed at: no W5 spec text
> defines what it filters and Brian has not defined it, so building it would
> be inventing a meaning nobody approved. Labels come from `STATUS_LABELS`
> rather than a second copy of the same four words, so the filter and the
> chip can never say a status differently.

## src/app/operate/admin/guide/page.tsx — module header

> `/operate/admin/guide` — **How administration works**. LAN-134,
> `REQ-club-operating-guide` and `DEC-in-app-administration-guide`.
>
> ## It is protected, and by the same thing everything else here is
>
> `REQ-club-operating-guide` calls it "a protected in-app guide", and this page
> is gated on `role_management` exactly as Operators and Roles are — through
> `gateShellPage`, which resolves the operator from the verified session and
> renders the approved refusal rather than an `if` written here.
>
> That is worth one sentence of justification, because a page of prose is the
> kind of thing somebody leaves open "since it says nothing sensitive". It does
> say something sensitive: it is a complete description of who may act on whom,
> where the club's last administrative path is, and which seat cannot be
> touched from inside the application. That is a map of the authorization model
> handed to whoever asks. `role_management` is the same three seats that may
> use every action the guide describes, so the guide is readable by exactly the
> people it is for.
>
> The gate also means the reader is already inside the operator shell, which is
> why the page opens with a heading and no navigation of its own.
>
> The shared heading presents the title and context without another help link.
>
> ## No callout, here or anywhere else
>
> `REQ-club-operating-guide` forbids callouts, and the prototype's README
> repeats it. The whole design is that Operators and Roles carry a quiet
> question-mark link and this page carries the explanation — so there is no
> banner on this page either, and adding one to any Administration screen later
> would be reversing a recorded decision rather than improving a screen.

## src/app/operate/admin/operators/new/page.tsx — module header

> **Invite operator** — the flow behind the Operators page's primary action.
> LAN-133.
>
> The seat list is read from the catalogue rather than written here, for the
> same two reasons everything else in Administration reads it: it is the
> approved twenty (`REQ-static-role-catalogue`) in the approved group order,
> and `tests/capability-map-single-source.test.ts` allows no module in `src/`
> outside the capability map to name a `roles.code`.
>
> Every seat is offered, including the ten coaching ones —
> `REQ-coach-operator-onboarding`: "All ten fixed coaching roles may be invited
> as operators", and coaching onboarding "neither requires nor automatically
> creates player membership". Nothing on this page creates a membership.

## src/app/operate/admin/page-heading.tsx — module header

> The heading every Administration page opens with — LAN-133.
>
> Three things in a fixed arrangement, because all three are decided rather
> than chosen:
>
> - the page title, and beside it, on the same line, the **compact
>   question-mark link** to the guide;
> - one line of context under it — the operating year, and a count where the
>   page has one;
> - the actions, top right, primary first.
>
> `DEC-administration-navigation` and `REQ-admin-surfaces` are unusually
> specific about the help link: it is "reached from a compact question-mark How
> Administration Works link beside the page heading, **not a callout or another
> sidebar destination**", and the prototype's own README repeats it and adds
> "There are no in-application callouts". Writing it as a shared component is
> how the two pages that carry it cannot drift into two different treatments —
> and how a third page cannot quietly grow a banner.
>
> The guide page itself is `WP-guide`'s. This is the link to it.

## src/app/operate/actions.ts — manageRoles

> Manage operator accounts and role assignments — the President, the General
> Manager and the IT Officer, per `DEC-role-management-authority` (Brian, 18
> August 2026), which LAN-129 applied over LAN-124's IT-Officer-only grant.
>
> Still `notImplemented`: LAN-129 built the authorization layer, not the
> behaviour. `WP-invitation` and `WP-assignment` build the surfaces, and each
> of their actions calls `requireAdministrationTarget()` from
> `src/lib/auth/administration-authority.ts` rather than this capability alone
> — holding `role_management` opens Administration, and does not by itself
> permit acting on a particular person.

## src/app/operate/admin/guide/content.ts — module header

> The words of the How administration works guide — LAN-134, mission
> M-OPERATOR-ADMIN-WITHOUT-SQL, `REQ-club-operating-guide` and
> `DEC-in-app-administration-guide`.
>
> ## Why the copy is data rather than markup
>
> The requirement's last sentence is the whole reason this mission exists: the
> guide "contains no callouts, SQL, Supabase-dashboard, administrator-created-
> password or WhatsApp-authentication procedure". A guide that told a club
> officer to open a database console would document precisely the thing this
> work abolishes, and it would do so in the one place an officer is most likely
> to believe.
>
> That is a property of the _text_, and text buried in JSX can only be checked
> by reading it. Here every sentence is reachable from one exported structure,
> `guideText()` flattens it, and `content.test.ts` asserts the prohibition over
> the flattened whole. A future edit that reintroduces a forbidden procedure
> fails a test rather than surviving review.
>
> The same structure is what lets the vocabulary be checked.
> `DEC-administration-language-and-states` bans three technical labels from the
> interface — _Durable Person_, _Effective Access_ and a generic _Access
> History_ — and names the two audit projections exactly. Those are assertions
> over strings, and strings are what this file holds.
>
> ## Where the state names come from
>
> The five state labels are **imported**, never retyped.
> `operator-account-state.ts` owns them for the reason its own note gives: two
> surfaces showing the same state must not be able to describe it differently.
> A guide that called an account "Pending invitation" while the badge beside it
> said "Invitation pending" would be worse than a guide with no state names in
> it at all, because the reader would reasonably conclude they were two things.
>
> The action labels below are a local constant, and that is a deliberate
> second-best. They are the words on the buttons `WP-surfaces` builds
> (`operator-actions.tsx` and `role-actions.tsx`), which this package cannot
> import because the two branch from `main` independently. They are pinned by
> test against `DEC-administration-language-and-states`, and the moment both
> packages are on `main` these should become one exported constant that the
> buttons and this guide both read. That is recorded in the pull request as a
> follow-up rather than left for somebody to notice.
>
> ## What is deliberately not here
>
> No troubleshooting of the application, no account recovery for the reader
> themselves beyond naming the sign-in page's own link, and no description of
> any procedure performed outside the application. Where the club's answer is
> genuinely "this is not done here" the guide says so plainly and stops —
> see the escalation entry, which names no tool, no console and no person.
>
> ## And nothing here describes a screen that does not exist
>
> The operating-year entry used to say "An earlier year can be opened and read,
> but not changed" — LAN-141 finding 6. `readRoleHolders()` takes a `cycleId`,
> returns `readOnly`, and is tested end to end; no production code calls it,
> and the page-facing `readRoleCatalogue()` takes no year. So there was no way
> to open an earlier year, and the guide sent a reader hunting for a control
> that had never shipped — which is the same defect as the action labels below
> being paraphrases, in the one place a club officer is most likely to believe
> what they read.
>
> The entry now describes the application as it is, and points at the surface
> that genuinely answers the question: each seat's **Holder history**, which
> covers this year and past years. Building the switcher is a separate piece of
> work against `REQ-explicit-cycle-assignment`, not a wording change, and it is
> recorded as such rather than implied by a sentence.

## src/app/operate/admin/history.tsx — module header

> The two audit projections, rendered — LAN-133.
>
> `DEC-audit-boundary` and `DEC-administration-language-and-states` between them
> settle what this is and what it is called. It is **Operator audit history** on
> an operator's record and **Holder history** on a role's, never a generic
> "access log" or "audit trail"; the same stored event may appear in both
> "without duplicate records", which is why one component renders both — two
> renderings of one event stream is how the two views quietly start disagreeing
> about what happened.
>
> It is a reading surface and nothing else. `DEC-audit-boundary` excludes "the
> full Stage-4 general audit browser/search/filter/export interface" from this
> mission, so there is no search box, no date range, no filter and no export
> here — and their absence is a decision rather than an unfinished edge.
>
> ## An entry this version cannot read is shown, not hidden
>
> `unreadable` is set when the stored envelope came from a newer version of the
> application. The service's own note is explicit about why such an entry still
> arrives: "for an audit surface, a history that _looks_ complete and is not is
> worse than a visible gap, and a row that is simply absent from the list is
> exactly that". So the row renders with everything that is still legible — when,
> who, what — and says plainly that the rest cannot be shown.

## src/app/operate/admin/history.tsx — describeActor

> "By Clint Grohmann · 2026-27", and "· backdated" where it applies.
>
> The authority the actor held is recorded on every event and is deliberately
> _not_ shown: `REQ-append-only-audit-evidence` requires it to be stored, and
> `administration-authority.ts` keeps the rule that a surface names the
> requirement rather than anybody's holdings. Who acted is the club's business;
> which seats they happened to hold at the time is the record's.

## src/app/operate/admin/messaging/presentation.ts — saveRowButtonLabel

> One save button per event type (OWNER-LAN171-04) — Brian: "I think there
> should be a save button per event. Having one group save at the top
> doesn't really make a lot of sense." `label` is `TYPE_LABELS`' own
> capitalised form ("Practice"); this lowercases only its first letter, so
> the button reads "Save practice" rather than restating the row's own
> heading in full capitals.

## src/app/operate/admin/messaging/presentation.ts — scheduleSaveFailedNotice

> A write that genuinely failed — OWNER-LAN171-02. The generic
> `UnexpectedDatabaseError` sentence ("The database could not complete this
> change... Please try again") is deliberately vague everywhere else in this
> codebase, because most callers have no safe, non-PII detail to add. This
> screen does: which row, and which values it tried to save. Retrying without
> changing anything cannot help a deterministic rejection, so this never
> suggests it.

## src/app/operate/admin/messaging/presentation.ts — formatScheduleWhen

> A plan instant, in the club's own zone — "Tue 15 Sep, 20:00".
>
> A comma rather than the event page's middle dot, matching the approved
> `W7-02` mockup's own punctuation for this surface. The month comes from
> `shortMonthOf`'s fixed table rather than a second `Intl` call — recent ICU
> data renders `{ month: "short" }` for September as "Sept" in `en-GB`, and
> this club abbreviates every month to three letters everywhere else.

## src/app/operate/admin/roles/page.tsx — file header

> `DEC-administration-navigation`: "Roles appear as Operational Administration,
> Club Committee, then Coaching Staff; **the top level shows current holders
> only**." So each row is one seat, this operating year's holder or _Not
> assigned_, and the seat's Permissions summary. Past holders are on the seat's
> own page under Holder history, which is where `REQ-append-only-audit-evidence`
> puts them.
>
> The group headings are read from `public.role_groups` rather than written
> here. `REQ-static-role-catalogue` fixes the three groups and their order in
> the catalogue migration, and a page that restated them would be a second copy
> of the club's structure that could disagree with the first.
>
> `DEC-no-runtime-role-editing` and `REQ-admin-surfaces` are both unambiguous:
> "the role catalogue and capability map are read-only in the application",
> "No role or grant is editable". There is therefore no edit affordance on this
> page at all — not a greyed-out one, which would say the club could edit its
> constitution here if only the reader had more authority. What the actions on
> a seat's page change is **who holds it**, which is a different thing and is
> the whole of this mission.
>
> The Permissions text is the projection of the enforced grants
> (`REQ-capability-copy-consistency`), so it cannot drift from what the server
> actually allows: there is nowhere else for the sentence to come from.

## src/app/operate/admin/permissions.ts — file header

> Deciding what to render, never what to permit. `canAdministerTarget` is
> documented for exactly this and says the same thing: "a hidden control is a
> courtesy, and the action behind it still guards". Every action behind every
> control here asks the same question again, inside the transaction that
> writes, against role codes read there. Deleting this file would change what
> the screens look like and change nothing about what they allow.
>
> It exists because the alternative is worse in a specific way. A page that
> offers the President a **Deactivate operator access** button on the General
> Manager's record is not merely untidy: `REQ-final-admin-protection` makes
> that refusal a constitutional fact, and an interface that presents a
> constitutional impossibility as an available action teaches its reader
> something false about the club.
>
> The guard's answer is only as good as the seats it was asked about. The
> calling page already holds the target's roles — it drew them — and passing
> those in would be quietly wrong twice over: they are the seats _in force_,
> where the guard wants every seat _not yet ended_, and they are a snapshot the
> page took earlier. `readAdministrationSubject(…, { includeScheduled: true })`
> is the same read the services make, with the same option, for the reason
> `operator-administration.ts` records: a President-elect whose seat begins at
> a handover must be protected now, not from the handover date.
>
> This is not a `"use server"` module and must not become one. These are reads
> a page performs, not endpoints a browser calls.

## src/app/operate/admin/permissions.ts — permittedRoleActions

> All three decisions are role-scoped, so each names the `roleCode` it
> concerns — LAN129-B1's correction, which exists because a missing seat once
> meant "no seat is involved" and left a vacant General Manager installable by
> anybody. `personId` is the current holder for a replacement or an ending, and
> is absent for an assignment into a vacancy: there is no target Person yet,
> and the seat being conferred is what the leadership rule has to weigh.

## src/app/operate/admin/operators/[operatorId]/page.tsx — file header

> `REQ-admin-surfaces`: operator detail "uses club-facing labels and
> distinguishes operator account state from role state". Two panels, and the
> line between them is the whole design:
>
> - **Operator account** — can this person sign in, and what happened to the
>   invitation. One of five states, in the club's own words.
> - **Current relationships** — what the club has asked them to do, and
>   whether they are also a player this season
>   (`DEC-one-person-multiple-capacities`: one Person, one login, several
>   capacities).
>
> A deactivated Vice-President reads _Deactivated_ on the left and
> _Vice-President_ on the right at the same time, which is exactly what
> `REQ-deactivate-and-reinstate` requires and what a single merged "status"
> could not express.
>
> When an invitation is opened and then abandoned, the account cannot be
> invited again, and the reason recorded against it says so and says what to do
> instead. Independent review of `WP-invitation` confirmed the escape route
> works and that its **discoverability** was the open half: the sentence was
> written to `invitation_delivery_failure_reason` and rendered nowhere. It is
> on this page, beside the state that produced it, and in the list's invitation
> column as well — a Delivery failed badge with no reason beside it is the
> defect that finding names.

## src/app/operate/admin/operators/page.tsx — file header

> Three things, and all three are `DEC-administration-navigation` rather than
> taste: the sections are Standing Officers, Club Officers and Coaches, in the
> catalogue's group order; **Invite operator** is the top-right primary action;
> and the guide is reached from the compact question-mark link beside the
> heading rather than from a callout or a third sidebar entry.
>
> `REQ-admin-surfaces` requires operator surfaces to "distinguish operator
> account state from role state", and this is the list's half of that. **Current
> roles** says what the club has asked this person to do; **Account status**
> says whether they can sign in. `REQ-deactivate-and-reinstate` is the reason
> that separation has to survive contact with a real screen: deactivating
> access "does not end organizational roles, make a role pending or create a
> vacancy", so a deactivated Vice-President is a row reading _Vice-President_
> and _Deactivated_ at the same time, and one merged column could not say it.
>
> A wide table from `md` up and cards below it — the roster's precedent, and for
> the same reason: an operator scanning eight accounts for the one that never
> accepted its invitation is doing comparison work, which a table does and a
> stack of cards does not. At 375px the same fields are stacked, none dropped;
> the invitation line in particular stays, because it is the only place the
> delivery failure reason appears outside the record itself.

## src/app/operate/admin/operators/[operatorId]/operator-actions.tsx — file header

> `DEC-administration-language-and-states` names them, and these are those
> names: **Deactivate operator access**, **Restore operator access**, and the
> invitation pair. Nothing here is called "disable", "revoke", "suspend" or
> "reset", and nothing here mentions a durable Person, effective access or an
> access log.
>
> **Does the account's state make it meaningful?** Resend is offered "while
> pending or failed", which is `resendAvailable` on the state definition
> rather than a list of states written here. Restore is offered only to a
> deactivated account and Deactivate only to one that is not.
>
> **May this administrator do it to this person?** `permitted` is
> `canAdministerTarget`'s answer, computed on the server against seats read
> from the database. A President opening the General Manager's record sees
> no Deactivate button, because `REQ-final-admin-protection` makes that
> refusal a fact about the club rather than a message about a click.
>
> `DEC-single-actor` settles that these are single-actor and immediate — "there
> is no second-confirmation workflow" — so a confirmation dialog would be
> inventing a step the decision removed. But three of the four need something
> typed: a required reason for deactivation, a corrected address, a replacement
> address and a reason. The panel is where that goes, and Resend, which needs
> nothing, submits from its own button with no panel at all.

## src/app/operate/admin/operators/new/invite-form.tsx — file header

> `DEC-minimal-person-creation`: "operator invitation includes duplicate-checked
> create-or-link Person". The club's whole identity model rests on one durable
> Person per human (`DEC-person-account-role-separation`), and the single most
> likely way to break it is to invite somebody who is already a player by
> typing their name into a blank form. So the same four fields feed the search
> and the invitation: the administrator types who they mean once, is shown
> everybody it might be, and either links one of them or says plainly that this
> is somebody new.
>
> A candidate who already has an operator login is shown with the state of that
> login. `inviteOperator` refuses them — one person has one login, however many
> roles they hold — and saying so here means the refusal is understood before
> it happens rather than after.
>
> `DEC-active-operating-year`: "Forms do not ask for or repeat the year." The
> active context is inherited by the service and there is no control here that
> could name another, which is also what makes a past year read-only — there is
> no code path by which an assignment can be created in one.
>
> The reviewed prototype ends on a "Sent" panel. This ends by going to the
> account that was just created, which is where the delivery result, the resend
> control and the audit history already live — the same information, on the
> page the administrator would have to open next anyway. A delivery failure
> lands there too, with the reason, rather than on a confirmation screen that
> would have to be a second place to recover from one.

## src/lib/services/administration-events/vocabulary.ts — selfActionForbidden

> `REQ-final-admin-protection`: nobody may deactivate themselves, end their
> own role assignment, or use the administrator recovery flow on themselves.
>
> The service that performs the action is the primary boundary and refuses it
> before anything is written. This flag is the second line: an event naming
> the same person as actor and target is refused here too, so a self-action
> cannot reach the ledger even if a caller forgets.

## src/lib/services/administration-events/envelope.ts — NO_CHANGE_RULE throw

> "Refused no-change actions are excluded" — structurally. A row saying a
> state changed from `active` to `active` is a record of nothing, and
> somebody reading the history later would believe it.
>
> `invalid_transition` rather than `constraint_violated`, because that is
> exactly what it is: the record is well-formed and the action was legal
> to attempt, but the target was already where it would have moved to. A
> caller discriminating on `kind` can tell "that had already happened"
> from "you built the record wrongly".

## src/lib/services/administration-directory.ts — CatalogueHolder.accessDeactivated

> `REQ-deactivate-and-reinstate`: the holder keeps the seat and role detail
> "shows that the current holder's operator access is deactivated" rather
> than a vacancy. Decided here so no screen decides it differently.

## src/lib/services/administration-directory.ts — CatalogueRole.scheduled

> Brian, 20 August 2026, on the roles index: "I like showing the successors
> and also showing people when they go." A seat nobody holds today whose
> successor starts on 1 September is still Not assigned today, and saying
> only that leaves an administrator to discover the cover — or the gap — on
> the day it happens. The current answer stays the headline and this is the
> context beside it.

## src/lib/services/administration-directory.ts — CatalogueRole.cycleMissing

> True when the operating year this seat hangs off does not exist yet, so
> "Not assigned" would be a claim rather than a fact. Coaching seats hang off
> the season, and a club between seasons has none.
>
> It says nothing about who holds the seat. Assignments are written
> open-ended and outlive the cycle that started them, so a seat with no
> current cycle can still have a holder in post this morning —
> `describeHolders()` reads the holders first for that reason, and LAN-141
> finding 4 is what it cost when it did not.

## src/lib/services/administration-directory.ts — RoleCatalogue.committeeYear

> `null` during a gap between committee years. `committee_years.ends_on` is
> exclusive, so a club that closes one year the day before the next opens has
> one — and before LAN-141 finding 8 that gap took every Administration
> screen down rather than showing the club's seats without a year label.

## src/lib/services/administration-directory.ts — readRoleCatalogue header (three LAN-141 defects)

> It used to join every assignment whose period _overlapped the active cycle_,
> and that is a different question from the one `REQ-admin-surfaces` asks. The
> page says "current holders", and an assignment can overlap this year's
> committee term without being in force this morning. Brian found all three
> faces of that in one review:
>
> - A Vice-President ended **today** still appeared as the current holder.
>   The period `[10 Jun 2026, 20 Aug 2026)` overlaps the committee year, so
>   the old join kept it — but the range is half-open, and an assignment
>   whose `effective_to` is today is already over.
> - A Head Coach ended with a **future** date showed the seat as
>   `Not assigned`. His appointment `[20 Aug, 27 Aug)` sits _before_ the
>   active season opens on 27 Sep, so it overlapped no cycle at all and was
>   dropped — even though he holds the seat today.
> - Successors who have not started appeared as holders, tagged
>   "not started yet", which the top level is not supposed to list at all.
>
> One predicate caused all three, and one predicate answers all three: the
> same half-open currency test the schema's own exclusion constraint uses.
> `readRoleHolders()` carried the identical cycle-overlap defect and was
> corrected with it; the agreement test between the two readers is what
> caught that, and is why it exists.
>
> "Holders from different years are never mixed" (`REQ-explicit-cycle-assignment`)
> survives this, and is better served by it: everyone listed holds the seat on
> the same day, so there is only one year in the answer by construction. The
> cycle is still read, because `cycleMissing` — "no season under way" — is a
> genuinely different state from a vacancy and still has to be told apart from
> one.

## src/lib/services/administration-directory.ts — DirectoryOperator.deliveryFailureReason

> Why the last invitation could not be delivered, in the transport's own
> words — LAN131-A5. The column has been written since `WP-invitation` and
> nothing rendered it, which meant the one sentence telling an administrator
> how to recover an abandoned invitation was stored and shown to nobody.

## src/lib/services/administration-directory.ts — readOperatorDirectory header

> Seats are "not yet ended" rather than "in force today", which is the same
> widening `readAdministrationSubject({ includeScheduled: true })` makes and for
> a related reason: an invitation sent for a seat beginning at a handover is an
> ordinary case for this screen, and an operator listed with no role at all
> until the handover date would read as an account nobody meant to create. Each
> seat says whether it has started, so the surface never implies otherwise.

## src/lib/services/administration-directory.ts — readOperatorDirectory wanted var

> One account or all of them, through the same query. A separate
> single-account read would be a second copy of the state derivation and
> the seat filter, and the two would eventually disagree about the account
> one screen links to from the other.

## src/lib/services/operator-account-state.ts — module header

> The five operator states, and the one function that decides which one an
> account is in — LAN-131, mission M-OPERATOR-ADMIN-WITHOUT-SQL,
> `REQ-invitation-states` and `DEC-administration-language-and-states`.
>
> Pure. No database, no `server-only`, no framework, exactly as
> `./administration-events.ts` is pure, and for the same reason: a state
> machine that can only be exercised against a live stack is a state machine
> nobody exercises. Every case below, including the ones that need three facts
> to be true at once, is reachable from a plain object in a test.
>
> ## Why the states are derived rather than stored
>
> `operator_accounts` stores facts — deactivated on this date, invitation
> issued at this time, credentials established at that one, last delivery
> attempt failed for this reason. The five club-facing states are a _reading_
> of those facts, and there is exactly one reading, here.
>
> A stored `state` column would be a sixth fact that can disagree with the
> other five. It would need updating on every path that touches any of them —
> including reinstatement, which `REQ-invitation-states` says "returns the same
> operator to Active", and which is already implemented as `is_active = true`
> on the row that was deactivated. Deriving means reinstatement cannot forget.
>
> ## The order of the tests is the design
>
> They are not independent conditions with an arbitrary tie-break. An account
> can satisfy several at once — a deactivated account whose invitation never
> arrived is both — and the order below says which one the club is told about,
> strongest constraint first:
>
> 1. **Deactivated** wins over everything. `REQ-deactivate-and-reinstate`:
>    deactivation "prevents sign-in", whatever else is true of the account.
>    Showing "Invitation pending" for an account nobody can sign into would
>    invite an administrator to resend an invitation that cannot work.
> 2. **Email change pending** next. The holder had credentials and cannot
>    currently use them (`REQ-rehome-email`: the administrator "disables the
>    old login path" and the account stays in this state until verification),
>    so it outranks Active.
> 3. **Active** — credentials established, account usable.
> 4. **Delivery failed** — no credentials yet, and the last attempt to
>    deliver the invitation is known to have failed.
> 5. **Invitation pending** — no credentials yet, nothing known to be wrong.
>    The default, and deliberately the default: an account this module cannot
>    otherwise classify is one nobody has signed into.
>
> ## What `emailChangePending` is, and why it is an argument
>
> `REQ-rehome-email` is not this work package's requirement — the
> administrator-driven email re-home flow, its verification link and the
> state's storage belong to the package that implements it. But
> `REQ-invitation-states` names all five states as one vocabulary, and a state
> union missing one of them would force that package to invent a sixth name or
> to fork this function.
>
> So the state is in the union and its input is an explicit argument, supplied
> by the caller that knows. Today the only caller passes `false`, because
> nothing yet starts a re-home; the seam is a named parameter rather than a
> column this package guessed the shape of.

## src/lib/services/operator-account-state.ts — OperatorAccountStateDefinition comment

> What one state is called and means, in the club's words.
>
> The copy lives here rather than in a component for the reason
> `REQ-capability-copy-consistency` gives about capability descriptions: two
> screens showing the same state must not be able to describe it differently,
> and a refusal that quotes a state must quote the same words the badge shows.
> `WP-surfaces` chooses the visual treatment; the words are not its to choose.

## src/lib/services/operator-identity.ts — module header

> The Supabase Auth half of operator invitation — LAN-131,
> `REQ-email-invitation-path` and `DEC-email-authentication`.
>
> ## Why this is a port with one implementation
>
> Everything else in the invitation flow is rows in a transaction. These four
> operations are not: they are network calls to the Auth server, they are not
> transactional, and they cannot be rolled back. Separating them out is what
> lets `./operator-invitations.ts` be read as "what is written, in what order,
> and what is undone if the write fails" — with the untransactional part named
> at each point rather than mixed in.
>
> The interface also lets a test pose a delivery failure. That matters more
> than usual here: `REQ-invitation-states` requires that "delivery failure
> preserves the same Person and operator account and never creates a
> duplicate", and the only honest way to prove that is to make the send fail
> and then count the rows.
>
> ## No SQL against the `auth` schema, ever
>
> `REQ-one-time-bootstrap` is explicit that provisioning uses "the Supabase
> administrative API rather than direct SQL insertion into Auth-owned tables",
> and the same rule holds for ordinary invitation. It is not merely a
> preference: GoTrue owns the shape of `auth.users`, the hosted runtime
> connects as `app_runtime` — a least-privilege login with `service_role`'s
> grants and no reach into the `auth` schema at all (ADR 0026) — and a password
> or identity row written by hand is a support incident nobody can debug.
>
> ## Creating and sending are two calls, deliberately
>
> `inviteUserByEmail` creates the login _and_ sends the email in one request,
> which reads as the obvious choice and gets the failure ordering wrong. If it
> is the first thing the flow does, a database failure afterwards leaves an
> `auth.users` row nothing points at; if the mail transport is down it fails
> whole, and no account exists for the Delivery failed state to be _about_.
>
> So the flow creates the login first with {@link createLogin}, which sends
> nothing, writes every row it is going to write, and only then calls
> {@link sendInvitation}. A delivery failure therefore happens with the Person,
> the operator account and the role assignment already committed — which is
> exactly what the requirement asks be preserved.
>
> `sendInvitation` is GoTrue's invite endpoint, which re-sends for a login that
> exists and has never confirmed an email. That is also what makes resend and
> correction work: one call covers first send, resend and send-after-correction,
> and it refuses by itself once the holder has established credentials, because
> then the login is confirmed and there is nothing to invite them to.

## src/lib/services/operator-identity.ts — createLogin interface doc

> Creates an unconfirmed, passwordless login for this address and returns its
> `auth.users.id`. **Sends no email.**
>
> Refuses when the address already has a login. That refusal is the Auth
> server's own uniqueness rule, and it is the second guard behind
> `operator_accounts_login_email_key`; the flow checks its own table first so
> that the ordinary duplicate is refused in the club's words before anything
> is created.

## src/lib/services/operator-identity.ts — deleteLogin interface doc

> Removes a login. **Compensation only**, for a login this flow created
> moments ago and whose database rows then failed to commit.
>
> Never a way to remove an operator: `REQ-deactivate-and-reinstate` is
> unambiguous that "no action deletes Person, membership, binding,
> attribution or history", and revocation is `is_active = false` on a row
> `service_role` holds no `delete` on.

## src/lib/services/operator-identity.ts — createLogin, email_confirm inline comment

> Unconfirmed on purpose. Confirmation is what the invitation link
> does, and a login created already confirmed could not be invited:
> GoTrue's invite endpoint refuses a confirmed address, which is the
> same rule that correctly stops an active operator being re-invited.

## src/lib/services/operator-identity.ts — sendInvitation catch block (re-trimmed)

> One failure is worth naming, because otherwise it arrives as
> "already registered" against an account the club can see is still
> Invitation pending, which reads as a contradiction.
>
> GoTrue's invite endpoint re-sends for a login that has never
> confirmed an address, and refuses once it has. Following the emailed
> link is what confirms it — so somebody who opened their invitation
> and then closed the tab without choosing a password is confirmed,
> has no password, and cannot be re-invited. It is not a dead end and
> it does not need an administrator: the sign-in page's forgotten-
> password flow reaches them, and setting a password there activates
> the account exactly as the invitation would have.
>
> Stored as the recorded reason rather than raised as a refusal,
> because the account is genuinely undelivered-to and the state is
> genuinely Delivery failed; what changes is that the sentence says
> what to do.

## src/lib/services/operator-identity.ts — changeLoginEmail, email_confirm inline comment

> Again unconfirmed: the corrected address has not proved anything yet,
> and the invitation that follows is what proves it.

## src/lib/services/operator-identity.ts — changeLoginEmail catch block

> **`isDuplicateAddress` is deliberately not consulted here**, and that
> is a measurement rather than an oversight. GoTrue answers the two
> admin endpoints quite differently for the same collision, against
> this repository's own local stack:
>
> createUser → 422, code `email_exists`,
> "A user with this email address has already been
> registered"
> updateUserById → 500, code `undefined`,
> "Error updating user"
>
> The second carries nothing that distinguishes a taken address from a
> database being down, and "Error updating user" is what it says for
> _every_ failed update. Matching on it would tell an administrator
> that an address is already in use whenever anything at all went
> wrong, which is worse than saying less: a wrong actionable message
> sends somebody to change a field that was never the problem.
>
> So the sentence names both reachable causes without asserting
> either. It is reachable only in the race the service's own
> `login_email` pre-check cannot close — an address held by an
> `auth.users` row that no `operator_accounts` row points at — and by
> then nothing has been written and there is nothing to undo.

## src/lib/services/operator-identity.ts — InvitationDeliveryFailure class doc

> A delivery failure, distinguished from every other error the flow can hit.
>
> It is deliberately **not** a `ServiceError`: a delivery failure is not a
> refusal and not a broken write, it is a recorded outcome that leaves the
> account exactly where it was and offers a resend. The flow catches this type
> by name and records `administration.operator.invitation_delivery_failed`;
> anything else propagates.

## src/lib/services/operator-identity.ts — isDuplicateAddress doc and fallback comment

> Is this the Auth server saying the address is taken?
>
> Used by `createLogin` and by `sendInvitation`, and **not** by
> `changeLoginEmail` — see the note there. GoTrue answers `createUser` with a
> 422 and `code: "email_exists"`, which is exactly what this reads; it answers
> `updateUserById` with a bare 500 that says nothing, so there is nothing here
> for it to match and pretending otherwise would produce a confident wrong
> message.
>
> Older GoTrue builds answer 422 with prose and no code. Matched loosely and
> only as a fallback: the consequence of missing it is an unexpected-error
> message instead of the club's sentence, never a duplicate account, because
> the address is unique in `auth.users` regardless.

## src/lib/services/operator-administration/access.ts — deactivateOperatorAccess doc

> Stops this operator signing in, immediately, and touches no role.
>
> `REQ-deactivate-and-reinstate` is emphatic about the second half:
> deactivation "prevents sign-in without ending organizational roles, making a
> role pending or creating a vacancy; role detail instead shows that the current
> holder's operator access is deactivated". So this writes three columns on one
> row and nothing else — {@link readRoleHolders} is what makes role detail say
> so, and `operator-administration.test.ts` counts `role_assignments` rows
> before and after to prove it.

## src/lib/services/operator-administration/access.ts — restoreOperatorAccess doc

> Lets this operator sign in again.
>
> "Reinstatement restores only capabilities from assignments that remain
> effective." Nothing here restores a capability, and that is the point:
> capabilities are read from `role_assignments` on every request, so a seat that
> ended while the account was deactivated stays ended and does not come back.
> There is no capability snapshot to get wrong because there is no snapshot.
>
> The reason is optional. `REQ-deactivate-and-reinstate` requires one for
> deactivation and does not for restoration, and the audit vocabulary agrees —
> `administration.operator.restored` carries `reasonRequired: false`. Coming
> back needs no excuse, exactly as returning a membership to active does not.

## src/lib/services/operator-administration/assign.ts — assignRole doc

> Gives one Person one seat, in the club's one active operating context.
>
> `REQ-effective-dated-role-history`: "Ordinary roles inherit the active
> operating year and an effective-from date defaulting to today; future dates
> and audited backdating are permitted. No routine end date is requested."
> There is deliberately no `effectiveTo` parameter — ending is
> {@link endRoleAssignment}, and an assignment created already ended is not a
> thing the club ever means.
>
> The Person need not have an operator login. Assigning a seat to somebody who
> has never signed in is ordinary — the club's committee is a fact about the
> club, not about this application — and the leadership rules protect the
> _seat_ rather than the account.

## src/lib/services/operator-administration/assign.ts — guard-ordering inline comment

> The guard runs before the dates and the duplicate check, deliberately.
> An operator who may not act on this target should be told that and not
> which of their other fields was also wrong — and a refusal that depends
> on the shape of the request is a refusal that answers questions about
> the target for somebody who was never allowed to ask.
>
> Rule 3 and rule 4: the target's seats, read here, inside the transaction
> that is about to write, and widened to seats that have not started.
>
> Rule 2: `role.code` is the catalogue's own spelling, from the row above.

## src/lib/services/operator-administration/email-rehome.ts — OperatorEmailRecoveryPort doc

> The Auth-server half of the re-home, as a port with one implementation.
>
> Deliberately **not** an addition to `OperatorIdentityPort`. That interface has
> four members and a test double in `operator-invitations.test.ts` that
> implements exactly those four; widening it would break a merged suite for no
> gain. This is the narrower thing this flow needs, and `changeLoginEmail` is
> delegated to the existing implementation rather than written twice.

## src/lib/services/operator-administration/email-rehome.ts — sendVerification doc

> Sends the verification link to the replacement address.
>
> Throws {@link EmailRehomeDeliveryFailure} on any failure. The caller records
> the failure and leaves the account pending, because the old login path is
> already gone by then and putting it back would be worse than a retry.

## src/lib/services/operator-administration/email-rehome.ts — supabaseOperatorEmailRecovery doc

> The real port.
>
> ## Why the verification link is a recovery link
>
> `REQ-rehome-email` asks for "a secure verification link to an unused
> replacement email". This repository already has exactly one such link and has
> had it since LAN-125: the recovery email, templated to carry `{{ .TokenHash }}`
> to `/auth/recovery` on this origin, exchanged there for a session that may do
> one thing — set a password — and nothing else. Following it proves control of
> the mailbox it was sent to, which is the whole question being asked.
>
> GoTrue's **invite** endpoint would not do. It refuses an address whose login
> has already confirmed an email, which every account reaching this flow has:
> `REQ-rehome-email` is about somebody who _had_ working credentials and lost
> the mailbox behind them. Invitation is for an account that never had any, and
> `correctOperatorInvitation` already owns that case and already refuses an
> activated account — the two flows meet exactly, with no gap and no overlap.
>
> The request is made through the **stateless** client for the reason
> `src/lib/auth/recovery.ts` gives at length: a cookie-backed client writes a
> PKCE verifier, and the emailed link then only works in the browser that asked
> for it. Nobody is sitting at that browser here — an administrator asked, and
> somebody else's phone opens the mail.

## src/lib/services/operator-administration/email-rehome.ts — startOperatorEmailRehome doc

> Moves an operator's sign-in to a replacement address and asks them to prove
> they hold it — `REQ-rehome-email`.
>
> ## The order, and what each step buys
>
> 1. Everything refusable is refused first, inside a transaction that reads
>    the account and the target's seats: the guard, the state, the address.
> 2. The login moves to the replacement address. **This is what "disables the
>    old login path" means** — the old address then signs in nowhere and
>    receives no reset link, which matters most in the case the requirement
>    names, where somebody else is reading that mailbox.
> 3. `email_rehome_pending_at` is stamped, which makes the account Email
>    change pending and makes `resolveOperatorAccess()` refuse it. Without
>    that second half the flow would be a hole rather than a control: local
>    Supabase runs with `enable_confirmations = false`, so an unconfirmed
>    address signs in perfectly well, and a compromised account whose password
>    had also been taken would still be usable.
> 4. The verification link is sent. A failure here is recorded and the account
>    stays pending — the old path is already gone, and restoring it to
>    compensate would hand it back to whoever the requirement is protecting
>    the account from.
>
> ## Retrying
>
> "Failure is correctable and retryable on the same account." So this may be
> called again while the account is already pending — to a corrected address,
> or to the same one after a transport failure. The retry records
> `administration.operator.email_rehome_retried` rather than a second
> `…_started`: the account's state does not change on a retry, and the ledger
> refuses a transition whose before and after are the same, correctly.

## src/lib/services/operator-administration/email-rehome.ts — second-transaction re-assertion comment

> **Everything the first transaction decided is decided again here**, and
> this is LAN132-B3. The first transaction committed and released its
> `FOR UPDATE` lock before the Auth call above, which is an unbounded
> network call; every fact it checked is therefore a snapshot from before
> that window. A different administrator assigning the President seat
> inside it would have made this a re-home of the President's login,
> authorized against a target who was nobody in particular when the
> question was asked.
>
> So the lock is retaken, the target's seats are re-read, and the guard,
> the state rule and the address rule are all re-asserted against the row
> as it is now — inside the transaction that writes, which is what this
> module's rule 3 promises and what the first version of this function
> was alone in not delivering.

## src/lib/services/operator-administration/email-rehome.ts — catch-block compensation comment

> The login was already moved, and the write that was supposed to record it
> did not happen — because the re-assertion above refused, or because the
> database did. Put the address back, so the login and the club's record of
> it agree, and so the refusal is a refusal rather than a half-performed
> recovery. Best effort: if the move back fails, the original refusal is
> still what the administrator needs to see.

## src/lib/services/operator-administration/email-rehome.ts — verifyOperatorEmailRehome doc

> Records that the holder proved they hold the replacement address.
>
> Called from `src/app/reset-password/actions.ts` with the `auth.users.id` of
> the session that just set a password — never with an id a browser supplied.
> Reaching that screen requires having followed a one-time link sent to the
> replacement address, and while the account is pending that is the _only_
> address it can have been sent to, because the login already moved. So setting
> the password there is the verification.
>
> Returns `null` when there is no account or no re-home in flight, which is the
> ordinary case for every other password reset in the club. It is idempotent for
> the same reason `activateOperatorAccount` is: a second reset is not a second
> verification.

## src/lib/services/operator-administration/end.ts — endRoleAssignment doc

> Ends one assignment, today or on a date still to come.
>
> This is the one action that creates a vacancy — `REQ-deactivate-and-reinstate`:
> "Only explicit End role creates a Not assigned vacancy." Deactivating access
> does not, and never has.
>
> The row is updated, never removed. An assignment that has already ended is
> refused rather than re-ended: "without rewriting history" is the requirement,
> and moving a date that has already passed is rewriting it.

## src/lib/services/operator-administration/replace.ts — replaceRoleHolder doc

> Hands one seat from its current holder to a successor, in one transaction.
>
> `REQ-effective-dated-role-history`: "replacement ends the outgoing assignment
> and creates the successor without rewriting history." Both rows exist
> afterwards, and the outgoing one keeps its own start date.
>
> ## Why the two dates meet rather than overlap
>
> `role_assignments_one_holder_per_office` and
> `role_assignments_one_holder_per_single_holder_seat` are GiST exclusions over
> `daterange(effective_from, effective_to, '[)')` — a half-open range. So
> `effective_to = D` on the outgoing assignment and `effective_from = D` on the
> successor's are disjoint and legal, and a single day of overlap is not. The
> seat is never held by two people and never vacant for a day.
>
> ## Two events, and deliberately not three
>
> One `administration.role.ended` and one `administration.role.assigned`,
> sharing a `correlationId`. There is no `role.replaced` action and there will
> not be one: two assignment rows change, and a single event would have to name
> two target Persons, which the Operator-audit-history projection keys on and
> cannot represent. `instantOrder` already puts an assignment beginning after an
> assignment ending, so the pair renders in causal order despite sharing a
> transaction timestamp.
>
> ## Two guards, not one
>
> `replace_role_holder` is asked against the **outgoing** holder, because ending
> their assignment is the half that removes authority — that is what
> `WP-authorization` records, and it carries `end_role`'s self rule. But the
> successor is also being given a seat, and a successor who is themselves
> protected must be as hard to install as they are to administer, so
> `assign_role` is asked against them too. Two questions, both answered before
> anything is written.

## src/lib/services/operator-administration/role-detail.ts — accessDeactivated field doc

> `REQ-deactivate-and-reinstate`: role detail "shows that the current holder's
> operator access is deactivated" rather than a vacancy. This is that fact,
> decided here so that two screens cannot decide it differently.

## src/lib/services/operator-administration/role-detail.ts — scheduled field doc (RoleHolders)

> Recorded to begin later. Never holders, never counted towards `vacant`.
>
> Kept beside them rather than merged into them because the two questions a
> screen asks are different: "who holds this seat" and "is anybody coming".
> Answering the first with the second is what made a seat starting on 1
> September read as though it were held today; answering it with _nothing_
> is what made the same seat read as though nobody were coming at all.
> `readRoleCatalogue` partitions identically, and the agreement test between
> the two readers now compares both halves.

## src/lib/services/operator-administration/role-detail.ts — readRoleHolders doc (between the interfaces and AS_AT)

> Who holds one seat, in one operating year, and what state their access is in.
>
> ## Why this is the capability floor and not the target-aware guard
>
> `assertAdministrationTarget` answers "may this operator do X _to this target_",
> and a role's holder list has no target — it is the list from which a target
> would be chosen, and it may be empty. `./operator-invitations.ts` draws the
> same line for the same reason, for candidate search and for reading one
> account. Guarding it at all matters because a holder list is a list of the
> club's officers with their access states attached; `role_management` is where
> `administration-audit.ts` already draws that line.
>
> Every **write** in this module asks the target-aware question, twice over: the
> capability floor first, inside `assertAdministrationTarget`, and then the self
> and leadership rules.
>
> ## "Holders from different years are never mixed"
>
> The rule is `REQ-explicit-cycle-assignment`'s. It used to be implemented as a
> period overlap against the cycle, and that was the defect Brian's review of
> `WP-surfaces` found on three screens at once: overlapping a year is not the
> same question as holding the seat on a day, and it answered the second with
> the first. It kept an assignment that had already ended today and dropped one
> in force today whose dates fell outside the cycle window.
>
> It is now a currency test against a single day — see `AS_AT` below — and the
> requirement is better served by it than it was before: everyone in the answer
> holds the seat on the same day, so there is exactly one year in it by
> construction rather than by a filter that had to be got right.
>
> The standing-seat case that motivated the overlap still works, and works more
> simply. General Manager and IT Officer "neither expire automatically at year
> end", so an appointment made in 2025-26 and never ended has no end date; it
> is in force today and is therefore the holder today, whatever cycle row it
> hangs off. A strict `committee_year_id = ?` filter would still report that
> seat vacant the day the committee year turned over, which is why this is not
> that either.

## src/lib/services/operator-administration/role-detail.ts — reading-resolver inline comment

> The **reading** resolvers, so this and `readRoleCatalogue()` answer about
> the same cycle. A season in `closing` is current to read and closed to
> write, and using the write resolver here is what made the two readers
> disagree about every coaching seat under it — LAN-141 finding 4.

## src/lib/services/operator-administration/shared.ts — requireRoleById inline comment

> Unreachable while `role_assignments.role_id` is a foreign key, and
> refused rather than asserted away: the alternative is a guard judging
> `undefined.code`.

## src/lib/services/operator-administration/shared.ts — resolveDates doc

> The dates and the reason for a new assignment, checked before anything is
> written.
>
> The same three rules `./operator-invitations.ts` applies to an invitation's
> initial roles: today by default, a future date is scheduled, a past date is
> backdating and backdating is _audited_, so it needs a reason.

## src/lib/services/operator-administration/shared.ts — refuseOverlappingHolding doc

> One person may not hold one seat twice over the same period.
>
> No schema constraint forbids it for a seat that admits several holders — and
> nothing about the club means it. Refused rather than de-duplicated, because
> "I picked it twice" and "I meant two different periods" look identical
> afterwards.

## src/lib/services/operator-administration/shared.ts — updateAccount doc

> Applies a fragment to one account row and re-reads it through the one
> function that decides an account's state.
>
> The fragment is written by this module and never by a caller — `$1` is always
> the account id, and any further placeholders are the caller's parameters.

## src/lib/services/operator-administration/shared.ts — administrationPathsOn doc

> The club's administration paths **on one date**, as the authority module's
> rule wants them.
>
> `[effectiveFrom, effectiveTo)` — the same half-open period the GiST exclusion
> constraints use, so a seat handed over on a date is held by exactly one of
> the two people on it.

## src/lib/services/operator-administration/shared.ts — assertClubKeepsAnAdministrator horizon comment

> Every date the picture can change: today, the date this action takes hold,
> and every start or end already scheduled. Between two consecutive dates in
> this set no seat begins or ends, so no date between them can be worse than
> the one that opened the interval.

## src/lib/services/operator-invitations/subject.ts — readAdministrationSubject doc

> The target's role codes, read from the database inside the caller's
> transaction. **This is the input the leadership rules stand on** — every
> caller that hands the result to a guard passes `includeScheduled: true`
> (fail-closed; no production caller asks for the narrow answer). Decision
> history (LAN-141 finding 1): relocations.md.

## src/lib/services/operator-invitations/activate.ts — activateOperatorAccount doc

> Records that the holder of this login has established credentials.
>
> Called by the action that sets the password, with the `auth.users.id` of the
> session that set it — never with an id a browser supplied. This is the end of
> the invitation: `DEC-email-authentication`, "first login establishes
> credentials only".
>
> Three properties worth stating, because each one is a decision:
>
> - **Idempotent.** A second password change is not a second activation, and
>   writes no event. `activated_at` is when credentials were established the
>   first time.
> - **It is the account holder's own act**, so the audit event carries
>   `authority: { kind: "self" }` — the one shape the vocabulary permits for
>   somebody with no administrative capability at all.
> - **It does not reactivate a deactivated account.** Setting a password is
>   not permission to sign in; `is_active` is untouched, the derived state
>   stays Deactivated, and no event is written because nothing transitioned.
>   `REQ-deactivate-and-reinstate` gives restoration to an administrator.
>
> Returns `null` when the login has no operator account. That is not an error:
> a login can exist unlinked, and the password screen has no business telling
> its user which it is.

## src/lib/services/operator-invitations/activate.ts — no-op-transition inline comment

> A deactivated account moves from Deactivated to Deactivated, which is not
> a transition and which the ledger refuses to record — correctly, because
> nothing about the club's picture of that account changed.

## src/lib/services/operator-invitations/invite.ts — ResolvedRole doc

> A role the caller asked for, resolved against the catalogue with its dates
> checked.
>
> Exported for `./operator-administration.ts` (LAN-132), which creates the same
> rows for a standalone assignment and for a replacement's successor. Writing
> those rules a second time there would have been two copies of "the catalogue
> decides `scope`, `is_constitutional_office` and `is_single_holder_seat`",
> which is exactly what the composite foreign keys exist to make loud.

## src/lib/services/operator-invitations/invite.ts — authoritative-snapshot inline comment

> The authoritative snapshot: read here, inside the transaction that is
> about to write, and judged by the guard before a single row is
> inserted. `WP-authorization` records that a stale or empty snapshot is
> the one way to disarm the leadership rules; this is the read that stops
> that being possible.
>
> `includeScheduled` for the reason every other administration write
> gives, and because leaving it off here was the sharper half of it: a
> Person holding a seat dated to begin at a handover, and no login yet,
> is exactly the target this flow reaches. Without the widening they are
> invisible to the leadership rule, and whoever may not assign that seat
> could give them another one _and_ an account at an address they chose.
> Fail-closed is the only direction the option can move the guard.

## src/lib/services/operator-invitations/invite.ts — dangling-login compensation comment

> The only compensation in this module, and it applies to exactly one
> thing: a login created seconds ago that no `operator_accounts` row
> points at, because the statement that would have pointed at it did not
> commit. A dangling login grants nothing — `resolveOperatorAccess()`
> reports it `unlinked` — but leaving it behind would make the honest
> retry fail with "that address already has a login".
>
> Best effort: if the removal itself fails, the original failure is what
> the administrator needs to see, and a second error thrown from a catch
> block would replace it.

## src/lib/services/operator-invitations/candidates.ts — capability-guard inline comment

> A duplicate check discloses names, addresses and phone numbers of people
> who are not the subject of the search, which is why it is guarded here and
> not by whatever screen calls it. `assign_role` is the decision this search
> is a step of; the role is not chosen yet, so the floor is what can be
> asserted, and the target-level guard runs before anything is written.

## src/lib/services/operator-invitations/candidates.ts — toCandidate, emailChangePending inline comment

> Read, not assumed. This was hard-coded `false` and the column
> was not selected, so an operator whose sign-in is refused
> pending verification of a replacement address was reported as
> **Active** — here and in the successor picker this search
> feeds. `toAccount` and `readOperatorDirectory` both read it
> correctly; this projection was the one that did not.

## src/lib/services/operator-invitations/cycles.ts — resolveCycleFor doc

> The cycle a role's assignment hangs off — register D8, and
> `REQ-explicit-cycle-assignment`: the form does not ask for the year, the
> stored cycle stays explicit, and it is inherited from the one active context.
>
> A committee seat hangs off the committee year; a coaching seat hangs off the
> season, because coaches are appointed around seasons and do not turn over at
> the AGM. The role says which, so this reads the role rather than asking.

## src/lib/services/operator-invitations/cycles.ts — insertRoleAssignmentIn inline comment

> `scope`, `is_constitutional_office` and `is_single_holder_seat` are all
> denormalised from `public.roles` so that the schema's exclusion constraints
> are expressible, and all three are carried by composite foreign keys. There
> is no trigger filling them in — LAN-128 decided that deliberately — so a
> value taken from anywhere but the catalogue row is refused loudly by
> `role_assignments_agree_with_role` or
> `role_assignments_agree_with_single_holder_rule`. They are read from the
> row this insert names, and from nowhere else.

## src/lib/services/operator-invitations/cycles.ts — resolveActiveCommitteeYear doc

> The one active committee year — `DEC-active-operating-year`: "routine
> assignments inherit the single application-wide active operating-year
> context", and forms do not ask for it.
>
> Fails closed in both directions, on `resolveOpenSeason`'s pattern: none is a
> `NotFound` naming what has to happen first, and more than one is a `Conflict`
> rather than a silent choice. `committee_years_do_not_overlap` makes the
> second unreachable for dated years and not for open-ended ones, which is
> exactly the case worth refusing.

## src/lib/services/operator-invitations/resend.ts — resendOperatorInvitation doc

> Sends the invitation again, to the same address.
>
> `REQ-invitation-states` offers resend "while pending or failed", and
> `resendAvailable` on the state vocabulary is where that rule lives — this
> asks the state rather than listing the two states again.
>
> An expired link is a normal reason to be here, not an error: the requirement
> "treats expiration as normal", and there is nothing to clean up because the
> expiry is GoTrue's and the account never changed.

## src/lib/services/operator-invitations/resend.ts — correctOperatorInvitation doc

> Corrects the address and sends the invitation again.
>
> `REQ-invitation-states`: "permits correction and resend". The address moves
> on the login and on the account together, and the old address is recorded in
> the audit event rather than being quietly overwritten — an invitation that
> went to the wrong person's mailbox is exactly the thing somebody will need to
> reconstruct later.
>
> It is refused once the holder has established credentials. Changing the
> address of a working account is `REQ-rehome-email`'s administrator recovery
> flow, which disables the old login path, records a reason and holds the
> account in Email change pending until the new address is verified. Silently
> doing it here would be that flow without any of its protections.

## src/lib/services/operator-invitations/resend.ts — sendAgain doc

> The shared body of resend and correction.
>
> They differ in one place — whether the address moves — and are one function
> because everything else about them is identical, including the two things
> easiest to get subtly different between two copies: which states permit them,
> and the fact that the failure columns are cleared _before_ the send so that a
> fresh failure is a real transition rather than a no-change the ledger refuses.

## src/lib/services/operator-invitations/resend.ts — snapshot-widening inline comment

> The snapshot includes seats that have not started yet. See the module
> note: a pending invitation carrying a future-dated protected seat must
> protect its target now, not from the handover date.

## src/lib/services/operator-invitations/resend.ts — email === null inline comment

> Only reachable for a row created before this package existed by a script
> that set a password directly — and such a row is Active, so
> `refuseUnlessResendable` has already refused it. Kept as a refusal rather
> than a non-null assertion, because "send an invitation to nowhere" is not
> a state this module may guess its way out of.

## src/lib/services/operator-invitations/resend.ts — login-move-ordering inline comment

> The address moves on the login before it moves in the database, so that a
> failure to move it leaves both saying the same thing. If the database
> write then fails, the login is moved back.

## src/lib/services/operator-invitations/resend.ts — second-transaction re-assertion comment

> **Everything the first transaction decided is decided again here.**
>
> The first transaction committed before the Auth call above, so every
> fact it checked is a snapshot taken before an unbounded network window.
> `startOperatorEmailRehome` closes the identical window (LAN132-B3) and
> this path was missed; LAN-141 finding 3 is that omission.
>
> The sharp case is `correct_invitation` on an account that activates
> inside the window: without this, correcting an invitation silently
> becomes an email re-home of a working account with none of
> `REQ-rehome-email`'s protections — no `recover_email` guard with its
> different authority list, no reason, no Email change pending. The
> guard's own window is the second: an administrator assigning a
> protected seat inside it would have made this a redirection of the
> link that confers it, authorized against a target who held nothing
> when the question was asked.
>
> So the row is locked, the target's seats are re-read with the same
> `includeScheduled` widening, and the guard, the state rule and the
> address rule are all re-asserted against the row as it is now. On a
> refusal the `catch` below moves the login back, exactly as the
> sibling flow does.

## src/lib/services/operator-invitations/shared.ts — InvitationSubject doc

> Who this invitation is for.
>
> `DEC-minimal-person-creation`: the flow is duplicate-checked create-or-link,
> and the choice between them is the administrator's explicit answer rather
> than something this module guesses from a name.

## src/lib/services/operator-invitations/shared.ts — normaliseEmail doc

> The address, trimmed and lowercased.
>
> Addresses are lowercased **here and stored that way**, unlike
> `contact_points.raw_value`, which is deliberately stored exactly as typed.
> The two are different things: a contact point is a record of what the club
> was told, and a login is a key. `Clint@Example.org` and `clint@example.org`
> are one mailbox, one login and — because of
> `operator_accounts_login_email_key` — one row.

## src/lib/services/operator-invitations/shared.ts — assertAdministrationCapability doc

> The capability floor, for the two **reads** in this module.
>
> The floor and not the target-level guard, and that is not the mistake the
> mission warns about — it is the case the target-level guard has nothing to
> say about. `assertAdministrationTarget` answers "may this operator do X _to
> this target_", and a duplicate search has no target: it is the step that
> decides who the target will be. Reading one account is the same shape.
>
> Every **write** below asks the target-aware question instead, twice, and it
> is the write that decides anything. Guarding the reads matters for a
> different reason — a duplicate check discloses names, addresses and phone
> numbers of people who are not its subject — and `role_management` is exactly
> the line `administration-audit.ts` draws around administration history for
> the same reason.

## src/lib/services/operator-invitations/shared.ts — assertEachRolePermitted, roleCode inline comment

> The catalogue's own spelling, resolved from `public.roles` — never the
> string a form supplied. `WP-authorization` refuses an unrecognised code
> outright and normalises nothing, which is only safe if the caller
> resolves first. This is that resolution.

## src/lib/services/operator-invitations/shared.ts — lockAccount doc

> The same read, holding the row for the rest of the transaction.
>
> Used by the write half of {@link sendAgain}, which re-decides everything the
> pre-flight transaction decided. A re-assertion against a row another
> transaction can still change while this one deliberates is not a
> re-assertion, which is why the lock comes first and the record is read
> behind it.

## src/lib/services/operator-invitations/shared.ts — createOrLinkPerson, name-required inline comment

> `people.family_name` is nullable by design — a quarter of the club's real
> records are first-name-only — and `DEC-minimal-person-creation` still
> requires both here. That is not a contradiction: the schema records what
> the club's history contains, and this flow records somebody being given
> an account today, which is a moment where both names are known.

## src/lib/services/operator-invitations/shared.ts — createOrLinkPerson, known-as inline comment

> LAN-182: known-as is no longer a column. A supplied one becomes the
> person's display alias, which is the same fact in the place that now holds
> it — and, unlike the old column, it also makes this person matchable by
> that name the next time somebody is entered.

## src/lib/services/operator-invitations/shared.ts — createOrLinkPerson, contact-points inline comment

> The email and the optional phone become contact points, preferred, because
> a brand-new Person has none of either and the club now knows both. An
> _existing_ Person's contact points are deliberately untouched: editing a
> profile is outside this mission (`REQ-invite-existing-person`), and
> silently re-preferring somebody's address because they were given a login
> would be an edit nobody asked for.

## src/lib/services/operator-invitations/shared.ts — resolveRoles doc

> Every requested role, resolved against the catalogue, with its dates checked.
>
> The resolution is the part that matters for authorization: the guard refuses
> a code the catalogue does not have and normalises nothing, so a caller that
> passed a form value straight through would be refused for a typo and — worse
> — a caller that trimmed one itself would be judging a seat nobody named. Here
> the code is looked up exactly, and what the guard is given afterwards is the
> catalogue's own `code` column.

## src/lib/services/operator-invitations/shared.ts — resolveRoles, not-trimmed inline comment

> **Not trimmed.** `" kit_manager "` is refused, not tidied up.
>
> Trimming and then looking the result up in the catalogue would not have
> been a bypass — the guard would still have received an exact
> `roles.code`, or the lookup would have failed — but it is leniency
> nothing needs. A role code comes from a fixed list of twenty, chosen from
> a control; whitespace around one means a caller built the request
> wrongly, and `WP-authorization` refuses the same input for the same
> reason rather than guessing what was meant about the most dangerous seat
> in the club. Two layers refusing identically is one fewer thing to
> reason about than two layers disagreeing harmlessly.

## src/lib/services/operator-invitations/shared.ts — resolveRoles, duplicate-role inline comment

> Two assignments of one seat to one person, starting the same day, is
> not something any schema constraint forbids for a multi-holder seat —
> and it is not something an administrator ever means. Refused here
> rather than de-duplicated silently, because "I picked it twice" and "I
> meant two different seats" look identical afterwards.
