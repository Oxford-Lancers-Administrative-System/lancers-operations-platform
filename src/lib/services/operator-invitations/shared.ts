import {
  assertAdministrationTarget,
  type AdministrationSubject,
} from "@/lib/auth/administration-authority";
import type { CapabilityKey } from "@/lib/auth/capabilities";
import { assertCapability } from "@/lib/auth/guards";
import type { ResolvedOperator } from "@/lib/auth/operator";
import {
  Conflict,
  ConstraintViolated,
  InvalidTransition,
  NotFound,
  NotPermitted,
  type Tx,
} from "@/lib/db";
import { operatorAccountState } from "../operator-account-state";
import { validatePhoneNumber } from "../person-validation";
import { readOperatorAccountIn, type OperatorAccountRecord } from "./account-read";
import { currentDateIn } from "./cycles";
import type { ResolvedRole } from "./invite";
import {
  BACKDATING_REASON_RULE,
  EMAIL_ALREADY_HAS_LOGIN_RULE,
  INVALID_PHONE_RULE,
  NAME_REQUIRED_RULE,
  NOT_RESENDABLE_RULE,
  PERSON_ALREADY_HAS_LOGIN_RULE,
  UNKNOWN_ROLE_RULE,
} from "./refusals";

/** The capability every action in this module stands on. */
const ADMINISTRATION_CAPABILITY: CapabilityKey = "role_management";

/**
 * Operator invitation — private helpers shared by the siblings in this
 * directory. LAN-131, mission M-OPERATOR-ADMIN-WITHOUT-SQL. Nothing here is
 * exported from the barrel except the rule constants and read helpers the
 * original module exported.
 */

/** Who this invitation is for — create-or-link, chosen explicitly by the administrator (`DEC-minimal-person-creation`). */
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
  readonly roleCode: string;
  /** Defaults to today; a past date is audited backdating and requires a reason. */
  readonly effectiveFrom?: string | null;
  readonly reason?: string | null;
}

const PERSON_ALREADY_HAS_LOGIN_MESSAGE =
  "That person already has an operator login. One person has one login, however many roles " +
  "they hold — open their operator record to give them another role, resend their invitation, " +
  "or restore their access.";

/**
 * LAN-311. Names the account the address already belongs to, and what state it
 * is in, because the administrator's next move depends on which: an account
 * that is Active wants a role added to it, one that is still Invited wants its
 * invitation resent, one that is Deactivated wants restoring. The old sentence
 * said only that the address was taken, and Clint, reading it, went on trying
 * to invite the address rather than opening the record.
 *
 * Falls back to the old wording when the holder cannot be named — the record
 * may have gone between the two reads — so the refusal never renders a gap.
 */
function emailAlreadyHasLoginMessage(holder: string | null, stateLabel: string | null): string {
  const remedy =
    "One person has one login, however many roles they hold — open their operator record to " +
    "give them another role, resend their invitation, or restore their access. If this is " +
    "somebody else, invite them with their own address.";

  if (holder === null) return `That email address already has an operator login. ${remedy}`;
  return stateLabel === null
    ? `${holder} already signs in with that email address. ${remedy}`
    : `${holder} already signs in with that email address, and their access is "${stateLabel}". ${remedy}`;
}

export const ROLE_REQUIRED_MESSAGE =
  "An invitation has to give the person at least one role. Choose the role they are being " +
  "invited to do, then send the invitation.";

export const INVALID_EMAIL_MESSAGE =
  "That does not look like an email address. Check it and try again — the invitation is the " +
  "only way this person gets in, so it has to go to an address they can read.";

const NAME_REQUIRED_MESSAGE =
  "A new person needs a first name and a last name. If they are already in the club's records, " +
  "choose them from the list of possible matches instead of creating a second record.";

const MERGED_PERSON_RULE = "operator_invitation_person_merged";
const MERGED_PERSON_MESSAGE =
  "That record has been merged into another one and is kept only for history. Invite the " +
  "record it was merged into.";

const BACKDATING_REASON_MESSAGE =
  "A role that starts before today has to say why it is being backdated. Record the reason " +
  "and try again.";

const DUPLICATE_ROLE_RULE = "operator_invitation_duplicate_role";
const DUPLICATE_ROLE_MESSAGE =
  "That role has been chosen twice. Choose each role once — one person can hold several " +
  "different roles, but not the same one twice.";

const INVALID_DATE_RULE = "operator_invitation_date_invalid";
const INVALID_DATE_MESSAGE =
  "That start date is not a date. Give the day the role begins, or leave it blank for today.";

/** A calendar day, as a `date` column stores one. Not a validity check — only a shape. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const CALLBACK_URL_RULE = "operator_invitation_callback_url_required";
export const CALLBACK_URL_MESSAGE =
  "This installation does not know its own web address, so it cannot build an invitation " +
  "link. Set APP_BASE_URL and try again.";

export function blankToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** The address, trimmed and lowercased and stored that way — unlike `contact_points.raw_value`. */
export function normaliseEmail(value: string): string {
  return (value ?? "").trim().toLowerCase();
}

export function requireOperator(operator: ResolvedOperator | null): ResolvedOperator {
  if (!operator) {
    throw new NotPermitted("You do not have access to this action. Sign in first.", {
      rule: "operator_required",
    });
  }
  return operator;
}

/** The capability floor, for the two reads in this module — a duplicate search has no target to guard against. */
export function assertAdministrationCapability(
  operator: ResolvedOperator | null,
): ResolvedOperator {
  return assertCapability(requireOperator(operator), ADMINISTRATION_CAPABILITY);
}

export function administrationAuthority(operator: ResolvedOperator | null) {
  const resolved = requireOperator(operator);
  return {
    kind: "capability" as const,
    capability: ADMINISTRATION_CAPABILITY,
    roleCodes: resolved.roleCodes,
  };
}

/** The target-level guard, once per role the invitation confers. */
export function assertEachRolePermitted(
  operator: ResolvedOperator | null,
  subject: AdministrationSubject,
  roles: readonly ResolvedRole[],
): void {
  for (const entry of roles) {
    assertAdministrationTarget(operator, {
      action: "assign_role",
      target: subject,
      roleCode: entry.role.code,
    });
  }
}

export function refuseUnlessResendable(account: OperatorAccountRecord): void {
  if (operatorAccountState(account.state).resendAvailable) return;

  const definition = operatorAccountState(account.state);
  throw new InvalidTransition(
    `This operator's access is "${definition.label}", so there is no invitation to send. ` +
      `${definition.description}`,
    { rule: NOT_RESENDABLE_RULE },
  );
}

export async function requireAccount(
  tx: Tx,
  operatorAccountId: string,
): Promise<OperatorAccountRecord> {
  const account = await readOperatorAccountIn(tx, operatorAccountId);
  if (!account) {
    throw new NotFound("That operator record no longer exists.", {
      rule: "operator_account_not_found",
    });
  }
  return account;
}

/** The same read, holding the row for the rest of the transaction — the lock comes first, the record is read behind it. */
export async function lockAccount(
  tx: Tx,
  operatorAccountId: string,
): Promise<OperatorAccountRecord> {
  const locked = await tx.query<{ id: string }>(
    "select id from public.operator_accounts where id = $1 for update",
    [operatorAccountId],
  );
  if (locked.rows.length === 0) {
    throw new NotFound("That operator record no longer exists.", {
      rule: "operator_account_not_found",
    });
  }
  return requireAccount(tx, operatorAccountId);
}

/**
 * Refuses an address another operator login already holds.
 *
 * LAN-311: it names the holder and the state their access is in. The refusal
 * used to say only "that email address already has an operator login", which
 * left the administrator to go and find out who — and, because inviting a
 * second seat to somebody who already has an account is the ordinary case for
 * a club this size, this is the refusal they meet most. Naming a person here
 * discloses nothing: every caller has already passed `role_management`, and the
 * record being named is one they can open from this screen.
 */
export async function refuseTakenEmail(
  tx: Tx,
  email: string,
  exceptAccountId: string | null,
): Promise<void> {
  const found = await tx.query<{ id: string }>(
    `select id from public.operator_accounts
      where lower(login_email) = lower($1)
        and ($2::uuid is null or id <> $2::uuid)
      limit 1`,
    [email, exceptAccountId],
  );
  if (found.rows.length === 0) return;

  // Two more reads, on a path that is about to refuse anyway: whose account it
  // is, and what state it is in. Reusing the one projection rather than
  // hand-joining `people` keeps the state derivation in a single place.
  const account = await readOperatorAccountIn(tx, found.rows[0].id);
  const holder = account === null ? null : await readPersonName(tx, account.personId);

  throw new Conflict(
    emailAlreadyHasLoginMessage(holder, account && operatorAccountState(account.state).label),
    { rule: EMAIL_ALREADY_HAS_LOGIN_RULE },
  );
}

/** The holder's name for a refusal sentence, or `null` if the record has gone between the two reads. */
async function readPersonName(tx: Tx, personId: string): Promise<string | null> {
  const result = await tx.query<{ given_name: string | null; family_name: string | null }>(
    "select given_name, family_name from public.people where id = $1",
    [personId],
  );
  if (result.rows.length === 0) return null;
  const name = [result.rows[0].given_name, result.rows[0].family_name]
    .filter((part) => Boolean(part && part.trim() !== ""))
    .join(" ");
  return name === "" ? null : name;
}

/** The Person named must exist, must not be merged away, and must have no login. */
export async function requireInvitablePerson(tx: Tx, personId: string): Promise<string> {
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

export async function createOrLinkPerson(
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
    throw new ConstraintViolated(NAME_REQUIRED_MESSAGE, { rule: NAME_REQUIRED_RULE });
  }

  const knownAs = blankToNull(subject.knownAs);
  const inserted = await tx.query<{ id: string }>(
    `insert into public.people (given_name, family_name)
     values ($1, $2)
     returning id`,
    [givenName, familyName],
  );
  const personId = inserted.rows[0].id;

  // LAN-182: known-as is a display alias, not a column — see decision history.
  if (knownAs !== null && knownAs.toLowerCase() !== givenName.toLowerCase()) {
    await tx.query(
      `insert into public.person_aliases (person_id, alias, source, is_display_name)
       values ($1::uuid, $2, 'operator invitation', true)
       on conflict (person_id, alias) do nothing`,
      [personId, knownAs],
    );
  }

  // An existing Person's contact points are deliberately untouched — out of scope (`REQ-invite-existing-person`).
  await insertContactPoint(tx, personId, "email", email);
  const phone = requireInvitationPhone(subject.phone);
  if (phone !== null) await insertContactPoint(tx, personId, "phone", phone);

  return { personId, personCreated: true };
}

/**
 * LAN-332. The invitation form posted free text and this module stored it, so
 * a number recorded at invitation could be in a shape nothing else in the
 * club's records uses. One validator — `validatePhoneNumber`, the one every
 * other door already runs — and the `+`-prefixed form the shared phone control
 * posts is what lands in `contact_points.raw_value`, exactly as it does from
 * `person-create.ts`. Blank stays blank: the field is optional.
 */
function requireInvitationPhone(raw: string | null | undefined): string | null {
  const phone = blankToNull(raw);
  if (phone === null) return null;

  const validation = validatePhoneNumber(phone);
  if (!validation.valid) {
    throw new ConstraintViolated(validation.message, { rule: INVALID_PHONE_RULE });
  }
  return phone;
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

export async function insertOperatorAccount(
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

export interface RoleRow {
  id: string;
  code: string;
  scope: "committee_year" | "season";
  is_constitutional_office: boolean;
  is_single_holder_seat: boolean;
}

/** Every requested role, resolved against the catalogue exactly (not normalised), with its dates checked. */
export async function resolveRoles(
  tx: Tx,
  requested: readonly InitialRoleAssignment[],
): Promise<ResolvedRole[]> {
  const today = await currentDateIn(tx);
  const resolved: ResolvedRole[] = [];

  for (const entry of requested) {
    // Not trimmed — `" kit_manager "` is refused, not tidied up. See decision history.
    const code = entry.roleCode ?? "";
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
      throw new ConstraintViolated(DUPLICATE_ROLE_MESSAGE, { rule: DUPLICATE_ROLE_RULE });
    }

    const effectiveFrom = blankToNull(entry.effectiveFrom) ?? today;
    if (!ISO_DATE.test(effectiveFrom)) {
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
