-- LAN-132 (mission M-OPERATOR-ADMIN-WITHOUT-SQL, WP-assignment): the one fact
-- the administrator email re-home flow needs and the table cannot already
-- derive.
--
-- `REQ-rehome-email`: "for lost or compromised email, an authorized
-- administrator disables the old login path, records a reason, sends a secure
-- verification link to an unused replacement email and keeps the account in
-- Email change pending until verification."
--
-- ## Why exactly one column
--
-- `20260819120000_operator_invitation_state.sql` gave `deriveOperatorAccountState`
-- four of its five inputs from stored columns and left the fifth —
-- `emailChangePending` — as a caller-supplied argument, with the note that "the
-- seam is a named parameter rather than a column this package guessed the shape
-- of". This is the package that writes it, so this is where the shape is
-- decided.
--
-- One timestamp, and deliberately not more:
--
--   * **The replacement address is not a new column.** The flow moves
--     `login_email` to the replacement address as its first act — that *is*
--     disabling the old login path, because the old address then signs in
--     nowhere and receives no reset link. A second column holding "the address
--     we are moving to" would be a copy of `login_email` that can disagree with
--     it, and there is no moment at which the two would legitimately differ.
--
--   * **The reason is not a new column.** `REQ-append-only-audit-evidence`
--     already requires it, `administration.operator.email_rehome_started`
--     carries `reasonRequired: true`, and `public.audit_events.reason` is where
--     it is stored — with the actor, the authority held at the time and the
--     operating year around it. `operator_accounts.disabled_reason` is the
--     precedent for the other shape and is *not* followed here: that column
--     predates the ledger by a mission, and duplication register D9 and
--     `DEC-audit-boundary` both refuse a second copy of history shaped for one
--     screen. The current state needs to know *that* a re-home is pending; why
--     it was started is history, and history has a home.
--
--   * **The previous address is not a new column.** It is on the
--     `email_rehome_started` event's detail, which is where "what was it
--     before?" is asked and answered for every other address change in this
--     mission (`administration.operator.invitation_corrected` does exactly the
--     same).
--
-- ## What null means, and what it does not
--
-- Null is "no re-home in flight", which covers both "never had one" and
-- "verified". Verification clears the column — it does not stamp a second one —
-- because the account is then Active, and `administration.operator.email_rehome_verified`
-- is the durable record that it happened and when.

alter table public.operator_accounts
  add column email_rehome_pending_at timestamptz;

alter table public.operator_accounts
  -- A re-home moves the address this login signs in with, so there has to be
  -- one. Reachable only for a row created before `login_email` existed, and
  -- refused rather than left to produce an account pending a verification of
  -- nothing.
  add constraint operator_accounts_rehome_needs_a_login_email check (
    email_rehome_pending_at is null or login_email is not null),

  -- A re-home presupposes credentials to lose. An account whose invitation has
  -- never been taken up is corrected and resent — that flow already exists,
  -- already refuses an activated account, and already records why. The two are
  -- the same shape from opposite ends, and this constraint is what keeps them
  -- from overlapping: the service refuses it in the club's words, and a caller
  -- that found another way in is refused here.
  add constraint operator_accounts_rehome_follows_activation check (
    email_rehome_pending_at is null or activated_at is not null);

comment on column public.operator_accounts.email_rehome_pending_at is
  'When an administrator started the email re-home flow (LAN-132, REQ-rehome-email). Non-null is the Email change pending state: the old address has already been replaced by the address the verification link went to, and sign-in is refused until the holder follows it. Cleared by verification; the reason and the previous address live on the audit events.';

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
-- Nothing to re-grant, and no RLS statement to repeat.
-- `20260811090000_operator_accounts.sql` created this table with row level
-- security enabled and zero policies, revoked everything from `anon`,
-- `authenticated` and `service_role`, and granted back `select, insert, update`
-- and deliberately no `delete`. A column added to a table inherits that table's
-- privileges, so the posture is unchanged and no browser-facing role gains
-- anything by this file.
