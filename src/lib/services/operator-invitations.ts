import "server-only";

import { randomUUID } from "node:crypto";

import {
  assertAdministrationTarget,
  type AdministrationSubject,
} from "@/lib/auth/administration-authority";
import type { CapabilityKey } from "@/lib/auth/capabilities";
import { assertCapability } from "@/lib/auth/guards";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { looksLikeEmailAddress } from "@/lib/auth/recovery";
import {
  Conflict,
  ConstraintViolated,
  InvalidTransition,
  NotFound,
  NotPermitted,
  withTransaction,
  type Tx,
} from "@/lib/db";
import { recordAdministrationEvent } from "./administration-audit";
import type { AdministrationOperatingYear } from "./administration-events";
import {
  deriveOperatorAccountState,
  operatorAccountState,
  type OperatorAccountState,
} from "./operator-account-state";
import {
  InvitationDeliveryFailure,
  supabaseOperatorIdentity,
  type OperatorIdentityPort,
} from "./operator-identity";

/**
 * Operator invitation — LAN-131, mission M-OPERATOR-ADMIN-WITHOUT-SQL,
 * `REQ-invite-existing-person`, `REQ-invitation-states` and
 * `REQ-email-invitation-path`.
 *
 * One guided flow: find the durable Person or create a minimal one, bind at
 * most one operator login to them, give them at least one approved role in the
 * active operating year, and email them a link that lets them set a password.
 * Then the three things that happen afterwards — resend, correct-and-resend,
 * and the activation that ends the invitation.
 *
 * ## Where the authorization is, and which call it makes
 *
 * `assertAdministrationTarget()` from `@/lib/auth/administration-authority`,
 * which is the **target-level** guard, not the capability floor. Calling
 * `assertCapability(operator, "role_management")` alone is the documented
 * mistake: it answers "may this operator administer anybody?" and would let a
 * President invite somebody straight into the General Manager seat. The
 * capability floor is the first thing `assertAdministrationTarget` does, so the
 * target-aware call is strictly stronger and there is never a reason to make
 * the weaker one.
 *
 * ### Why the pure `assert…` and not the request-scoped `require…`
 *
 * `requireAdministrationTarget()` is the same rules with the actor resolved
 * from the verified session inside it — one extra network round trip to the
 * auth server. It cannot be used here, and the reason is a rule of this
 * package rather than a preference:
 *
 * > **the target's currently-effective role codes must be read inside the write
 * > transaction.** The guard reads no database; it judges a snapshot the caller
 * > supplies, and a stale or empty snapshot silently disarms every leadership
 * > rule.
 *
 * So the transaction has to be open before the guard can be given an honest
 * snapshot, and resolving a session — two HTTP calls to Supabase — from inside
 * an open transaction holds a pooled connection across the network for no
 * reason. The actor is therefore resolved by the caller, exactly as
 * `./administration-audit.ts` has every read take a `ResolvedOperator`, and the
 * same `assertAdministrationTarget` `requireAdministrationTarget` would have
 * called is called here with a snapshot read moments earlier in the same
 * transaction. `null` is accepted and refused, so "forgot to resolve" and "no
 * session" fail identically.
 *
 * Every write below asserts **twice**: once before anything is created, so an
 * unauthorized attempt costs nothing, and once inside the transaction against
 * the authoritative snapshot. The second one is the control; the first is
 * courtesy.
 *
 * ### The role code passed to the guard is the exact `roles.code`
 *
 * A role-scoped decision naming a code the catalogue does not have is refused
 * outright and nothing is normalised — `" general_manager "` is refused, not
 * trimmed. This module resolves the caller's role code against
 * `public.roles.code` **before** the guard and passes the catalogue's own
 * spelling, so a decision is judged on the seat it really concerns.
 *
 * ### A pending invitation's seat is real from the moment it is sent
 *
 * `resend_invitation` and `correct_invitation` are deliberately not
 * role-scoped: they are judged on the seats the target holds. Correction
 * redirects a credential-establishing link to an address the administrator
 * chooses, so an invitation that *conferred* a protected seat while its target
 * held nothing would be correctable by somebody who may not assign that seat.
 *
 * This module closes that by materialising the role assignment when the
 * invitation is sent, which is what `REQ-deactivate-and-reinstate` describes
 * when it says a successor "may remain Invitation pending without capabilities
 * until activation" — the assignment exists, the account does not. The seat is
 * therefore in the target's snapshot, and the leadership rules protect a
 * pending invitation exactly as they protect a sitting holder.
 *
 * One consequence has to be handled rather than assumed away: an assignment
 * dated to begin later is not *currently* effective, so a future-dated
 * President invitation would be invisible to the guard. So the snapshot for the
 * two invitation actions includes assignments that have not started yet —
 * {@link readAdministrationSubject} with `includeScheduled` — which is the
 * fail-closed direction: a seat somebody is about to hold protects them now.
 *
 * ## What is written, and what is not
 *
 * Every state change and its audit event commit together, through
 * `recordAdministrationEvent`, in the caller's transaction. There is no second
 * ledger: `REQ-invitation-states` asks that send and delivery attempts be
 * recorded, and `administration.operator.invited`, `…invitation_resent`,
 * `…invitation_corrected` and `…invitation_delivery_failed` already are that
 * record. The columns this package added hold the *current* status; the ledger
 * holds every attempt that produced it.
 *
 * ## The one thing that is not transactional
 *
 * Supabase Auth. Creating the login, sending the email and moving an address
 * are network calls that cannot be rolled back, so they are ordered so that a
 * failure leaves a state the club can act on:
 *
 *   1. **create the login** — no email, so a failure here has created nothing;
 *   2. **write every row** — and if that fails, delete the login just created,
 *      which is the only compensation in this module and applies only to a
 *      login nothing yet points at;
 *   3. **send the email** — so a delivery failure happens with the Person, the
 *      account and the assignment already committed. That is exactly what
 *      `REQ-invitation-states` requires: "delivery failure preserves the same
 *      Person and operator account and never creates a duplicate."
 */

/** The capability every action in this module stands on. */
const ADMINISTRATION_CAPABILITY: CapabilityKey = "role_management";

// ---------------------------------------------------------------------------
// What a caller supplies
// ---------------------------------------------------------------------------

/**
 * Who this invitation is for.
 *
 * `DEC-minimal-person-creation`: the flow is duplicate-checked create-or-link,
 * and the choice between them is the administrator's explicit answer rather
 * than something this module guesses from a name.
 */
export type InvitationSubject =
  | { kind: "existing"; personId: string }
  | {
      kind: "new";
      givenName: string;
      familyName: string;
      knownAs?: string | null;
      phone?: string | null;
    };

/**
 * One initial role. At least one is required before an invitation can be sent
 * (`REQ-invite-existing-person`, `DEC-minimal-person-creation`).
 */
export interface InitialRoleAssignment {
  /** An exact `public.roles.code`. Resolved against the catalogue before use. */
  readonly roleCode: string;
  /**
   * ISO date. Defaults to today; a future date is permitted, and a past date is
   * audited backdating and therefore requires a reason
   * (`DEC-assignment-dates-and-cardinality`).
   */
  readonly effectiveFrom?: string | null;
  readonly reason?: string | null;
}

export interface InviteOperatorParams {
  /** From `resolveOperatorAccess()`. `null` is refused, not defaulted. */
  readonly operator: ResolvedOperator | null;
  readonly subject: InvitationSubject;
  /** The address the invitation is sent to, and the address they sign in with. */
  readonly email: string;
  readonly roles: readonly InitialRoleAssignment[];
  /** From `invitationCallbackUrl()`. An absolute URL on a trusted origin. */
  readonly callbackUrl: string;
  /** Swapped only by tests. Defaults to the real Supabase Auth port. */
  readonly identity?: OperatorIdentityPort;
}

/** What the invitation produced. */
export interface InviteOperatorResult {
  readonly personId: string;
  readonly operatorAccountId: string;
  readonly authUserId: string;
  readonly loginEmail: string;
  /** True when this invitation minted the `people` row. */
  readonly personCreated: boolean;
  readonly roleAssignmentIds: readonly string[];
  readonly state: OperatorAccountState;
  /**
   * `false` when the invitation email could not be delivered. The Person, the
   * account and the assignments are committed either way — this says whether
   * the administrator should expect the person to receive it, or should look
   * at the address and resend.
   */
  readonly delivered: boolean;
  readonly deliveryFailureReason: string | null;
}

// ---------------------------------------------------------------------------
// Refusals, as constants, so a caller matches on the rule and a test on the words
// ---------------------------------------------------------------------------

export const PERSON_ALREADY_HAS_LOGIN_RULE = "operator_account_already_exists";
export const PERSON_ALREADY_HAS_LOGIN_MESSAGE =
  "That person already has an operator login. One person has one login, however many roles " +
  "they hold — open their operator record to give them another role, resend their invitation, " +
  "or restore their access.";

export const EMAIL_ALREADY_HAS_LOGIN_RULE = "operator_login_email_taken";
export const EMAIL_ALREADY_HAS_LOGIN_MESSAGE =
  "That email address already has an operator login. One person has one login, so if this is " +
  "the same person, open their operator record instead of inviting them again — and if it is " +
  "somebody else, invite them with their own address.";

export const ROLE_REQUIRED_RULE = "operator_invitation_role_required";
export const ROLE_REQUIRED_MESSAGE =
  "An invitation has to give the person at least one role. Choose the role they are being " +
  "invited to do, then send the invitation.";

export const UNKNOWN_ROLE_RULE = "operator_invitation_role_unknown";
export const INVALID_EMAIL_RULE = "operator_invitation_email_invalid";
export const INVALID_EMAIL_MESSAGE =
  "That does not look like an email address. Check it and try again — the invitation is the " +
  "only way this person gets in, so it has to go to an address they can read.";

export const NAME_REQUIRED_RULE = "operator_invitation_name_required";
export const NAME_REQUIRED_MESSAGE =
  "A new person needs a first name and a last name. If they are already in the club's records, " +
  "choose them from the list of possible matches instead of creating a second record.";

export const MERGED_PERSON_RULE = "operator_invitation_person_merged";
export const MERGED_PERSON_MESSAGE =
  "That record has been merged into another one and is kept only for history. Invite the " +
  "record it was merged into.";

export const BACKDATING_REASON_RULE = "operator_invitation_backdating_reason_required";
export const BACKDATING_REASON_MESSAGE =
  "A role that starts before today has to say why it is being backdated. Record the reason " +
  "and try again.";

export const DUPLICATE_ROLE_RULE = "operator_invitation_duplicate_role";
export const DUPLICATE_ROLE_MESSAGE =
  "That role has been chosen twice. Choose each role once — one person can hold several " +
  "different roles, but not the same one twice.";

export const INVALID_DATE_RULE = "operator_invitation_date_invalid";
export const INVALID_DATE_MESSAGE =
  "That start date is not a date. Give the day the role begins, or leave it blank for today.";

/** A calendar day, as a `date` column stores one. Not a validity check — only a shape. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const NOT_RESENDABLE_RULE = "operator_invitation_not_resendable";
export const NO_ACTIVE_COMMITTEE_YEAR_RULE = "no_active_committee_year";
export const CALLBACK_URL_RULE = "operator_invitation_callback_url_required";
export const CALLBACK_URL_MESSAGE =
  "This installation does not know its own web address, so it cannot build an invitation " +
  "link. Set APP_BASE_URL and try again.";

// ---------------------------------------------------------------------------
// The duplicate check
// ---------------------------------------------------------------------------

/** Why a candidate surfaced. Same vocabulary the returner intake uses. */
export type CandidateMatch = "given name" | "family name" | "known as" | "email" | "phone";

/** One possible existing Person, and what they already have. */
export interface OperatorCandidate {
  readonly personId: string;
  readonly givenName: string;
  readonly familyName: string | null;
  readonly knownAs: string | null;
  /** A current email of theirs, preferred first. Shown so the choice is informed. */
  readonly email: string | null;
  readonly phone: string | null;
  /**
   * Their operator login, when they have one. Non-null is the answer to the
   * question the invitation flow is really asking — this person cannot be
   * invited again, and the administrator should open their record instead.
   */
  readonly operatorAccount: {
    readonly id: string;
    readonly loginEmail: string | null;
    readonly state: OperatorAccountState;
  } | null;
  readonly matchedOn: CandidateMatch[];
}

export interface OperatorCandidateQuery {
  readonly givenName?: string | null;
  readonly familyName?: string | null;
  readonly knownAs?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
}

interface CandidateRow {
  person_id: string;
  given_name: string;
  family_name: string | null;
  known_as: string | null;
  email: string | null;
  phone: string | null;
  operator_account_id: string | null;
  operator_login_email: string | null;
  operator_is_active: boolean | null;
  operator_activated_at: Date | null;
  operator_delivery_failed_at: Date | null;
  matched_given: boolean;
  matched_family: boolean;
  matched_known_as: boolean;
  matched_email: boolean;
  matched_phone: boolean;
}

/**
 * Every existing Person who might already be the human being invited.
 *
 * ## Why this is not `roster.findPersonCandidates`
 *
 * That function answers a different question and carries a dependency this one
 * must not have: it resolves the open season first and refuses outright when
 * there is none, because a returner intake without a season to enter them into
 * is pointless. An operator invitation is not. `REQ-coach-operator-onboarding`
 * is explicit that "coaching onboarding neither requires nor automatically
 * creates player membership: an external coach may have none" — and a club
 * between seasons must still be able to invite its Secretary.
 *
 * What it *does* share is the matching rule, and that is deliberate rather than
 * accidental duplication: a given name alone is enough, aliases count, and
 * phones compare on their last nine digits. `roster.ts` records the reasoning
 * at length and it is not restated here. What replaces the membership column is
 * the operator account, because "this person already has a login" is the fact
 * that decides whether this flow can proceed at all.
 *
 * People merged away under invariant I6 are excluded, for the reason
 * `roster.ts` gives: offering one invites an administrator to resurrect a
 * record the club has already decided is a duplicate.
 */
export async function findOperatorCandidates(
  operator: ResolvedOperator | null,
  query: OperatorCandidateQuery,
): Promise<OperatorCandidate[]> {
  // A duplicate check discloses names, addresses and phone numbers of people
  // who are not the subject of the search, which is why it is guarded here and
  // not by whatever screen calls it. `assign_role` is the decision this search
  // is a step of; the role is not chosen yet, so the floor is what can be
  // asserted, and the target-level guard runs before anything is written.
  assertAdministrationCapability(operator);

  return withTransaction(async (tx) => {
    const result = await tx.query<CandidateRow>(
      `with wanted as (
         select
           lower(btrim($1::text))   as given_name,
           lower(btrim($2::text))   as family_name,
           lower(btrim($3::text))   as known_as,
           lower(btrim($4::text))   as email,
           nullif(right(regexp_replace(coalesce($5::text, ''), '\\D', '', 'g'), 9), '') as phone_tail
       ),
       alias_match as (
         select a.person_id,
                bool_or(lower(btrim(a.alias)) = w.given_name)  as by_given,
                bool_or(lower(btrim(a.alias)) = w.family_name) as by_family,
                bool_or(lower(btrim(a.alias)) = w.known_as)    as by_known_as
           from public.person_aliases a
           cross join wanted w
          group by a.person_id
       ),
       contact_match as (
         select c.person_id,
                bool_or(c.kind = 'email' and lower(btrim(c.raw_value)) = w.email) as by_email,
                bool_or(
                  c.kind = 'phone'
                  and w.phone_tail is not null
                  and nullif(right(regexp_replace(c.raw_value, '\\D', '', 'g'), 9), '') = w.phone_tail
                ) as by_phone
           from public.contact_points c
           cross join wanted w
          group by c.person_id
       ),
       preferred as (
         select distinct on (person_id, kind) person_id, kind, raw_value
           from public.contact_points
          where valid_until is null
          order by person_id, kind, is_preferred desc, created_at desc
       ),
       display_contact as (
         select person_id,
                max(raw_value) filter (where kind = 'email') as email,
                max(raw_value) filter (where kind = 'phone') as phone
           from preferred
          group by person_id
       )
       select
         p.id                       as person_id,
         p.given_name,
         p.family_name,
         p.known_as,
         display_contact.email,
         display_contact.phone,
         oa.id                      as operator_account_id,
         oa.login_email             as operator_login_email,
         oa.is_active               as operator_is_active,
         oa.activated_at            as operator_activated_at,
         oa.invitation_delivery_failed_at as operator_delivery_failed_at,
         coalesce(lower(btrim(p.given_name)) = w.given_name
                  or lower(btrim(p.known_as)) = w.given_name
                  or am.by_given, false)    as matched_given,
         coalesce(lower(btrim(p.family_name)) = w.family_name
                  or am.by_family, false)   as matched_family,
         coalesce(lower(btrim(p.known_as)) = w.known_as
                  or lower(btrim(p.given_name)) = w.known_as
                  or am.by_known_as, false) as matched_known_as,
         coalesce(cm.by_email, false)       as matched_email,
         coalesce(cm.by_phone, false)       as matched_phone
       from public.people p
       cross join wanted w
       left join alias_match   am on am.person_id = p.id
       left join contact_match cm on cm.person_id = p.id
       left join display_contact  on display_contact.person_id = p.id
       left join public.operator_accounts oa on oa.person_id = p.id
      where p.merged_into_person_id is null
        and (
          lower(btrim(p.given_name)) = w.given_name
          or lower(btrim(p.known_as)) = w.given_name
          or lower(btrim(p.family_name)) = w.family_name
          or lower(btrim(p.known_as)) = w.known_as
          or lower(btrim(p.given_name)) = w.known_as
          or coalesce(am.by_given or am.by_family or am.by_known_as, false)
          or coalesce(cm.by_email or cm.by_phone, false)
        )
      order by p.family_name nulls last, p.given_name, p.id`,
      [
        blankToNull(query.givenName),
        blankToNull(query.familyName),
        blankToNull(query.knownAs),
        blankToNull(query.email),
        blankToNull(query.phone),
      ],
    );

    return result.rows.map(toCandidate);
  });
}

function toCandidate(row: CandidateRow): OperatorCandidate {
  const matchedOn: CandidateMatch[] = [];
  if (row.matched_given) matchedOn.push("given name");
  if (row.matched_family) matchedOn.push("family name");
  if (row.matched_known_as) matchedOn.push("known as");
  if (row.matched_email) matchedOn.push("email");
  if (row.matched_phone) matchedOn.push("phone");

  return {
    personId: row.person_id,
    givenName: row.given_name,
    familyName: row.family_name,
    knownAs: row.known_as,
    email: row.email,
    phone: row.phone,
    operatorAccount:
      row.operator_account_id === null
        ? null
        : {
            id: row.operator_account_id,
            loginEmail: row.operator_login_email,
            state: deriveOperatorAccountState({
              isActive: row.operator_is_active === true,
              activatedAt: row.operator_activated_at,
              invitationDeliveryFailedAt: row.operator_delivery_failed_at,
              emailChangePending: false,
            }),
          },
    matchedOn,
  };
}

// ---------------------------------------------------------------------------
// Reading an operator account
// ---------------------------------------------------------------------------

/** One operator account, as Administration reads it. */
export interface OperatorAccountRecord {
  readonly id: string;
  readonly personId: string;
  readonly authUserId: string;
  readonly loginEmail: string | null;
  readonly isActive: boolean;
  readonly invitedAt: Date | null;
  readonly activatedAt: Date | null;
  readonly deliveryFailedAt: Date | null;
  readonly deliveryFailureReason: string | null;
  readonly state: OperatorAccountState;
}

interface AccountRow {
  id: string;
  person_id: string;
  auth_user_id: string;
  login_email: string | null;
  is_active: boolean;
  invited_at: Date | null;
  activated_at: Date | null;
  invitation_delivery_failed_at: Date | null;
  invitation_delivery_failure_reason: string | null;
}

function toAccount(row: AccountRow): OperatorAccountRecord {
  return {
    id: row.id,
    personId: row.person_id,
    authUserId: row.auth_user_id,
    loginEmail: row.login_email,
    isActive: row.is_active,
    invitedAt: row.invited_at,
    activatedAt: row.activated_at,
    deliveryFailedAt: row.invitation_delivery_failed_at,
    deliveryFailureReason: row.invitation_delivery_failure_reason,
    state: deriveOperatorAccountState({
      isActive: row.is_active,
      activatedAt: row.activated_at,
      invitationDeliveryFailedAt: row.invitation_delivery_failed_at,
      emailChangePending: false,
    }),
  };
}

const ACCOUNT_COLUMNS = `id, person_id, auth_user_id, login_email, is_active, invited_at,
         activated_at, invitation_delivery_failed_at, invitation_delivery_failure_reason`;

/** One account by its own id, inside a transaction. `null` when there is none. */
export async function readOperatorAccountIn(
  tx: Tx,
  operatorAccountId: string,
): Promise<OperatorAccountRecord | null> {
  const result = await tx.query<AccountRow>(
    `select ${ACCOUNT_COLUMNS} from public.operator_accounts where id = $1`,
    [operatorAccountId],
  );
  return result.rows.length === 0 ? null : toAccount(result.rows[0]);
}

/** One account, guarded, for a surface that is about to render it. */
export async function readOperatorAccount(
  operator: ResolvedOperator | null,
  operatorAccountId: string,
): Promise<OperatorAccountRecord | null> {
  assertAdministrationCapability(operator);
  return withTransaction((tx) => readOperatorAccountIn(tx, operatorAccountId));
}

// ---------------------------------------------------------------------------
// The snapshot the guard judges
// ---------------------------------------------------------------------------

/**
 * The target's role codes, read from the database inside the caller's
 * transaction. **This is the input the leadership rules stand on.**
 *
 * `includeScheduled` widens "currently effective" to "not yet ended", and is
 * used for the two invitation actions. A pending invitation may carry a seat
 * dated to begin at a handover; that seat is not in force today, and a guard
 * that could not see it would let somebody who may not assign the President
 * seat redirect the link that confers it. Including it is the fail-closed
 * direction — it can only ever make the guard stricter.
 */
export async function readAdministrationSubject(
  tx: Tx,
  personId: string,
  options: { includeScheduled?: boolean } = {},
): Promise<AdministrationSubject> {
  const result = await tx.query<{ code: string }>(
    `select distinct r.code
       from public.role_assignments ra
       join public.roles r on r.id = ra.role_id
      where ra.person_id = $1
        and (ra.effective_to is null or ra.effective_to > current_date)
        and ($2::boolean or ra.effective_from <= current_date)
      order by r.code`,
    [personId, options.includeScheduled === true],
  );

  return { personId, roleCodes: result.rows.map((row) => row.code) };
}

// ---------------------------------------------------------------------------
// Invite
// ---------------------------------------------------------------------------

interface RoleRow {
  id: string;
  code: string;
  scope: "committee_year" | "season";
  is_constitutional_office: boolean;
  is_single_holder_seat: boolean;
}

interface ResolvedRole {
  readonly role: RoleRow;
  readonly effectiveFrom: string;
  readonly backdated: boolean;
  readonly scheduled: boolean;
  readonly reason: string | null;
}

/**
 * Invites one operator, in one transaction plus two Auth calls.
 *
 * The order of operations, and why it is that order, is in the module note. The
 * short version: create the login, write everything, send the email — so that a
 * delivery failure leaves a complete, resendable operator record rather than
 * nothing at all.
 */
export async function inviteOperator(params: InviteOperatorParams): Promise<InviteOperatorResult> {
  const identity = params.identity ?? supabaseOperatorIdentity();
  const email = normaliseEmail(params.email);
  const callbackUrl = (params.callbackUrl ?? "").trim();

  if (callbackUrl === "") {
    throw new ConstraintViolated(CALLBACK_URL_MESSAGE, { rule: CALLBACK_URL_RULE });
  }
  if (!looksLikeEmailAddress(email)) {
    throw new ConstraintViolated(INVALID_EMAIL_MESSAGE, { rule: INVALID_EMAIL_RULE });
  }
  if (params.roles.length === 0) {
    throw new ConstraintViolated(ROLE_REQUIRED_MESSAGE, { rule: ROLE_REQUIRED_RULE });
  }

  // ---- Everything that can be refused, refused before anything is created.
  const preflight = await withTransaction(async (tx) => {
    const operatingYear = await resolveActiveCommitteeYear(tx);
    const roles = await resolveRoles(tx, params.roles);
    await refuseTakenEmail(tx, email, null);

    const personId =
      params.subject.kind === "existing"
        ? await requireInvitablePerson(tx, params.subject.personId)
        : // A Person who does not exist yet holds nothing and is nobody, so the
          // pre-flight guard is run against an identity that cannot match the
          // actor and cannot carry a seat. The authoritative guard below runs
          // against the real row.
          randomUUID();

    const subject: AdministrationSubject =
      params.subject.kind === "existing"
        ? await readAdministrationSubject(tx, personId)
        : { personId, roleCodes: [] };

    assertEachRolePermitted(params.operator, subject, roles);
    return { operatingYear, roles };
  });

  // ---- The login. Creates nothing else, and sends nothing.
  const { authUserId } = await identity.createLogin(email);

  // ---- Every row, or none of them.
  let written: {
    personId: string;
    operatorAccountId: string;
    personCreated: boolean;
    roleAssignmentIds: string[];
  };

  try {
    written = await withTransaction(async (tx) => {
      const correlationId = randomUUID();
      const { personId, personCreated } = await createOrLinkPerson(tx, params.subject, email);

      // The authoritative snapshot: read here, inside the transaction that is
      // about to write, and judged by the guard before a single row is
      // inserted. `WP-authorization` records that a stale or empty snapshot is
      // the one way to disarm the leadership rules; this is the read that stops
      // that being possible.
      const subject = await readAdministrationSubject(tx, personId);
      assertEachRolePermitted(params.operator, subject, preflight.roles);

      const operatorAccountId = await insertOperatorAccount(tx, {
        authUserId,
        personId,
        email,
      });

      await recordAdministrationEvent(tx, {
        action: "administration.operator.invited",
        actorPersonId: requireOperator(params.operator).personId,
        authority: administrationAuthority(params.operator),
        target: { personId, operatorAccountId },
        operatingYear: preflight.operatingYear,
        toState: "invitation_pending",
        correlationId,
        detail: {
          personCreated,
          roleCodes: preflight.roles.map((entry) => entry.role.code),
        },
      });

      const roleAssignmentIds: string[] = [];
      for (const entry of preflight.roles) {
        const cycle = await resolveCycleFor(tx, entry.role.scope, preflight.operatingYear);
        const assignmentId = await insertRoleAssignment(tx, {
          personId,
          entry,
          cycle,
          appointedByPersonId: requireOperator(params.operator).personId,
        });

        await recordAdministrationEvent(tx, {
          action: "administration.role.assigned",
          actorPersonId: requireOperator(params.operator).personId,
          authority: administrationAuthority(params.operator),
          target: { personId, operatorAccountId },
          role: { id: entry.role.id, code: entry.role.code, assignmentId },
          operatingYear: cycle.operatingYear,
          toState: entry.scheduled ? "scheduled" : "effective",
          reason: entry.reason,
          backdated: entry.backdated,
          correlationId,
        });

        roleAssignmentIds.push(assignmentId);
      }

      return { personId, operatorAccountId, personCreated, roleAssignmentIds };
    });
  } catch (error) {
    // The only compensation in this module, and it applies to exactly one
    // thing: a login created seconds ago that no `operator_accounts` row
    // points at, because the statement that would have pointed at it did not
    // commit. A dangling login grants nothing — `resolveOperatorAccess()`
    // reports it `unlinked` — but leaving it behind would make the honest
    // retry fail with "that address already has a login".
    //
    // Best effort: if the removal itself fails, the original failure is what
    // the administrator needs to see, and a second error thrown from a catch
    // block would replace it.
    await identity.deleteLogin(authUserId).catch(() => undefined);
    throw error;
  }

  // ---- The email. Everything above is committed; a failure here is a
  //      recorded delivery failure, not a rollback.
  const delivery = await deliverInvitation(identity, email, callbackUrl);

  if (!delivery.ok) {
    await withTransaction((tx) =>
      markDeliveryFailed(tx, {
        operator: params.operator,
        operatorAccountId: written.operatorAccountId,
        personId: written.personId,
        operatingYear: preflight.operatingYear,
        reason: delivery.reason,
      }),
    );
  }

  return {
    personId: written.personId,
    operatorAccountId: written.operatorAccountId,
    authUserId,
    loginEmail: email,
    personCreated: written.personCreated,
    roleAssignmentIds: written.roleAssignmentIds,
    state: delivery.ok ? "invitation_pending" : "delivery_failed",
    delivered: delivery.ok,
    deliveryFailureReason: delivery.ok ? null : delivery.reason,
  };
}

// ---------------------------------------------------------------------------
// Resend, and correct-and-resend
// ---------------------------------------------------------------------------

export interface ResendInvitationParams {
  readonly operator: ResolvedOperator | null;
  readonly operatorAccountId: string;
  readonly callbackUrl: string;
  readonly identity?: OperatorIdentityPort;
}

export interface CorrectInvitationParams extends ResendInvitationParams {
  /** The address the invitation should have gone to. */
  readonly email: string;
}

export interface InvitationSendResult {
  readonly operatorAccountId: string;
  readonly loginEmail: string;
  readonly state: OperatorAccountState;
  readonly delivered: boolean;
  readonly deliveryFailureReason: string | null;
}

/**
 * Sends the invitation again, to the same address.
 *
 * `REQ-invitation-states` offers resend "while pending or failed", and
 * `resendAvailable` on the state vocabulary is where that rule lives — this
 * asks the state rather than listing the two states again.
 *
 * An expired link is a normal reason to be here, not an error: the requirement
 * "treats expiration as normal", and there is nothing to clean up because the
 * expiry is GoTrue's and the account never changed.
 */
export async function resendOperatorInvitation(
  params: ResendInvitationParams,
): Promise<InvitationSendResult> {
  return sendAgain(params, null);
}

/**
 * Corrects the address and sends the invitation again.
 *
 * `REQ-invitation-states`: "permits correction and resend". The address moves
 * on the login and on the account together, and the old address is recorded in
 * the audit event rather than being quietly overwritten — an invitation that
 * went to the wrong person's mailbox is exactly the thing somebody will need to
 * reconstruct later.
 *
 * It is refused once the holder has established credentials. Changing the
 * address of a working account is `REQ-rehome-email`'s administrator recovery
 * flow, which disables the old login path, records a reason and holds the
 * account in Email change pending until the new address is verified. Silently
 * doing it here would be that flow without any of its protections.
 */
export async function correctOperatorInvitation(
  params: CorrectInvitationParams,
): Promise<InvitationSendResult> {
  const email = normaliseEmail(params.email);
  if (!looksLikeEmailAddress(email)) {
    throw new ConstraintViolated(INVALID_EMAIL_MESSAGE, { rule: INVALID_EMAIL_RULE });
  }
  return sendAgain(params, email);
}

/**
 * The shared body of resend and correction.
 *
 * They differ in one place — whether the address moves — and are one function
 * because everything else about them is identical, including the two things
 * easiest to get subtly different between two copies: which states permit them,
 * and the fact that the failure columns are cleared *before* the send so that a
 * fresh failure is a real transition rather than a no-change the ledger refuses.
 */
async function sendAgain(
  params: ResendInvitationParams,
  correctedEmail: string | null,
): Promise<InvitationSendResult> {
  const identity = params.identity ?? supabaseOperatorIdentity();
  const callbackUrl = (params.callbackUrl ?? "").trim();
  if (callbackUrl === "") {
    throw new ConstraintViolated(CALLBACK_URL_MESSAGE, { rule: CALLBACK_URL_RULE });
  }

  const action = correctedEmail === null ? "resend_invitation" : "correct_invitation";

  const prepared = await withTransaction(async (tx) => {
    const account = await requireAccount(tx, params.operatorAccountId);
    const operatingYear = await resolveActiveCommitteeYear(tx);

    // The snapshot includes seats that have not started yet. See the module
    // note: a pending invitation carrying a future-dated protected seat must
    // protect its target now, not from the handover date.
    const subject = await readAdministrationSubject(tx, account.personId, {
      includeScheduled: true,
    });
    assertAdministrationTarget(params.operator, { action, target: subject });

    refuseUnlessResendable(account);
    if (correctedEmail !== null) {
      await refuseTakenEmail(tx, correctedEmail, account.id);
    }

    return { account, operatingYear };
  });

  const previousEmail = prepared.account.loginEmail;
  const email = correctedEmail ?? previousEmail;
  if (email === null) {
    // Only reachable for a row created before this package existed by a script
    // that set a password directly — and such a row is Active, so
    // `refuseUnlessResendable` has already refused it. Kept as a refusal rather
    // than a non-null assertion, because "send an invitation to nowhere" is not
    // a state this module may guess its way out of.
    throw new ConstraintViolated(
      "This operator record has no email address on it, so an invitation cannot be sent. " +
        "Correct the address first.",
      { rule: INVALID_EMAIL_RULE },
    );
  }

  // The address moves on the login before it moves in the database, so that a
  // failure to move it leaves both saying the same thing. If the database
  // write then fails, the login is moved back.
  if (correctedEmail !== null && correctedEmail !== previousEmail) {
    await identity.changeLoginEmail(prepared.account.authUserId, correctedEmail);
  }

  try {
    await withTransaction(async (tx) => {
      await tx.query(
        `update public.operator_accounts
            set login_email = $2,
                invited_at = now(),
                invitation_delivery_failed_at = null,
                invitation_delivery_failure_reason = null,
                updated_at = now()
          where id = $1`,
        [prepared.account.id, email],
      );

      await recordAdministrationEvent(tx, {
        action:
          correctedEmail === null
            ? "administration.operator.invitation_resent"
            : "administration.operator.invitation_corrected",
        actorPersonId: requireOperator(params.operator).personId,
        authority: administrationAuthority(params.operator),
        target: { personId: prepared.account.personId, operatorAccountId: prepared.account.id },
        operatingYear: prepared.operatingYear,
        detail:
          correctedEmail === null
            ? {}
            : { previousLoginEmail: previousEmail, loginEmail: correctedEmail },
      });
    });
  } catch (error) {
    if (correctedEmail !== null && correctedEmail !== previousEmail && previousEmail !== null) {
      await identity
        .changeLoginEmail(prepared.account.authUserId, previousEmail)
        .catch(() => undefined);
    }
    throw error;
  }

  const delivery = await deliverInvitation(identity, email, callbackUrl);

  if (!delivery.ok) {
    await withTransaction((tx) =>
      markDeliveryFailed(tx, {
        operator: params.operator,
        operatorAccountId: prepared.account.id,
        personId: prepared.account.personId,
        operatingYear: prepared.operatingYear,
        reason: delivery.reason,
      }),
    );
  }

  return {
    operatorAccountId: prepared.account.id,
    loginEmail: email,
    state: delivery.ok ? "invitation_pending" : "delivery_failed",
    delivered: delivery.ok,
    deliveryFailureReason: delivery.ok ? null : delivery.reason,
  };
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export interface ActivateOperatorResult {
  readonly operatorAccountId: string;
  readonly personId: string;
  readonly state: OperatorAccountState;
  /** False when the account was already activated — this call changed nothing. */
  readonly activated: boolean;
}

/**
 * Records that the holder of this login has established credentials.
 *
 * Called by the action that sets the password, with the `auth.users.id` of the
 * session that set it — never with an id a browser supplied. This is the end of
 * the invitation: `DEC-email-authentication`, "first login establishes
 * credentials only".
 *
 * Three properties worth stating, because each one is a decision:
 *
 *   * **Idempotent.** A second password change is not a second activation, and
 *     writes no event. `activated_at` is when credentials were established the
 *     first time.
 *   * **It is the account holder's own act**, so the audit event carries
 *     `authority: { kind: "self" }` — the one shape the vocabulary permits for
 *     somebody with no administrative capability at all.
 *   * **It does not reactivate a deactivated account.** Setting a password is
 *     not permission to sign in; `is_active` is untouched, the derived state
 *     stays Deactivated, and no event is written because nothing transitioned.
 *     `REQ-deactivate-and-reinstate` gives restoration to an administrator.
 *
 * Returns `null` when the login has no operator account. That is not an error:
 * a login can exist unlinked, and the password screen has no business telling
 * its user which it is.
 */
export async function activateOperatorAccount(
  authUserId: string,
): Promise<ActivateOperatorResult | null> {
  return withTransaction(async (tx) => {
    const found = await tx.query<AccountRow>(
      `select ${ACCOUNT_COLUMNS} from public.operator_accounts where auth_user_id = $1 for update`,
      [authUserId],
    );
    if (found.rows.length === 0) return null;

    const account = toAccount(found.rows[0]);
    if (account.activatedAt !== null) {
      return {
        operatorAccountId: account.id,
        personId: account.personId,
        state: account.state,
        activated: false,
      };
    }

    const updated = await tx.query<AccountRow>(
      `update public.operator_accounts
          set activated_at = now(),
              invitation_delivery_failed_at = null,
              invitation_delivery_failure_reason = null,
              updated_at = now()
        where id = $1
      returning ${ACCOUNT_COLUMNS}`,
      [account.id],
    );

    const after = toAccount(updated.rows[0]);
    const operatingYear = await resolveCommitteeYearForActivation(tx);

    // A deactivated account moves from Deactivated to Deactivated, which is not
    // a transition and which the ledger refuses to record — correctly, because
    // nothing about the club's picture of that account changed.
    if (after.state !== account.state) {
      await recordAdministrationEvent(tx, {
        action: "administration.operator.activated",
        actorPersonId: account.personId,
        authority: { kind: "self", roleCodes: [] },
        target: { personId: account.personId, operatorAccountId: account.id },
        operatingYear,
        fromState: account.state,
        toState: after.state,
      });
    }

    return {
      operatorAccountId: after.id,
      personId: after.personId,
      state: after.state,
      activated: true,
    };
  });
}

// ---------------------------------------------------------------------------
// Delivery failure
// ---------------------------------------------------------------------------

async function deliverInvitation(
  identity: OperatorIdentityPort,
  email: string,
  callbackUrl: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await identity.sendInvitation(email, callbackUrl);
    return { ok: true };
  } catch (error) {
    if (error instanceof InvitationDeliveryFailure) {
      return { ok: false, reason: describeDeliveryFailure(error.message) };
    }
    throw error;
  }
}

/**
 * The recorded reason, trimmed and bounded.
 *
 * The transport's own words are kept because they are the only thing that tells
 * an administrator whether the address was wrong or the mail server was down,
 * and they are stored rather than shown — the surfaces render the state's own
 * sentence. Bounded because a provider error can be a whole response body, and
 * an audit reason is a sentence.
 */
function describeDeliveryFailure(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed === "") return "The invitation email could not be delivered.";
  return trimmed.length > 300 ? `${trimmed.slice(0, 297)}...` : trimmed;
}

/**
 * Records a delivery failure against an account that already exists.
 *
 * Both halves matter. The columns make the account show Delivery failed and
 * offer a resend; the event makes the attempt part of the permanent record. And
 * neither creates a second Person or a second account — the whole point of
 * `REQ-invitation-states`' last sentence.
 */
async function markDeliveryFailed(
  tx: Tx,
  input: {
    operator: ResolvedOperator | null;
    operatorAccountId: string;
    personId: string;
    operatingYear: AdministrationOperatingYear;
    reason: string;
  },
): Promise<void> {
  const before = await readOperatorAccountIn(tx, input.operatorAccountId);
  if (!before) return;

  await tx.query(
    `update public.operator_accounts
        set invitation_delivery_failed_at = now(),
            invitation_delivery_failure_reason = $2,
            updated_at = now()
      where id = $1`,
    [input.operatorAccountId, input.reason],
  );

  const after = await readOperatorAccountIn(tx, input.operatorAccountId);
  if (!after || after.state === before.state) return;

  await recordAdministrationEvent(tx, {
    action: "administration.operator.invitation_delivery_failed",
    actorPersonId: requireOperator(input.operator).personId,
    authority: administrationAuthority(input.operator),
    target: { personId: input.personId, operatorAccountId: input.operatorAccountId },
    operatingYear: input.operatingYear,
    fromState: before.state,
    toState: after.state,
    detail: { reason: input.reason },
  });
}

// ---------------------------------------------------------------------------
// The pieces
// ---------------------------------------------------------------------------

function blankToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * The address, trimmed and lowercased.
 *
 * Addresses are lowercased **here and stored that way**, unlike
 * `contact_points.raw_value`, which is deliberately stored exactly as typed.
 * The two are different things: a contact point is a record of what the club
 * was told, and a login is a key. `Clint@Example.org` and `clint@example.org`
 * are one mailbox, one login and — because of
 * `operator_accounts_login_email_key` — one row.
 */
function normaliseEmail(value: string): string {
  return (value ?? "").trim().toLowerCase();
}

function requireOperator(operator: ResolvedOperator | null): ResolvedOperator {
  if (!operator) {
    throw new NotPermitted("You do not have access to this action. Sign in first.", {
      rule: "operator_required",
    });
  }
  return operator;
}

/**
 * The capability floor, for the two **reads** in this module.
 *
 * The floor and not the target-level guard, and that is not the mistake the
 * mission warns about — it is the case the target-level guard has nothing to
 * say about. `assertAdministrationTarget` answers "may this operator do X *to
 * this target*", and a duplicate search has no target: it is the step that
 * decides who the target will be. Reading one account is the same shape.
 *
 * Every **write** below asks the target-aware question instead, twice, and it
 * is the write that decides anything. Guarding the reads matters for a
 * different reason — a duplicate check discloses names, addresses and phone
 * numbers of people who are not its subject — and `role_management` is exactly
 * the line `administration-audit.ts` draws around administration history for
 * the same reason.
 */
function assertAdministrationCapability(operator: ResolvedOperator | null): ResolvedOperator {
  return assertCapability(requireOperator(operator), ADMINISTRATION_CAPABILITY);
}

function administrationAuthority(operator: ResolvedOperator | null) {
  const resolved = requireOperator(operator);
  return {
    kind: "capability" as const,
    capability: ADMINISTRATION_CAPABILITY,
    roleCodes: resolved.roleCodes,
  };
}

/** The target-level guard, once per role the invitation confers. */
function assertEachRolePermitted(
  operator: ResolvedOperator | null,
  subject: AdministrationSubject,
  roles: readonly ResolvedRole[],
): void {
  for (const entry of roles) {
    assertAdministrationTarget(operator, {
      action: "assign_role",
      target: subject,
      // The catalogue's own spelling, resolved from `public.roles` — never the
      // string a form supplied. `WP-authorization` refuses an unrecognised code
      // outright and normalises nothing, which is only safe if the caller
      // resolves first. This is that resolution.
      roleCode: entry.role.code,
    });
  }
}

function refuseUnlessResendable(account: OperatorAccountRecord): void {
  if (operatorAccountState(account.state).resendAvailable) return;

  const definition = operatorAccountState(account.state);
  throw new InvalidTransition(
    `This operator's access is "${definition.label}", so there is no invitation to send. ` +
      `${definition.description}`,
    { rule: NOT_RESENDABLE_RULE },
  );
}

async function requireAccount(tx: Tx, operatorAccountId: string): Promise<OperatorAccountRecord> {
  const account = await readOperatorAccountIn(tx, operatorAccountId);
  if (!account) {
    throw new NotFound("That operator record no longer exists.", {
      rule: "operator_account_not_found",
    });
  }
  return account;
}

/** Refuses an address another operator login already holds. */
async function refuseTakenEmail(
  tx: Tx,
  email: string,
  exceptAccountId: string | null,
): Promise<void> {
  const result = await tx.query<{ id: string }>(
    `select id from public.operator_accounts
      where lower(login_email) = lower($1)
        and ($2::uuid is null or id <> $2::uuid)
      limit 1`,
    [email, exceptAccountId],
  );

  if (result.rows.length > 0) {
    throw new Conflict(EMAIL_ALREADY_HAS_LOGIN_MESSAGE, { rule: EMAIL_ALREADY_HAS_LOGIN_RULE });
  }
}

/** The Person named must exist, must not be merged away, and must have no login. */
async function requireInvitablePerson(tx: Tx, personId: string): Promise<string> {
  const result = await tx.query<{ id: string; merged_into_person_id: string | null }>(
    "select id, merged_into_person_id from public.people where id = $1",
    [personId],
  );

  if (result.rows.length === 0) {
    throw new NotFound(
      "That person is not in the club's records any more. Search again and choose from the " +
        "list, or create a new record.",
      { rule: "person_not_found" },
    );
  }
  if (result.rows[0].merged_into_person_id !== null) {
    throw new Conflict(MERGED_PERSON_MESSAGE, { rule: MERGED_PERSON_RULE });
  }

  const existing = await tx.query<{ id: string }>(
    "select id from public.operator_accounts where person_id = $1",
    [personId],
  );
  if (existing.rows.length > 0) {
    throw new Conflict(PERSON_ALREADY_HAS_LOGIN_MESSAGE, { rule: PERSON_ALREADY_HAS_LOGIN_RULE });
  }

  return personId;
}

async function createOrLinkPerson(
  tx: Tx,
  subject: InvitationSubject,
  email: string,
): Promise<{ personId: string; personCreated: boolean }> {
  if (subject.kind === "existing") {
    return { personId: await requireInvitablePerson(tx, subject.personId), personCreated: false };
  }

  const givenName = blankToNull(subject.givenName);
  const familyName = blankToNull(subject.familyName);
  if (givenName === null || familyName === null) {
    // `people.family_name` is nullable by design — a quarter of the club's real
    // records are first-name-only — and `DEC-minimal-person-creation` still
    // requires both here. That is not a contradiction: the schema records what
    // the club's history contains, and this flow records somebody being given
    // an account today, which is a moment where both names are known.
    throw new ConstraintViolated(NAME_REQUIRED_MESSAGE, { rule: NAME_REQUIRED_RULE });
  }

  const knownAs = blankToNull(subject.knownAs);
  const inserted = await tx.query<{ id: string }>(
    `insert into public.people (given_name, family_name, known_as)
     values ($1, $2, $3)
     returning id`,
    [givenName, familyName, knownAs],
  );
  const personId = inserted.rows[0].id;

  // The email and the optional phone become contact points, preferred, because
  // a brand-new Person has none of either and the club now knows both. An
  // *existing* Person's contact points are deliberately untouched: editing a
  // profile is outside this mission (`REQ-invite-existing-person`), and
  // silently re-preferring somebody's address because they were given a login
  // would be an edit nobody asked for.
  await insertContactPoint(tx, personId, "email", email);
  const phone = blankToNull(subject.phone);
  if (phone !== null) await insertContactPoint(tx, personId, "phone", phone);

  return { personId, personCreated: true };
}

async function insertContactPoint(
  tx: Tx,
  personId: string,
  kind: "email" | "phone",
  rawValue: string,
): Promise<void> {
  await tx.query(
    `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source)
     values ($1, $2::public.contact_point_kind, $3, true, 'operator invitation')`,
    [personId, kind, rawValue],
  );
}

async function insertOperatorAccount(
  tx: Tx,
  input: { authUserId: string; personId: string; email: string },
): Promise<string> {
  const inserted = await tx.query<{ id: string }>(
    `insert into public.operator_accounts (auth_user_id, person_id, login_email, invited_at)
     values ($1, $2, $3, now())
     returning id`,
    [input.authUserId, input.personId, input.email],
  );
  return inserted.rows[0].id;
}

interface ResolvedCycle {
  readonly committeeYearId: string | null;
  readonly seasonId: string | null;
  readonly operatingYear: AdministrationOperatingYear;
}

/**
 * The cycle a role's assignment hangs off — register D8, and
 * `REQ-explicit-cycle-assignment`: the form does not ask for the year, the
 * stored cycle stays explicit, and it is inherited from the one active context.
 *
 * A committee seat hangs off the committee year; a coaching seat hangs off the
 * season, because coaches are appointed around seasons and do not turn over at
 * the AGM. The role says which, so this reads the role rather than asking.
 */
async function resolveCycleFor(
  tx: Tx,
  scope: "committee_year" | "season",
  committeeYear: AdministrationOperatingYear,
): Promise<ResolvedCycle> {
  if (scope === "committee_year") {
    return {
      committeeYearId: committeeYear.id,
      seasonId: null,
      operatingYear: committeeYear,
    };
  }

  const season = await resolveActiveSeason(tx);
  return { committeeYearId: null, seasonId: season.id, operatingYear: season };
}

async function insertRoleAssignment(
  tx: Tx,
  input: {
    personId: string;
    entry: ResolvedRole;
    cycle: ResolvedCycle;
    appointedByPersonId: string;
  },
): Promise<string> {
  const { role } = input.entry;

  // `scope`, `is_constitutional_office` and `is_single_holder_seat` are all
  // denormalised from `public.roles` so that the schema's exclusion constraints
  // are expressible, and all three are carried by composite foreign keys. There
  // is no trigger filling them in — LAN-128 decided that deliberately — so a
  // value taken from anywhere but the catalogue row is refused loudly by
  // `role_assignments_agree_with_role` or
  // `role_assignments_agree_with_single_holder_rule`. They are read from the
  // row this insert names, and from nowhere else.
  const inserted = await tx.query<{ id: string }>(
    `insert into public.role_assignments
       (person_id, role_id, scope, is_constitutional_office, is_single_holder_seat,
        committee_year_id, season_id, effective_from, appointed_by_person_id, note)
     values ($1, $2, $3::public.role_scope, $4, $5, $6, $7, $8::date, $9, $10)
     returning id`,
    [
      input.personId,
      role.id,
      role.scope,
      role.is_constitutional_office,
      role.is_single_holder_seat,
      input.cycle.committeeYearId,
      input.cycle.seasonId,
      input.entry.effectiveFrom,
      input.appointedByPersonId,
      input.entry.reason,
    ],
  );

  return inserted.rows[0].id;
}

/**
 * Every requested role, resolved against the catalogue, with its dates checked.
 *
 * The resolution is the part that matters for authorization: the guard refuses
 * a code the catalogue does not have and normalises nothing, so a caller that
 * passed a form value straight through would be refused for a typo and — worse
 * — a caller that trimmed one itself would be judging a seat nobody named. Here
 * the code is looked up exactly, and what the guard is given afterwards is the
 * catalogue's own `code` column.
 */
async function resolveRoles(
  tx: Tx,
  requested: readonly InitialRoleAssignment[],
): Promise<ResolvedRole[]> {
  const today = await currentDate(tx);
  const resolved: ResolvedRole[] = [];

  for (const entry of requested) {
    const code = (entry.roleCode ?? "").trim();
    const found = await tx.query<RoleRow>(
      `select id, code, scope::text as scope, is_constitutional_office, is_single_holder_seat
         from public.roles where code = $1`,
      [code],
    );

    if (found.rows.length === 0) {
      throw new NotFound(
        "That role is not one of the club's roles. The list of roles is fixed and is not " +
          "editable in the application; choose one from it.",
        { rule: UNKNOWN_ROLE_RULE },
      );
    }

    if (resolved.some((already) => already.role.code === found.rows[0].code)) {
      // Two assignments of one seat to one person, starting the same day, is
      // not something any schema constraint forbids for a multi-holder seat —
      // and it is not something an administrator ever means. Refused here
      // rather than de-duplicated silently, because "I picked it twice" and "I
      // meant two different seats" look identical afterwards.
      throw new ConstraintViolated(DUPLICATE_ROLE_MESSAGE, { rule: DUPLICATE_ROLE_RULE });
    }

    const effectiveFrom = blankToNull(entry.effectiveFrom) ?? today;
    if (!ISO_DATE.test(effectiveFrom)) {
      // Caught here so the administrator gets a sentence rather than a date
      // cast failing inside the insert and arriving as "the database refused
      // this change".
      throw new ConstraintViolated(INVALID_DATE_MESSAGE, { rule: INVALID_DATE_RULE });
    }

    const reason = blankToNull(entry.reason);
    const backdated = effectiveFrom < today;
    if (backdated && reason === null) {
      throw new ConstraintViolated(BACKDATING_REASON_MESSAGE, { rule: BACKDATING_REASON_RULE });
    }

    resolved.push({
      role: found.rows[0],
      effectiveFrom,
      backdated,
      scheduled: effectiveFrom > today,
      reason,
    });
  }

  return resolved;
}

async function currentDate(tx: Tx): Promise<string> {
  const result = await tx.query<{ today: string }>("select current_date::text as today");
  return result.rows[0].today;
}

/**
 * The one active committee year — `DEC-active-operating-year`: "routine
 * assignments inherit the single application-wide active operating-year
 * context", and forms do not ask for it.
 *
 * Fails closed in both directions, on `resolveOpenSeason`'s pattern: none is a
 * `NotFound` naming what has to happen first, and more than one is a `Conflict`
 * rather than a silent choice. `committee_years_do_not_overlap` makes the
 * second unreachable for dated years and not for open-ended ones, which is
 * exactly the case worth refusing.
 */
export async function resolveActiveCommitteeYear(tx: Tx): Promise<AdministrationOperatingYear> {
  const result = await tx.query<{ id: string; label: string }>(
    `select id, label
       from public.committee_years
      where starts_on <= current_date
        and (ends_on is null or ends_on > current_date)
      order by starts_on desc`,
  );

  if (result.rows.length === 0) {
    throw new NotFound(
      "The club has no committee year running at the moment, so there is nothing to record " +
        "this against. The current committee year has to be recorded first.",
      { rule: NO_ACTIVE_COMMITTEE_YEAR_RULE },
    );
  }
  if (result.rows.length > 1) {
    throw new Conflict(
      "More than one committee year is currently running, so it is not clear which one this " +
        "belongs to. Close the one that has finished, then try again.",
      { rule: "ambiguous_active_committee_year" },
    );
  }

  return { scope: "committee_year", id: result.rows[0].id, label: result.rows[0].label };
}

/**
 * The operating year an **activation** is recorded under.
 *
 * The active committee year, and — unlike every other caller — the most recent
 * one when there is no active one. That is the one place this module is lenient
 * about the year, and the reason is worth stating rather than discovering:
 *
 * Activation is not an administrator's act. It is the moment an invited person
 * chooses their password, in `src/app/reset-password/actions.ts`, and by then
 * their password has already been changed. Refusing to record it would fail
 * that action *after* the credentials existed — so somebody who had been
 * invited perfectly legitimately would see an error, and the club's record of
 * their account would say the invitation was still pending.
 *
 * The state that produces it is real and not exotic: `committee_years.ends_on`
 * is a date, and a club that has closed one year before recording the next has
 * a gap. Anyone invited before the gap would be unable to complete their
 * invitation during it.
 *
 * Nothing is invented by the fallback. Every other operation here still
 * requires an *active* year, because every other operation creates or moves an
 * assignment that has to hang off a real cycle; this one records that something
 * happened, and dating it to the club's most recent committee year is the
 * truthful answer available. With no committee year at all it still refuses —
 * but then nobody could have been invited either, since `inviteOperator`
 * requires an active one.
 */
async function resolveCommitteeYearForActivation(tx: Tx): Promise<AdministrationOperatingYear> {
  try {
    return await resolveActiveCommitteeYear(tx);
  } catch (error) {
    const isMissing =
      error instanceof NotFound && (error as NotFound).rule === NO_ACTIVE_COMMITTEE_YEAR_RULE;
    if (!isMissing) throw error;

    const result = await tx.query<{ id: string; label: string }>(
      "select id, label from public.committee_years order by starts_on desc limit 1",
    );
    if (result.rows.length === 0) throw error;

    return { scope: "committee_year", id: result.rows[0].id, label: result.rows[0].label };
  }
}

/** The season a coaching appointment hangs off. Same fail-closed shape. */
async function resolveActiveSeason(tx: Tx): Promise<AdministrationOperatingYear> {
  const result = await tx.query<{ id: string; label: string }>(
    `select id, label from public.seasons where status in ('open', 'active') order by label`,
  );

  if (result.rows.length === 0) {
    throw new NotFound(
      "There is no season under way, so a coaching role cannot be given a start yet. " +
        "The President or Secretary opens the season first.",
      { rule: "no_open_season" },
    );
  }
  if (result.rows.length > 1) {
    throw new Conflict(
      "More than one season is currently open, so it is not clear which one a coaching role " +
        "belongs to. Close or archive the season that has finished, then try again.",
      { rule: "ambiguous_open_season" },
    );
  }

  return { scope: "season", id: result.rows[0].id, label: result.rows[0].label };
}
