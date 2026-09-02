-- LAN-206 — WP-recruit-forms, mission M-RECRUITMENT, epoch E-4.
--
-- One gap, verified against the live catalogue (not the migration files) on
-- 2026-09-02: `person_access_tokens` has no way to say what a credential is
-- *for*. Its own comment already names the deliberate fact this runs into —
-- "a person legitimately holds many one-time answer tokens at once — one per
-- invitation they have been sent" — so the existing partial unique index
-- (`person_access_tokens_one_live_per_person_season`, scoped to `not
-- single_use`) covers only the durable, season-scoped page credential and
-- says nothing about anything else the table might one day hold. Nothing in
-- the schema stops two, ten, or a hundred recruitment-interest links standing
-- open for one person at once, because nothing records which *purpose* a row
-- was minted for.
--
-- `REQ-two-questionnaires`'s "at most one open request per person, ever" and
-- W4's own core-decisions table ("Shared, and the rule that makes it shared
-- is one open request per person, ever — which only holds if the substrate
-- enforces it rather than each caller") need exactly that: a queryable tag,
-- and a constraint keyed on it, so Missions 7 and 8 inherit the same
-- guarantee for their own signed-link asks without re-deriving it or
-- reaching for a caller-supplied flag — the shape Brian rejected for the
-- cycle's own welcome/interest split (`Q-welcome-completion-predicate`: "a
-- caller-supplied flag makes the policy each door's to remember").
--
-- ## Why this is a durable credential, not a single-use one
--
-- Questionnaire B's own Done-when is explicit: "a recruit answering twice
-- supersedes the earlier answer, which is kept" and W4's exceptions name the
-- same visit twice, answered twice, changed once. So the link this migration
-- backs has to keep resolving across repeat visits, exactly like the
-- player-page credential this table already carries — never a one-shot
-- secret that dies the moment it is used once. The one thing that ends it is
-- a fresher one super­seding it (the ask's link goes dead once the reminder
-- mints its own), which is `revoked_at`, already the table's own mechanism.
--
-- ## Why a new column and not a new table
--
-- `person_access_tokens` is already the one place a signed-link credential's
-- digest lives, for exactly the reason its own creating migration gives:
-- "the same secret material with the same storage rule." A second table
-- would duplicate the digest-only storage rule, the revocation shape and the
-- reissue idiom for no reason this package can find. `purpose` is nullable
-- and defaults to nothing: every row this migration does not mint — every
-- existing durable player-page credential and every RSVP one-time answer
-- token — keeps `purpose is null` and is untouched by the new index below,
-- so no event invitation's behaviour changes.
--
-- ## Why the vocabulary is a type, not free text
--
-- The same reason every other closed vocabulary in this schema is a type
-- rather than a text column the uniqueness below would be keyed on: a free
-- column would let two spellings of one purpose stand open together, which
-- is exactly what the constraint exists to forbid. One value today
-- (`recruit_interest_request`, Questionnaire B's own ask/reminder pair,
-- LAN-206) — Missions 7 and 8 add their own values later, as a forward-only
-- migration each, never a caller-chosen string.

create type public.person_access_token_purpose as enum (
  'recruit_interest_request'
);

comment on type public.person_access_token_purpose is
  'What a person_access_tokens row is for, beyond the player-page credential and the RSVP one-time answer token the table already carried. Null for both of those — this type changes neither. Every later signed-link ask (Missions 7, 8) adds its own value here rather than re-deriving the one-open-request rule.';

alter table public.person_access_tokens
  add column purpose public.person_access_token_purpose;

comment on column public.person_access_tokens.purpose is
  'Tags a credential with what it is for, so the one-open-request constraint below can be enforced without knowing the plaintext. Null for the durable player-page credential and for an RSVP one-time answer token, neither of which this column changes.';

-- At most one OPEN (unrevoked) tagged credential per person per purpose,
-- ever — the substrate `REQ-two-questionnaires` and W4 both name, on exactly
-- `person_access_tokens_one_live_per_person_season`'s own shape one section
-- up, keyed on `purpose` instead of `season_id`. "Ever" is deliberate and is
-- why this index carries no season predicate: the request is the recruit's,
-- not one season's.
--
-- Partial on `purpose is not null` and `revoked_at is null`: the durable
-- player-page credential and every RSVP one-time answer token (both
-- `purpose is null`) never touch this index, and a superseded row drops out
-- the moment it is revoked — which is what makes the mint path's own
-- revoke-then-insert (the same reissue idiom `issuePersonTokenIn` already
-- uses for the player-page credential) safe under this constraint rather
-- than blocked by it.
create unique index person_access_tokens_one_open_purpose_request
  on public.person_access_tokens (person_id, purpose)
  where purpose is not null and revoked_at is null;

-- No RLS or grant change: `person_access_tokens` already enables RLS and
-- already revokes every privilege from anon/authenticated/service_role bar
-- the narrow server grant its creating migration set — adding a nullable
-- column to an existing table inherits that posture unchanged, and this
-- migration adds no new table for it to diverge from.
