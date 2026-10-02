-- LAN-459 — a link of its own for an operator's details form.
--
-- Brian, 2 October 2026: a coach or other operator the club has only a phone
-- number for is seated with no account and sent one WhatsApp message with a
-- link to the operator details form. Saving the form creates their account
-- and sends the sign-in invitation to the email they gave.
--
-- That link is a durable, season-scoped `person_access_tokens` credential like
-- every other message link (LAN-343), and it needs its own purpose so that it
-- opens the operator details form and nothing else: a player's onboarding
-- credential must not open it, and it must not open a player's onboarding
-- questionnaire. The one WhatsApp template it travels in
-- (`onboarding_chase_v2`, already approved) carries a button fixed to the
-- `/onboarding/` path, so `/onboarding/<t>` resolves both `onboarding_details`
-- and `operator_details`, each to its own page, and nothing else.
--
-- The link is revoked when the form is saved (`revokePersonTokenIn`, purpose
-- `operator_details`), so it is single-purpose and dies on save — the risk
-- Brian accepted on the ticket is bounded to the window before that.
--
-- Forward-only, one value, the way this vocabulary has always grown
-- (`20260918090000_message_link_purposes.sql`). No row is written with the new
-- value here.
alter type public.person_access_token_purpose add value if not exists 'operator_details';

comment on type public.person_access_token_purpose is
  'What a person_access_tokens row is for. Null is the player''s own durable events-page credential (REQ-person-token) and the RSVP one-time answer token; every other signed-link journey carries its own value, and a route resolves only its own purposes (LAN-343). operator_details opens the operator details form on /onboarding/<t> (LAN-459).';

-- No table, column, view, grant or RLS change: `person_access_tokens` keeps the
-- posture its creating migration set, and the uniqueness rules that exist are
-- scoped to other purposes (`person_access_tokens_one_open_interest_request`).
