# 23. RSVP links are hash-only and single-live; delivery is official 1:1 WhatsApp behind a provider boundary

**Status:** Accepted · **Date:** 2026-08-13

Implements the direction LAN-92 approved. Extends
[ADR 0010](0010-domain-table-access-posture.md) (server-only table access) and
[ADR 0002](0002-rls-posture.md) (deny-by-default RLS); neither is changed.

## Context

LAN-78 gives every invitation an unguessable RSVP link and delivers it
automatically. Three things about it are decisions rather than implementation
detail, and all three constrain future work.

**The link is a bearer credential.** Whoever holds it can answer on behalf of a
club member. It travels through a third party, sits in somebody's phone, and is
never behind a login.

**Manual distribution is prohibited.** The locked owner decision, restated in
LAN-90 and LAN-92, is that copying, sending or posting an invitation by hand is
not an MVP, pilot or fallback path. That is a rule about what the system may
_offer_, and a rule stated only in prose is one a later screen quietly breaks.

**The provider is a choice that may be revisited.** LAN-92 selected direct Meta
Cloud API access. LAN-90's operator surface is deliberately provider-neutral —
queued, attempted, delivered, failed, retryable — and the automated email and
calendar fallback is already named as policy.

## Decision

### The token is stored only as a hash, and only one is live

At least 256 bits from `crypto.randomBytes`, URL-safe. The URL carries no person,
event or invitation identifier and no structure from which one could be inferred.
`public.rsvp_access_tokens` stores the SHA-256 digest and a **check constraint
admits only 64 lowercase hex characters**, so storing the plaintext is refused by
the database rather than merely avoided by the service layer.

A partial unique index permits at most one token per invitation that is neither
revoked nor superseded. Reissue supersedes its predecessor in the same
transaction, so there is no instant at which two are live.

**The plaintext is unrecoverable by design.** Nothing can read an issued link
back — not an operator, not a support path, not a database query. Two
consequences follow and are accepted:

- A token can only be minted at the moment it is about to be sent, so minting
  belongs to the delivery attempt rather than to the approval transaction. The
  guarantee LAN-78 asks for — every invitation created by approval gets a link —
  holds because approval triggers dispatch automatically.
- Every repair is a reissue. There is no resend, because there is nothing to
  resend.

### Acceptance by the provider is not delivery

Proven against Meta's test number on 13 August 2026: a free-form message to a
recipient outside the 24-hour customer-service window was accepted with HTTP 200
and never delivered; the same recipient received an approved template
immediately.

So `public.delivery_attempts` records that the provider accepted a message and
holds the provider's message identifier, and `public.delivery_results` — the
frozen model's existing table, unchanged — records what actually happened, only
ever from a callback. The operator sees **Attempted**, not **Delivered**, until
one arrives. Treating the 200 as success would have reported that undelivered
message as delivered.

This also fixes the shape of production: an event invitation is always
business-initiated, so **production is template-only**, and the club needs an
approved template before any real send.

### Result and retryability are separate axes

A refusal the provider will never accept — a dead credential, a number that is
not on WhatsApp, an unapproved template — is recorded as `rejected` and shown as
**Failed** however many attempts remain, because telling an operator to press
Retry on it is wrong. Whether a retry is _offered_ is a different question,
answered by the attempt ceiling, because a human may have fixed the cause. UX-51
already shows Result and Retry as separate columns.

### Everything provider-specific lives behind one interface

`src/lib/delivery/` holds the only code that knows what WhatsApp is. The
dispatcher, the operator screens and the reporting path are written against
`DeliveryProvider`, and `delivery_attempts.provider` is text while `channel` is
the existing provider-neutral enum. A second provider, or the email fallback,
implements the interface and changes nothing above it.

The transport is injected, so the adapter is exercised without a network.

### No manual path is built, and that is a scope decision

LAN-78 says manual copying, sending or posting "is not an MVP, pilot or fallback
path", `docs/ux/slice-ux.md` says "there is no manual send or post control", and
the acceptance criterion is that nothing "treats manual WhatsApp sending as
completion". Each of those is about what we build and what the screens offer. An
operator with a link and a phone can obviously send it by hand; no software
prevents that, and none of these sources asks it to.

So the guarantee is proportionate to the sentences that state it.
`delivery_attempts` carries `check (channel <> 'manual')`, so an attempt this
system makes can never be a manual one. `tests/no-manual-delivery.test.ts` holds
the other two halves: the service exports no function that would perform one and
writes no manual channel or outcome, and no runbook instructs a human to send by
hand as a step. The screens are covered as ordinary UX conformance, by the
control inventory in the delivery screens' own test.

An earlier draft read this as an invariant to be defended against a hostile
edit — a URL-scheme scan across every application file, a ban on absolute URLs
in the delivery sources, an inventory reaching pages that are not delivery
screens. Six rounds of independent review spent defeating and re-hardening it,
none of which protected anything the sources actually promise. That apparatus is
removed deliberately, and this paragraph exists so it is not reintroduced.

`delivery_outcome`'s existing `manual` value is untouched. It records that a
human contacted somebody, with their name against it — a different and
legitimate fact, and one the seeded dataset contains on purpose.

### The test affordances cannot exist in a deployed environment

Proving the adapter against Meta's test number needs two things production must
never have: a recipient override (the club's synthetic roster uses Ofcom's
reserved drama range, which is unroutable) and free-form text (the club's
template did not exist yet).

Both are read **only when the configured application base URL is a loopback
host** — parsed, not pattern-matched. Not `NODE_ENV`, which a deployment can set
by accident, and not a feature flag somebody could turn on: a deployment that
tells the world where to reach it cannot also be a loopback deployment. In any
other environment they resolve to "no override, template mode" whatever the
environment says, and a test asserts exactly that with a fully populated
environment and a deployed base URL.

### Configuration is environment-only, and absence is a refusal

No hard-coded host and no hard-coded secret. A missing setting produces a failed,
retryable attempt naming the **variables** that are absent — never their values —
and sends nothing. Outbound and webhook configuration resolve separately, because
an outbound-only deployment is exactly what the non-production test path is while
LAN-93 still owes a public endpoint.

### Inbound callbacks are verified before they are read

The webhook route reads the raw body, verifies `X-Hub-Signature-256` over those
exact bytes with a timing-safe comparison, and only then parses. Verifying a
re-serialised body cannot work — the signature is over bytes — and a route that
parses first appears correct until the provider reorders a key.

Deduplication is a unique constraint on `(provider, provider_event_id)`, not a
check-then-act, because two copies can arrive concurrently on two instances. A
`delivery_callbacks` row is written in the same transaction that applies it and
carries its own verdict, and a check constraint admits only verified rows — so
"nothing unsigned is ever stored" is provable by reading rows.

## Consequences

**Good.** A leaked database gives an attacker no usable RSVP link. One live token
per invitation is a constraint rather than a convention. The manual-send
prohibition is enforced by the schema, not remembered. The provider can be
replaced without touching the operator surface. An unconfigured or misconfigured
deployment fails visibly and safely instead of appearing to send.

**Bad.** No link can ever be recovered, so an operator who needs to help somebody
in real time can only reissue — which invalidates whatever that person is
holding. Accepted-but-unconfirmed messages sit at **Attempted** indefinitely
until webhooks exist, which will look like a stall until LAN-93 lands. And the
loopback guard means the live test path can never be exercised against a deployed
environment, so the deployed adapter's first real send is its first real proof.

**Also bad.** Three new tables for what is conceptually one feature. The
alternative was widening `delivery_outcome` to carry an intermediate state, which
is a frozen-model change, or storing the provider's message identifier on
`notification_jobs`, which cannot represent more than one attempt.

## Alternatives considered

- **Mint the token inside the approval transaction.** Rejected: the plaintext
  cannot be stored, so a token minted there could never be turned into a link and
  the dispatcher would supersede it immediately anyway.
- **A dynamic URL button in the Meta template**, with the base URL held by Meta.
  Rejected: it splits the application's address between two systems, and the
  working agreement requires the application to own its base URL.
- **Encrypt the token rather than hash it**, so support can read a link back.
  Rejected: it converts an unrecoverable secret into a recoverable one, and the
  operational need it serves is exactly the manual-send path this issue removes.
- **Treat a provider 2xx as delivered.** Rejected on evidence, on the day.

## Decision history relocated from source (LAN-300)

### src/lib/brand.ts — `TOKEN_LINK_SENTENCE`/`TOKEN_LINK_METADATA` (LAN-269 item 5).

> `/rsvp/[token]`, `/me/[token]`, `/a/[token]` and `/e/[token]` are the links
> the club actually sends, and a link preview is not shown to the recipient: it
> is shown to **everyone in the chat**, rendered from a crawler's fetch, and it
> survives in the transcript. Anything the card carries is disclosed to that
> whole audience, forever.
>
> LAN-269 permits "at most the event's name and date" here. This takes less
> than it is allowed, for two reasons that are not about caution:
>
> - **A card that varies is an oracle.** To name the event, the card has to
>   resolve the token during `generateMetadata`. A live token would then
>   unfurl differently from a revoked, expired or invented one, and LAN-90's
>   uniform terminal response — which the page itself goes to some trouble to
>   preserve, down to padding its own timing — would be readable from a chat
>   bubble by anyone who ever saw the message.
> - **A card that resolves is a database read on an unauthenticated path,**
>   performed for every crawler that ever sees the link, and the routes have
>   just been made side-effect-free precisely so a crawler's fetch costs
>   nothing and changes nothing.
>
> `robots` is belt and braces. These pages are not linked from anywhere a
> search engine can reach, and a token is unguessable, but a player pasting
> their own link into a public forum should not be able to get it indexed.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/rsvp.ts — module header

> The player's own RSVP, answered through a signed link. LAN-79.
>
> ## The one unauthenticated write in the application
>
> Everything else in this codebase writes on behalf of a verified operator
> resolved from a session. This module writes on behalf of whoever holds a
> 256-bit token, which is a genuinely different trust model: the token _is_ the
> authorization, there is no second factor, and the holder is never asked who
> they are. Two consequences run through every function here.
>
> First, **the token is re-resolved inside the writing transaction**, never
> trusted from the render that produced the form. A page rendered at 19:59 and
> submitted at 20:01 must be refused, and the only way to guarantee that is to
> ask again while holding the transaction that would do the writing. The read
> path and the write path therefore both go through `resolveRsvpTokenIn`, and
> neither takes an invitation id from the browser.
>
> Second, **the actor is a mechanism, not a person**. `audit.ts` requires an
> actor and refuses to guess one; a token holder is not a verified person, so
> these rows carry `actorLabel` naming the channel. Writing the invitee's
> person id there would assert an identity the token never proved.
>
> ## Two different times, kept apart
>
> `invitations.expires_at` is the **response deadline**: it decides when an
> unanswered invitation becomes something the club chases, and it is displayed
> to the player. It is not a cutoff — a late answer is still an answer, and the
> invitation moves `expired` → `responded` when one arrives.
>
> **Event start is the cutoff**, and it is hard. After it this module writes
> nothing at all, whatever the token still says. That decision is not taken
> here: `resolveRsvpTokenIn` already refuses to call such a token writable, and
> this module has no path that second-guesses it.
>
> ## Append-only, by construction
>
> A change of answer inserts another row. Nothing here updates or deletes a
> response, and the database would refuse it if something tried — `service_role`
> holds only `select, insert` on `rsvp_responses`. The standing answer is
> whatever `public.current_rsvp` says it is.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/rsvp.ts — stopChasingIn doc

> Stops chasing one person about one event. LAN-169, `REQ-chase-stopped`.
>
> ## Why this is a named function rather than four lines in three places
>
> "An answer arrived, so stop chasing" was inlined twice and shared nowhere:
> `recordSignedLinkResponse` below cancelled pending jobs for the invitation,
> and `cancelEvent` in `event-amendment.ts` did the event-level equivalent.
> There was no third place because there was no third answer path — and
> `WP-record-in-person` is adding one, an operator recording an answer somebody
> gave them in person.
>
> The requirement is not "each path cancels jobs". It is that an answer **from
> any source** cancels that person's pending player-facing jobs and clears an
> un-actioned nonresponse flag **in the same transaction**. Three copies of that
> cannot satisfy it, because the guarantee is that they are identical and three
> copies are only ever identical until one of them is edited.
>
> So there is one function, it takes the transaction, and every answer path
> calls it.
>
> ## What "player-facing" excludes, and why the distinction is load-bearing
>
> The invitation and the reminders are chases addressed to the player, and an
> answer makes every one of them pointless. An **escalation** is not: it is a
> message about players, to a committee officer, and one person answering does
> not withdraw it. A cancellation notice and a schedule-change notice are not
> chases at all — they are things the club owes the invitee whatever they said.
>
> Cancelling by `invitation_id` alone would have caught all of them, because an
> escalation carries no invitation and the notices do. So the predicate names
> the job types that are chases rather than the ones that are not, which fails
> safe when a seventh type is added: a new job type is not silently cancelled by
> somebody answering.
>
> ## Why `processing` is left alone
>
> It is claimed and in flight. Racing the dispatcher for it would produce a job
> that is both cancelled and delivered, and the dispatcher's own idempotency
> owns that case. The player receiving one reminder they no longer needed is a
> far smaller wrong than the club's records saying a message was cancelled when
> somebody's phone is holding it.
>
> ## Why the flag is cleared here and not by a sweep
>
> `REQ-one-flag-per-threshold`: a flag clears by resolution, never by time.
> Nothing expires it, and the record that the club escalated stays readable —
> this writes `resolved_at`, and `service_role` holds no `delete` on that table,
> so "remains readable in history once cleared" is a property of the grant.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/rsvp.ts — recordAnswerIn, information-only-refusal removed comment

> The refusal that used to be here — "this event is for information only, so
> there is nothing to respond to" — went with `solicits_response`. D23
> removed the flag: everyone sent an event is expected to answer, and whether
> the club expects them to be there is mandatory-or-optional, which is a
> different question. There is no longer an event a signed link can reach
> that has nothing to answer.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/rsvp.ts — recordOperatorRsvpResponse doc

> Records what an operator was told in person — W3
> (`missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/workflows/W3-record-an-answer-somebody-gave-you-in-person.md`)
> and its acceptance, LAN-170.
>
> ## What this does not do
>
> **It never refuses because a prior _operator_ answer already exists.**
> Two operators racing the same never-answered invitation, and both
> recording before either page reloads, is the workflow's own named
> exception — "both are kept in order; the latest stands, and the
> disagreement is visible rather than resolved" — not a case this function
> is asked to prevent.
>
> **It never checks whether the event has started.** `T03-gap-operator-correction`
> names the post-start correction as this workflow's, deliberately unlike the
> signed-link path above, which `resolveRsvpTokenIn` hard-cuts at event start.
> A post-start recording still writes here; it schedules no job and sends no
> message because nothing in this function does either of those things.
>
> ## What it does refuse
>
> - an invitation that does not belong to `eventId`, or does not exist —
>   `NotFound`, the same shape as a mistyped id anywhere else in this layer;
> - a withdrawn invitation (`INVITATION_WITHDRAWN_RULE`) — there is nothing
>   left to answer;
> - an invitation that already carries the _player's own_ answer
>   (`OPERATOR_CANNOT_SUPERSEDE_PLAYER_RULE`) — `DEC-no-supersede`, Brian,
>   25 August 2026: "We're not building this into the workflow. It's too
>   much. Cut it." `RecordAnswerControl` already offers itself only against
>   a row with no answer at all, but that render is a courtesy, not the
>   boundary — this check is what actually enforces it, re-checked inside
>   the same transaction that holds the invitation locked, so a player's
>   answer landing between this page's render and its submit is caught
>   rather than silently overwritten. A prior _operator_ answer is not this
>   case; see above;
> - a `no` with no reason, in the operator's own words rather than W2's
>   default (`NO_REQUIRES_A_REASON_RULE`) — R5 and the database constraint
>   have always required this; nothing here is a new rule;
> - a `respondedAt` that cannot be parsed, that is later than now, or that
>   predates the invitation. **These three are enforced only here** — no
>   migration ships with this package, so there is no database constraint
>   backing them the way there is for the reason requirement. That is
>   recorded as a limitation in the pull request.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/rsvp.ts — DEC-no-supersede re-check inline comment

> DEC-no-supersede. Checked here, inside the transaction that already
> holds `invitations` locked `for update` above, so a player answering
> through their own signed link between this page's render and this
> submit is not a race this check can lose — `recordSignedLinkResponse`
> takes the same row lock before it inserts, so whichever of the two
> transactions gets here second sees the other's committed write. A
> prior _operator_ answer does not trip this: two operators disagreeing
> over a never-answered invitation is the workflow's own named
> exception, and stays governed by "both are kept in order; the latest
> stands" rather than this refusal.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.

### src/lib/services/rsvp.ts — provenance inline comment

> Provenance lives in the audit trail and nowhere else — Brian's
> amendment of 25 August 2026 to the 19 August decision. The row this
> produces reads exactly like a player's own answer; who typed it and
> when the player actually said it live here instead.

Relocated from a source comment by LAN-300; the source keeps a one-line pointer.
