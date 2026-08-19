-- LAN-131 (mission M-OPERATOR-ADMIN-WITHOUT-SQL, WP-invitation): the state an
-- operator invitation is in, on the identity join that already exists.
--
-- `REQ-invitation-states` names five operator states — Invitation pending,
-- Delivery failed, Active, Deactivated and Email change pending — and requires
-- that duplicate Person bindings and duplicate email addresses be refused with
-- an actionable reason, and that a delivery failure preserve the same Person
-- and the same operator account rather than producing a second one.
--
-- ## Why this is five columns and not a new table
--
-- Two of the five states are already stored. `operator_accounts.is_active`,
-- `disabled_at` and `disabled_reason` (20260811090000) are Active and
-- Deactivated, and reinstatement is already "set is_active back to true", which
-- is exactly what `REQ-invitation-states` means by "reinstatement returns the
-- same operator to Active". Nothing here changes any of that.
--
-- The remaining facts are attributes of one operator account, not of a new
-- entity: when its invitation was issued, whether the holder has since
-- established credentials, and whether the last delivery attempt is known to
-- have failed. A separate `operator_invitations` table would need a
-- one-row-per-account constraint to stay honest, which is the definition of a
-- column.
--
-- ## Why there is no send-attempt table either
--
-- `REQ-invitation-states` asks that invitation send and delivery attempts be
-- recorded, and they already are. `20260810121000_domain_reporting.sql` owns
-- `public.audit_events`, and LAN-130's vocabulary
-- (`src/lib/services/administration-events.ts`) already contains
-- `administration.operator.invited`, `…invitation_resent`,
-- `…invitation_corrected` and `…invitation_delivery_failed`, each written
-- through the single append-only writer with the actor, the authority held at
-- the time, the operating year and the before/after state.
--
-- A second attempts table would be a second copy of that history, shaped for
-- one screen, capable of disagreeing with the ledger forever afterwards —
-- which is precisely the duplication register D9 and `DEC-audit-boundary`
-- refuse. The columns below hold the *current* status; the ledger holds every
-- attempt that produced it.

alter table public.operator_accounts
  -- The address this login signs in with, and the address the invitation was
  -- sent to. Denormalised from `auth.users.email`, deliberately:
  --
  --   * the hosted runtime connects as `app_runtime`, a least-privilege login
  --     with `service_role`'s grants and no access to the `auth` schema at all
  --     (ADR 0026), so the application cannot read `auth.users` to answer
  --     "which address is this?" for an Administration list;
  --   * `REQ-invitation-states` requires a *duplicate email* refusal with an
  --     actionable reason, and a refusal that a constraint produces is one the
  --     service can translate into the club's words. Asking the Auth API and
  --     interpreting its error is the second guard, not the first.
  --
  -- Nullable, and the reason is worth stating rather than discovering: rows
  -- predating this migration are backfilled below, and every row the
  -- application creates carries it, but the local review scripts and several
  -- cross-cutting suites insert `(auth_user_id, person_id)` alone. Making the
  -- column required would have made this migration a rewrite of tests it has
  -- no business touching, and would have bought nothing — `auth.users.email`
  -- is unique in GoTrue and is the authority; this column is the readable
  -- projection of it and a second, fail-closed guard.
  add column login_email text,

  -- When the invitation was issued. Set on the first send and again on every
  -- resend or correction, so it is "when the live invitation was issued"
  -- rather than "when the account was created".
  add column invited_at timestamptz,

  -- When the holder established credentials for the first time. Null is
  -- Invitation pending — `DEC-email-authentication`: "first login establishes
  -- credentials only". Not derived from `auth.users.last_sign_in_at` for the
  -- same reason `login_email` is not read from `auth.users`.
  add column activated_at timestamptz,

  -- The last delivery attempt that is known to have failed. Cleared by a
  -- successful resend, which is what makes Delivery failed a state a
  -- correction can leave rather than a fact that accumulates.
  add column invitation_delivery_failed_at timestamptz,
  add column invitation_delivery_failure_reason text;

-- Backfill, as the migration's owner, before the constraints below. Every
-- operator account that exists today was created by a script that set a
-- password directly, so all of them are activated; `last_sign_in_at` is
-- preferred where it exists because it is the truer answer.
update public.operator_accounts oa
   set login_email  = u.email,
       activated_at = coalesce(u.last_sign_in_at, oa.created_at)
  from auth.users u
 where u.id = oa.auth_user_id;

alter table public.operator_accounts
  add constraint operator_accounts_login_email_not_blank check (
    login_email is null or btrim(login_email) <> ''),

  -- A failure that does not say what went wrong is not a record of anything,
  -- and a reason with no date is not either. Both, or neither.
  add constraint operator_accounts_delivery_failure_is_explained check (
    num_nonnulls(invitation_delivery_failed_at, invitation_delivery_failure_reason) <> 1),

  -- A delivery failure presupposes something was sent.
  add constraint operator_accounts_delivery_failure_follows_an_invitation check (
    invitation_delivery_failed_at is null or invited_at is not null);

-- One login per address. Partial, because the column is nullable above; over
-- `lower(...)` because `Clint@example.org` and `clint@example.org` are one
-- mailbox everywhere this club operates, and a second account for the second
-- spelling is exactly the duplicate `REQ-invitation-states` refuses.
--
-- Named so `src/lib/db/errors.ts` can translate it: the operator gets "that
-- address already has an operator login", not an integrity error.
create unique index operator_accounts_login_email_key
  on public.operator_accounts (lower(login_email))
  where login_email is not null;

comment on column public.operator_accounts.login_email is
  'The address this login signs in with, projected from auth.users.email because the hosted runtime login cannot read the auth schema (ADR 0026). Unique, case-insensitively, among the rows that carry it.';
comment on column public.operator_accounts.invited_at is
  'When the live invitation was issued — set on the first send and on every resend or correction. Every attempt is in the audit ledger; this is the current one.';
comment on column public.operator_accounts.activated_at is
  'When the holder first established credentials. Null is Invitation pending (DEC-email-authentication: first login establishes credentials only).';
comment on column public.operator_accounts.invitation_delivery_failed_at is
  'The last delivery attempt known to have failed, cleared by a successful resend. Delivery failure never creates a second Person or a second account (REQ-invitation-states).';

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
-- Nothing to re-grant. `20260811090000_operator_accounts.sql` already revoked
-- everything from `anon`, `authenticated` and `service_role` and granted back
-- `select, insert, update` — and deliberately no `delete`. Columns added to a
-- table inherit its table-level privileges, so the posture above is unchanged
-- and no browser-facing role gains anything. RLS remains enabled with zero
-- policies.
