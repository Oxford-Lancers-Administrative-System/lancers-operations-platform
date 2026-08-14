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

### There is no manual path, and its absence is structural

`delivery_attempts` carries `check (channel <> 'manual')`, so an attempt this
system makes can never be a manual one. No service function records one, no
screen offers one, and `tests/no-manual-delivery.test.ts` scans the source, the
documents and the pilot scripts for a copy-link, send-manually, post-to-group or
mark-as-sent affordance.

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
