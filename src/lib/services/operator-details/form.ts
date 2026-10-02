import "server-only";

import { isServiceError, type Tx, withTransaction } from "@/lib/db";
import { recordAudit } from "../audit";
import { openAccountFromDetails } from "../operator-administration/seat-account";
import type { OperatorIdentityPort } from "../operator-identity";
import { recordClassifiedEmailIn } from "../person-email-classification";
import { readPersonRecordIn, type PersonRecord } from "../person-record";
import type { RequiredField } from "../person-required";
import {
  isOxfordCollegeEmail,
  validateDateOfBirth,
  validateEmailAddress,
  validatePhoneNumber,
} from "../person-validation";
import { supersedeContactPoint, updatePersonField, type PersonFieldUpdate } from "../person-write";
import { resolvePersonTokenIn, revokePersonTokenIn } from "../player-answer-tokens";
import { findCurrentSeasonIn } from "../seasons";
import {
  missingOperatorDetails,
  operatorDetailsDueIn,
  OPERATOR_DETAILS_RECEIVED_ACTION,
} from "./facts";
import {
  OPERATOR_DETAILS_FIELDS,
  OPERATOR_DETAILS_LABELS,
  REQUIRED_OPERATOR_DETAILS,
  type OperatorDetailsErrors,
  type OperatorDetailsField,
  type OperatorDetailsValues,
} from "./fields";

/**
 * The operator details form — LAN-459. One service behind one form, used
 * signed in (`/me/details`, mandatory after first sign-in until complete) and
 * from the WhatsApp link (`/onboarding/<t>`, an `operator_details` credential).
 *
 * Who is asked what: an operator with no recruit record this season and no
 * place on this season's roster gets the whole form, prefilled with whatever
 * the club has; a recruit or player who is also an operator is asked only for
 * the personal facts still missing.
 */

/** Which form field completes which required fact. */
const FIELD_FOR_FACT: Partial<Record<RequiredField, OperatorDetailsField>> = {
  given_name: "givenName",
  family_name: "familyName",
  mobile: "mobile",
  personal_email: "personalEmail",
};

/** The provenance a value saved from this form carries on the person record. */
const SOURCE = "operator details form";
const REPLACED_REASON = "Supplied by the person on the operator details form.";

const CONTACT_IN_USE_MESSAGE = "Already held by another record.";
const LOGIN_IN_USE_MESSAGE = "Already used to sign in by another account.";
export const COLLEGE_ADDRESS_MESSAGE = "Give a personal email, not a college address.";

export interface OperatorDetailsView {
  readonly personId: string;
  readonly values: OperatorDetailsValues;
  /** The fields this person is asked, in form order. */
  readonly fields: readonly OperatorDetailsField[];
  readonly missing: readonly RequiredField[];
}

function currentContact(record: PersonRecord, kind: "phone" | "email"): string {
  const contact = record.contacts.find(
    (c) => c.kind === kind && c.validUntil === null && (kind === "phone" || c.scope === "personal"),
  );
  return contact?.rawValue ?? "";
}

async function onRecruitOrRosterThisSeasonIn(tx: Tx, personId: string): Promise<boolean> {
  const season = await findCurrentSeasonIn(tx);
  if (season === null) return false;
  const found = await tx.query(
    `select 1 from public.recruitment_prospects where person_id = $1::uuid and season_id = $2::uuid
     union all
     select 1 from public.season_memberships where person_id = $1::uuid and season_id = $2::uuid
     limit 1`,
    [personId, season.id],
  );
  return found.rows.length > 0;
}

export async function readOperatorDetailsViewIn(
  tx: Tx,
  personId: string,
): Promise<OperatorDetailsView> {
  const record = await readPersonRecordIn(tx, personId);
  const missing = missingOperatorDetails(record);
  const fields = (await onRecruitOrRosterThisSeasonIn(tx, personId))
    ? OPERATOR_DETAILS_FIELDS.filter((field) =>
        missing.some((fact) => FIELD_FOR_FACT[fact] === field),
      )
    : OPERATOR_DETAILS_FIELDS;
  return {
    personId,
    fields,
    missing,
    values: {
      givenName: record.givenName,
      middleName: record.middleName ?? "",
      familyName: record.familyName ?? "",
      knownAs: record.knownAs ?? "",
      mobile: currentContact(record, "phone"),
      personalEmail: currentContact(record, "email"),
      dateOfBirth: record.dateOfBirth ?? "",
    },
  };
}

/** Is the form due for this signed-in operator? See `facts.ts`. */
export async function readOperatorDetailsDue(personId: string): Promise<boolean> {
  return withTransaction((tx) => operatorDetailsDueIn(tx, personId));
}

export async function readOperatorDetailsView(personId: string): Promise<OperatorDetailsView> {
  return withTransaction((tx) => readOperatorDetailsViewIn(tx, personId));
}

export type OperatorDetailsSaveResult =
  | { readonly ok: true; readonly email: string | null }
  | { readonly ok: false; readonly errors: OperatorDetailsErrors };

/** Every refusal, before anything is written, so a refused save writes nothing. */
async function validateIn(
  tx: Tx,
  personId: string,
  shown: ReadonlySet<OperatorDetailsField>,
  values: OperatorDetailsValues,
  refuseTakenLogin: boolean,
): Promise<OperatorDetailsErrors> {
  const errors: OperatorDetailsErrors = {};
  for (const field of shown) {
    if (REQUIRED_OPERATOR_DETAILS.has(field) && values[field] === "") {
      errors[field] = `${OPERATOR_DETAILS_LABELS[field]} is required.`;
    }
  }

  if (shown.has("mobile") && !errors.mobile) {
    const phone = validatePhoneNumber(values.mobile);
    if (!phone.valid) errors.mobile = phone.message;
  }

  if (shown.has("dateOfBirth") && values.dateOfBirth !== "") {
    const birth = validateDateOfBirth(values.dateOfBirth);
    if (!birth.valid) errors.dateOfBirth = birth.message;
  }

  if (shown.has("personalEmail") && !errors.personalEmail) {
    const email = validateEmailAddress(values.personalEmail);
    if (!email.valid) {
      errors.personalEmail = email.message;
    } else if (isOxfordCollegeEmail(values.personalEmail)) {
      // LAN-462 stores an Oxford address as college email, which would leave
      // the personal email this form completes still missing.
      errors.personalEmail = COLLEGE_ADDRESS_MESSAGE;
    } else {
      const held = await tx.query(
        `select 1 from public.contact_points c
           join public.people p on p.id = c.person_id
          where c.kind = 'email' and c.valid_until is null
            and lower(btrim(c.raw_value)) = lower($1::text)
            and c.person_id <> $2::uuid and p.merged_into_person_id is null
          limit 1`,
        [values.personalEmail, personId],
      );
      if (held.rows.length > 0) errors.personalEmail = CONTACT_IN_USE_MESSAGE;
      else if (refuseTakenLogin) {
        const login = await tx.query(
          `select 1 from public.operator_accounts
            where lower(login_email) = lower($1::text) and person_id <> $2::uuid
            limit 1`,
          [values.personalEmail, personId],
        );
        if (login.rows.length > 0) errors.personalEmail = LOGIN_IN_USE_MESSAGE;
      }
    }
  }
  return errors;
}

const PERSON_FIELD: Partial<Record<OperatorDetailsField, PersonFieldUpdate["field"]>> = {
  givenName: "given_name",
  middleName: "middle_name",
  familyName: "family_name",
  dateOfBirth: "date_of_birth",
};

const RECORD_VALUE: Partial<Record<OperatorDetailsField, keyof PersonRecord>> = {
  givenName: "givenName",
  middleName: "middleName",
  familyName: "familyName",
  dateOfBirth: "dateOfBirth",
};

/**
 * Validates, then writes each changed fact through the person record's own
 * audited writers (`person-write`), so provenance reads as everywhere else.
 * The email goes through LAN-462's one classification rule. A blank optional
 * field never clears what the club holds.
 */
export async function saveOperatorDetails(input: {
  readonly personId: string;
  readonly actorPersonId: string;
  readonly values: OperatorDetailsValues;
  /** The link path, where saving opens an account: the email must not already sign somebody else in. */
  readonly refuseTakenLogin?: boolean;
}): Promise<OperatorDetailsSaveResult> {
  const { personId, actorPersonId, values } = input;
  const prepared = await withTransaction(async (tx) => {
    const view = await readOperatorDetailsViewIn(tx, personId);
    const shown = new Set(view.fields);
    const errors = await validateIn(tx, personId, shown, values, input.refuseTakenLogin ?? false);
    return { view, shown, errors, record: await readPersonRecordIn(tx, personId) };
  });
  if (Object.keys(prepared.errors).length > 0) return { ok: false, errors: prepared.errors };
  const { shown, record } = prepared;

  for (const field of ["givenName", "middleName", "familyName", "dateOfBirth"] as const) {
    if (!shown.has(field) || values[field] === "") continue;
    const current = record[RECORD_VALUE[field]!] as string | null;
    if ((current ?? "") === values[field]) continue;
    await updatePersonField({
      actorPersonId,
      personId,
      reason: current === null ? null : REPLACED_REASON,
      field: PERSON_FIELD[field]!,
      value: values[field],
    } as Parameters<typeof updatePersonField>[0]);
  }

  if (shown.has("mobile") && values.mobile !== currentContact(record, "phone")) {
    await supersedeContactPoint({
      actorPersonId,
      personId,
      kind: "phone",
      rawValue: values.mobile,
      source: SOURCE,
      reason: currentContact(record, "phone") === "" ? null : REPLACED_REASON,
    });
  }

  await withTransaction(async (tx) => {
    if (shown.has("knownAs") && values.knownAs !== "" && values.knownAs !== record.knownAs) {
      await setKnownAsIn(tx, { personId, actorPersonId, knownAs: values.knownAs });
    }
    if (shown.has("personalEmail")) {
      const recorded = await recordClassifiedEmailIn(tx, {
        personId,
        address: values.personalEmail,
        source: SOURCE,
      });
      if (recorded.kind !== "already_recorded") {
        await recordAudit(tx, {
          actorPersonId,
          action: "person_contact_recorded",
          entityTable: "people",
          entityId: personId,
          toState: values.personalEmail,
          context: { issue: "LAN-459", kind: "email", scope: recorded.scope, source: SOURCE },
        });
      }
    }
    await recordAudit(tx, {
      actorPersonId,
      action: OPERATOR_DETAILS_RECEIVED_ACTION,
      entityTable: "people",
      entityId: personId,
      toState: "received",
      context: { issue: "LAN-459", fields: [...shown] },
    });
  });

  const email = shown.has("personalEmail")
    ? values.personalEmail
    : currentContact(record, "email") || null;
  return { ok: true, email };
}

/**
 * Known as is the display alias (LAN-182): the alias is added if the person
 * does not carry it, and flagged as the display name. Equal to the first name
 * means no alias, as Invite operator already treats it.
 */
async function setKnownAsIn(
  tx: Tx,
  input: { personId: string; actorPersonId: string; knownAs: string },
): Promise<void> {
  const given = await tx.query<{ given_name: string }>(
    "select given_name from public.people where id = $1::uuid",
    [input.personId],
  );
  if ((given.rows[0]?.given_name ?? "").toLowerCase() === input.knownAs.toLowerCase()) return;
  await tx.query(
    `insert into public.person_aliases (person_id, alias, source)
     values ($1::uuid, $2, $3)
     on conflict (person_id, alias) do nothing`,
    [input.personId, input.knownAs, SOURCE],
  );
  await tx.query(
    `update public.person_aliases set is_display_name = (alias = $2)
      where person_id = $1::uuid and (is_display_name or alias = $2)`,
    [input.personId, input.knownAs],
  );
  await recordAudit(tx, {
    actorPersonId: input.actorPersonId,
    action: "person_alias_display_name_set",
    entityTable: "people",
    entityId: input.personId,
    toState: input.knownAs,
    context: { issue: "LAN-459", person_id: input.personId },
  });
}

/** The person a live `operator_details` link opens, or `null`. Writes nothing. */
export async function resolveOperatorDetailsLinkIn(
  tx: Tx,
  token: string,
): Promise<{ personId: string; seasonId: string } | null> {
  const resolution = await resolvePersonTokenIn(tx, token, "operator_details");
  return resolution.state === "valid" ? resolution.resolved : null;
}

export type LinkSaveResult =
  | { readonly kind: "unknown" }
  | { readonly kind: "invalid"; readonly errors: OperatorDetailsErrors }
  | { readonly kind: "saved"; readonly invitationEmail: string | null };

/**
 * The phone-only person's save, from the WhatsApp link: the details, then the
 * link revoked (it dies on save), then — no operator step — their account and
 * the sign-in invitation to the email they supplied. If opening the account is
 * refused after the details are saved, the details stand and the seat page's
 * Send invitation recovers it, the email now being on record.
 */
export async function completeOperatorDetailsFromLink(input: {
  readonly token: string;
  readonly values: OperatorDetailsValues;
  readonly callbackUrl: string;
  readonly identity?: OperatorIdentityPort;
}): Promise<LinkSaveResult> {
  const link = await withTransaction((tx) => resolveOperatorDetailsLinkIn(tx, input.token));
  if (link === null) return { kind: "unknown" };

  const saved = await saveOperatorDetails({
    personId: link.personId,
    actorPersonId: link.personId,
    values: input.values,
    refuseTakenLogin: true,
  });
  if (!saved.ok) return { kind: "invalid", errors: saved.errors };

  await withTransaction((tx) =>
    revokePersonTokenIn(tx, link.personId, link.seasonId, "Operator details saved.", {
      purpose: "operator_details",
    }),
  );

  if (saved.email === null) return { kind: "saved", invitationEmail: null };
  try {
    const invitation = await openAccountFromDetails({
      personId: link.personId,
      email: saved.email,
      callbackUrl: input.callbackUrl,
      identity: input.identity,
    });
    return {
      kind: "saved",
      invitationEmail: invitation?.delivered ? invitation.loginEmail : null,
    };
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return { kind: "saved", invitationEmail: null };
  }
}
