-- LAN-343 — every message gets its own link, its own page and its own credential.
--
-- Two facts about `person_access_tokens` are wrong for the eight message
-- links the club actually sends, and both are fixed here.
--
-- ## 1. One durable credential served four different journeys
--
-- `issuePersonTokenIn` minted an untagged durable row (`purpose is null`) and
-- the scheduler put that same plaintext into two URLs at once — the onboarding
-- form and the opt-out, the sign-up form and the opt-out. One credential
-- opening several unrelated pages is the shared-credential problem LAN-206
-- already named for the recruitment questionnaire and solved with `purpose`:
-- a queryable tag, so a route can refuse every credential that was not minted
-- for it. This migration extends that vocabulary to the three remaining
-- journeys that send a person a link of their own:
--
--   * `onboarding_details`  — the onboarding questionnaire (`/onboarding/<t>`)
--   * `recruit_signup`      — the prefilled sign-up form (`/signup/<t>`)
--   * `messaging_stop`      — the opt-out surface (`/stop/<t>`)
--
-- The player's own events page (`/events/<t>`) keeps `purpose is null`: it is
-- the credential this table was created for, `REQ-person-token`'s own subject,
-- and giving it a tag would rewrite every row that already exists rather than
-- describe one.
--
-- ## 2. A link that was sent has to keep working until the season closes
--
-- `person_access_tokens_one_live_per_person_season` allowed exactly one live
-- durable credential per person per season, which is why `issuePersonTokenIn`
-- had to revoke before it inserted. The consequence was that every reissue
-- killed the link the club had already sent: a player who answered an
-- invitation in September held a dead link by October, and the onboarding
-- page's own promise — "You can leave and come back to this link" — was
-- false the moment the chase re-sent it.
--
-- Brian, 2026-09-11, decided the trade explicitly: a link that was sent must
-- keep resolving until `seasons.closed_at` is set, and a leaked link
-- therefore stays live for the season. A plaintext token cannot be recovered
-- from its digest, so a later mint can never re-send an earlier link; making
-- the earlier link keep working is the only mechanism that delivers this
-- literally, and it requires several live durable credentials per person and
-- season to coexist. So the index goes, and with it the revoke-then-insert.
--
-- The season remains the whole of the lifetime. `resolvePersonTokenIn` reads
-- `seasons.closed_at` live on every request, so closing a season really does
-- close its credentials, and `revokePersonTokenIn` is still the per-person
-- escape hatch for a leak nobody wants to wait out.
--
-- ## What is deliberately NOT relaxed
--
-- `REQ-two-questionnaires`'s "at most one open request per person, ever" is
-- Questionnaire B's own rule (LAN-206), and it is season-less on purpose --
-- the request is the recruit's, not one season's. That index therefore stays,
-- narrowed to the one purpose it was written for, so the three purposes added
-- above do not silently inherit a uniqueness rule nobody decided for them.

-- --- The three new purposes -------------------------------------------------

-- Forward-only, one value at a time: `alter type ... add value` is how this
-- vocabulary grows (the type's own comment says every later signed-link ask
-- adds its own value here). No row is written with a new value in this
-- migration, which is what keeps adding and using them in one transaction
-- from being a problem.
alter type public.person_access_token_purpose add value if not exists 'onboarding_details';
alter type public.person_access_token_purpose add value if not exists 'recruit_signup';
alter type public.person_access_token_purpose add value if not exists 'messaging_stop';

comment on type public.person_access_token_purpose is
  'What a person_access_tokens row is for. Null is the player''s own durable events-page credential (REQ-person-token) and the RSVP one-time answer token; every other signed-link journey carries its own value, and a route resolves only its own purpose (LAN-343).';

comment on column public.person_access_tokens.purpose is
  'Tags a credential with the one page it opens, so a route can refuse every credential minted for a different journey without knowing the plaintext. Null for the durable events-page credential and for an RSVP one-time answer token.';

-- --- One open request per person, for Questionnaire B only ------------------

-- Narrowed, not dropped. `person_access_tokens_one_open_purpose_request`
-- carried no season predicate because `REQ-two-questionnaires` says "one open
-- request per person, ever", and that reasoning belongs to
-- `recruit_interest_request` alone. Left as it was, the three purposes above
-- would inherit "one ever" — which would make the onboarding chase revoke the
-- welcome's link, the exact failure this migration exists to end.
drop index if exists person_access_tokens_one_open_purpose_request;

create unique index person_access_tokens_one_open_interest_request
  on public.person_access_tokens (person_id)
  where purpose = 'recruit_interest_request'::public.person_access_token_purpose
    and revoked_at is null;

-- --- Several live durable credentials per person and season -----------------

-- The new invariant, replacing "at most one live durable credential per person
-- per season": every durable credential the club has sent keeps resolving
-- until its season closes or it is revoked by name. Uniqueness moves to
-- nothing at all — `person_access_tokens_hash_unique` is what still makes each
-- credential one credential, and it is the only uniqueness a digest needs.
drop index if exists person_access_tokens_one_live_per_person_season;

-- The lookup the purpose-scoped journeys need, season-scoped where the
-- Questionnaire B index above deliberately is not: `revokePersonTokenIn`
-- withdraws one person's live credentials for one season (and, since LAN-343,
-- optionally for one purpose), and this is the index that reads.
create index person_access_tokens_live_purpose_idx
  on public.person_access_tokens (person_id, season_id, purpose)
  where revoked_at is null;

-- No RLS or grant change. `person_access_tokens` already enables RLS and
-- already revokes every privilege from anon/authenticated/service_role bar the
-- narrow server grant its creating migration set; this migration adds no
-- table, no column and no view for that posture to diverge from.
