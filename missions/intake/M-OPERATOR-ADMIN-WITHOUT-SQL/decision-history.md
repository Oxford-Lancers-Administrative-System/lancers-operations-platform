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
