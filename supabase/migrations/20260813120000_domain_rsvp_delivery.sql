-- LAN-78: secure RSVP links, and the durable evidence of one automated
-- delivery attempt.
--
-- Three tables, none of them a club concept. The frozen model already carries
-- the club's side of this — an invitation exists whether or not it is ever
-- delivered (invariant P4), and delivery truth lives in `delivery_results`
-- alone (invariant M4). What it has no home for is the machinery that turns a
-- `notification_jobs` row into a message somebody receives:
--
--   * `rsvp_access_tokens`   — the unguessable link, stored only as a hash.
--   * `delivery_attempts`    — one outbound attempt, and the provider's
--                              identifier for it, recorded BEFORE the provider
--                              answers so a callback can be matched to a job.
--   * `delivery_callbacks`   — every inbound provider callback whose signature
--                              verified, deduplicated by the provider's own
--                              event identifier.
--
-- `delivery_results` is unchanged and remains the authoritative outcome. These
-- three are how a result comes to be written, not a second place to read one.
--
-- Nothing here names WhatsApp. `provider` is text and `channel` is the existing
-- provider-neutral enum, so the operator surface and the reporting path stay
-- exactly as provider-neutral as LAN-90 requires. The Meta Cloud API lives
-- behind `src/lib/delivery/`, in TypeScript, where a provider belongs.

-- ---------------------------------------------------------------------------
-- RSVP access tokens
-- ---------------------------------------------------------------------------

-- Brian's decided token behaviour, in full: at least 256 bits from a
-- cryptographically secure source, URL-safe; no identifier of any kind in the
-- URL; stored only as a SHA-256 hash; bound to exactly one invitation; repeat
-- access permitted and counted; a hard expiry; reissue supersedes and
-- immediately invalidates its predecessor; at most one live token per
-- invitation.
--
-- The single most important line in this table is the shape check on
-- `token_hash`. A plaintext token is 43 URL-safe characters and a SHA-256
-- digest is 64 lowercase hex ones, so a bug that stored the token itself is
-- rejected by the database rather than discovered later by reading rows. It is
-- the one half of "never store plaintext" that does not depend on the service
-- layer being correct.
create table public.rsvp_access_tokens (
  id uuid primary key default gen_random_uuid(),

  -- Invariant P4's boundary: a token belongs to an invitation and cannot exist
  -- without one. `restrict` rather than `cascade` because deleting an
  -- invitation is not something this slice does, and a token vanishing quietly
  -- with it would erase the record that a link was ever issued.
  invitation_id uuid not null references public.invitations (id) on delete restrict,

  token_hash text not null,

  issued_at timestamptz not null default now(),
  issued_by_person_id uuid references public.people (id) on delete restrict,

  -- The hard expiry, stamped at issue. The service layer sets it to the event's
  -- start instant, so a link dies when the thing it is about begins — and it
  -- keeps that instant even if the event is later moved, which is the safe
  -- direction. Whether the event has *since* started is evaluated separately
  -- and live, against the event row, at every resolution.
  expires_at timestamptz not null,

  revoked_at timestamptz,
  revoked_reason text,

  -- Reissue. The predecessor is stamped in the same transaction that inserts
  -- its replacement, so there is no instant at which both are live.
  --
  -- The self-reference is DEFERRABLE INITIALLY DEFERRED, and that is load-
  -- bearing rather than decorative. `one_live_per_invitation` below is a plain
  -- partial unique index, checked per statement, so the successor cannot be
  -- inserted while the predecessor is still live — the reissue has to supersede
  -- first and insert second. Superseding first means naming a successor that
  -- does not exist yet, which only a deferred foreign key permits. The insert
  -- in the same transaction satisfies it before commit; a transaction that
  -- superseded a token and never inserted its replacement is refused at commit,
  -- which is the guarantee that matters.
  superseded_at timestamptz,
  superseded_by_token_id uuid
    references public.rsvp_access_tokens (id) on delete restrict
    deferrable initially deferred,

  last_used_at timestamptz,
  use_count integer not null default 0,

  created_at timestamptz not null default now(),

  constraint rsvp_access_tokens_hash_unique unique (token_hash),

  -- 64 lowercase hex characters, and nothing else, can be stored here.
  constraint rsvp_access_tokens_hash_is_a_sha256_digest check (
    token_hash ~ '^[0-9a-f]{64}$'),

  -- A token issued for an event that has already started would be dead on
  -- arrival. Refusing it here means the dispatcher cannot create one.
  constraint rsvp_access_tokens_expires_after_issue check (expires_at > issued_at),

  constraint rsvp_access_tokens_use_count_non_negative check (use_count >= 0),
  constraint rsvp_access_tokens_use_is_dated check (
    (use_count = 0) = (last_used_at is null)),

  -- A withdrawn link is a decision somebody took, and an unexplained one is a
  -- decision nobody can review later. The same rule the frozen model applies to
  -- a withdrawn or cancelled event.
  constraint rsvp_access_tokens_revocation_is_explained check (
    revoked_at is null or btrim(coalesce(revoked_reason, '')) <> ''),

  -- Supersession is both columns or neither: a token marked superseded with no
  -- successor is an invalidation pretending to be a reissue.
  constraint rsvp_access_tokens_supersession_is_paired check (
    num_nonnulls(superseded_at, superseded_by_token_id) <> 1),
  constraint rsvp_access_tokens_supersession_is_not_circular check (
    superseded_by_token_id is null or superseded_by_token_id <> id)
);

-- "At most one live token exists per invitation", as a constraint rather than
-- as a convention the service layer is trusted to keep.
create unique index rsvp_access_tokens_one_live_per_invitation
  on public.rsvp_access_tokens (invitation_id)
  where revoked_at is null and superseded_at is null;

-- The player's path: one hash lookup, on every visit to /rsvp/[token].
create index rsvp_access_tokens_invitation_idx on public.rsvp_access_tokens (invitation_id);

comment on table public.rsvp_access_tokens is
  'One unguessable RSVP link. The plaintext token is never stored, never logged and never read back — only its SHA-256 digest is here, and the shape check makes storing the token itself impossible.';
comment on column public.rsvp_access_tokens.token_hash is
  'SHA-256 of the URL-safe token, lowercase hex. Never the token.';
comment on column public.rsvp_access_tokens.expires_at is
  'Hard expiry stamped at issue — the event start instant. The live "has the event started?" question is answered against the event row, not from here.';

-- ---------------------------------------------------------------------------
-- Delivery attempts
-- ---------------------------------------------------------------------------

-- Why this exists at all, given `delivery_results`.
--
-- `delivery_results.outcome` is the frozen model's four-value vocabulary —
-- delivered, failed, rejected, manual — and every one of them is terminal. A
-- provider that accepts a message and reports its fate asynchronously produces
-- a fifth state the enum deliberately does not have, and widening a closed
-- vocabulary is a domain-model change, not an implementation detail.
--
-- So the intermediate state lives in its own row instead: an attempt is
-- requested, then accepted with the provider's message identifier, then
-- concluded when a callback says what happened. `delivery_results` is written
-- once, at the conclusion, and stays exactly what invariant M4 says it is.
--
-- The other thing this table does is make a callback matchable. A provider
-- callback names a message identifier and nothing else; without a row holding
-- that identifier, an inbound "delivered" could not be attached to a job.
create table public.delivery_attempts (
  id uuid primary key default gen_random_uuid(),

  notification_job_id uuid not null references public.notification_jobs (id) on delete restrict,
  attempt_number integer not null,

  channel public.notification_channel not null,
  provider text not null,

  -- Null between requesting and acceptance, and permanently null for an attempt
  -- the provider refused.
  provider_message_id text,

  -- Which link this attempt carried. The token is reissued per attempt — the
  -- plaintext exists only in memory for the length of one send, so a retry can
  -- never resend a link it is unable to reconstruct.
  rsvp_access_token_id uuid references public.rsvp_access_tokens (id) on delete restrict,

  requested_at timestamptz not null default now(),
  accepted_at timestamptz,
  concluded_at timestamptz,

  -- Safe, provider-neutral summary. Never the provider's raw body: that text
  -- routinely quotes the recipient's number.
  failure_reason text,

  constraint delivery_attempts_one_per_job_attempt unique (notification_job_id, attempt_number),
  constraint delivery_attempts_attempt_number_positive check (attempt_number >= 1),
  constraint delivery_attempts_provider_not_blank check (btrim(provider) <> ''),

  -- An accepted attempt is one the provider gave an identifier for. Without
  -- this, an attempt could be recorded as accepted and never be matchable to
  -- the callback that concludes it.
  constraint delivery_attempts_acceptance_names_its_message check (
    accepted_at is null or provider_message_id is not null),

  -- Manual sending is not a delivery path in this slice, stated where no code
  -- can talk its way around it. A manual contact remains recordable in
  -- `delivery_results`, which is a different thing: a record that a human did
  -- something, not an attempt this system made.
  constraint delivery_attempts_are_never_manual check (channel <> 'manual')
);

-- The callback's only handle. Partial, because an attempt the provider refused
-- has no identifier and several such rows must be able to coexist.
create unique index delivery_attempts_provider_message_unique
  on public.delivery_attempts (provider, provider_message_id)
  where provider_message_id is not null;

create index delivery_attempts_job_idx
  on public.delivery_attempts (notification_job_id, attempt_number);

comment on table public.delivery_attempts is
  'One outbound attempt. Records the provider message identifier at acceptance so an asynchronous callback can be matched to a job; the terminal outcome is written to delivery_results, which remains authoritative (invariant M4).';

-- ---------------------------------------------------------------------------
-- Delivery callbacks
-- ---------------------------------------------------------------------------

-- Deduplication, as a unique constraint on the provider's own event identifier.
-- Providers retry callbacks; Meta's documentation says so explicitly. A second
-- copy of "message X was delivered" must produce nothing at all, and the only
-- reliable place to decide that is the database, because two copies can arrive
-- concurrently on two instances.
--
-- Append-only, and inserted with its verdict already recorded: the row is
-- written in the same transaction that applies it, so there is no window in
-- which a callback is stored but unprocessed.
create table public.delivery_callbacks (
  id uuid primary key default gen_random_uuid(),

  provider text not null,

  -- The provider's identifier for this notification, not for the message. Meta
  -- sends one per status transition.
  provider_event_id text not null,
  provider_message_id text,

  -- The provider's own word, kept verbatim as evidence. It is never shown to an
  -- operator and never mapped to a domain state without going through the
  -- adapter — see `src/lib/delivery/whatsapp-cloud.ts`.
  provider_status text,

  delivery_attempt_id uuid references public.delivery_attempts (id) on delete restrict,

  signature_verified boolean not null,
  received_at timestamptz not null default now(),

  -- Set when the callback moved a job. Null with a reason when it did not —
  -- an unmatched message identifier, or a status this slice has no outcome for.
  applied_at timestamptz,
  ignored_reason text,

  constraint delivery_callbacks_one_per_provider_event unique (provider, provider_event_id),
  constraint delivery_callbacks_provider_not_blank check (btrim(provider) <> ''),
  constraint delivery_callbacks_event_id_not_blank check (btrim(provider_event_id) <> ''),

  -- Nothing unsigned is ever stored. The route verifies the signature before it
  -- parses the body, so an unverified callback never reaches this table — and
  -- this check is what makes that provable by reading rows rather than by
  -- reading code.
  constraint delivery_callbacks_are_verified_before_they_are_stored check (signature_verified),

  constraint delivery_callbacks_unapplied_is_explained check (
    applied_at is not null or btrim(coalesce(ignored_reason, '')) <> '')
);

create index delivery_callbacks_attempt_idx on public.delivery_callbacks (delivery_attempt_id)
  where delivery_attempt_id is not null;

comment on table public.delivery_callbacks is
  'Every inbound provider callback whose signature verified, deduplicated by the provider event identifier. Append-only: a callback happened or it did not.';

-- ---------------------------------------------------------------------------
-- Row Level Security and Data API exposure
-- ---------------------------------------------------------------------------
-- ADR 0002 / ADR 0010: RLS on, zero policies, and nothing granted to a
-- browser-facing role. These three tables are the most sensitive in the schema
-- after contact details — a read of `rsvp_access_tokens` is a read of who was
-- asked to what — so the posture is the same as everywhere else and no weaker.

alter table public.rsvp_access_tokens enable row level security;
alter table public.delivery_attempts enable row level security;
alter table public.delivery_callbacks enable row level security;

revoke all on table
  public.rsvp_access_tokens, public.delivery_attempts, public.delivery_callbacks
  from anon, authenticated, service_role;

-- Tokens are updated: revoked, superseded, and counted on each use. Never
-- deleted — the record that a link existed outlives the link.
grant select, insert, update on table public.rsvp_access_tokens to service_role;

-- An attempt is updated exactly once, when the provider accepts or refuses it.
grant select, insert, update on table public.delivery_attempts to service_role;

-- Append-only: a callback arrived or it did not.
grant select, insert on table public.delivery_callbacks to service_role;
