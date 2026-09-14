import { withTransaction } from "@/lib/db";
import { EMAIL_SHAPE, PHONE_SHAPE } from "@/app/operate/roster/new/validation";
import { looksLikeEmail, looksLikePhone } from "@/lib/validation/contact";
import { recordOnboardingActivityIn } from "../onboarding-activity-log";
import { PRINTED_NAME_REQUIRED_MESSAGE, type OnboardingAgreement } from "../onboarding-agreements";
import { readPersonRecord, type PersonRecord } from "../person-record";
import { normaliseAddressLines, supersedeContactPoint } from "../person-write";
import { applyDisputableFieldIn } from "./provenance";
import { agreeOnboardingDocument } from "./later-steps";

/**
 * Step 3 — the photo release, which since LAN-347 is the University of
 * Oxford's own "Photograph / filming / interview consent form".
 *
 * The wording is the versioned row's (`onboarding_agreement_versions`), and the
 * page renders it; this module owns everything the page must not: what the
 * fields are required, which record each one lands on, and in what order.
 *
 * Every field goes to the record the contact step already writes to —
 * `applyDisputableFieldIn` for the `people` columns, `supersedeContactPoint`
 * for the phone and the email — so a value typed here is a correction like any
 * other, with the same audit row and the same last-write-wins rule (B-002).
 * The address and post code are new columns, not a new mechanism.
 *
 * F1 (LAN-230, Brian: "whatever a step saved stays saved") applies here too:
 * a submission missing the address still saves the name, phone and email the
 * player corrected, and refuses only the agreement.
 */

/** Every field the consent form posts. Blank is legal for all of them here; required-ness is decided below. */
export interface PhotoReleaseInput {
  personId: string;
  seasonId: string;
  membershipId: string;
  /** The form's own "Name" box — one line, as the paper form prints it. */
  name: string;
  address: string;
  postcode: string;
  tel: string;
  email: string;
  printedName: string;
  agreed: boolean;
}

type PhotoReleaseField = "name" | "address" | "postcode" | "tel" | "email" | "printedName";

export interface PhotoReleaseResult {
  /** Field name → the sentence shown against it. Empty when the agreement was recorded. */
  errors: Partial<Record<PhotoReleaseField, string>>;
  /** Set only when the tick was missing — it belongs to no field. */
  agreeError: boolean;
  agreement: OnboardingAgreement | null;
}

export const ADDRESS_REQUIRED_MESSAGE = "Address is required.";
export const POSTCODE_REQUIRED_MESSAGE = "Post code is required.";

/**
 * Splits the form's single "Name" box back into the two columns the record
 * holds. The paper form prints one box, so the page shows one; `people` has
 * held a first and a last name since LAN-183 and this is not the step to
 * change that.
 *
 * The last whitespace-separated word is the family name and everything before
 * it the given name — the same reading a human gives "Lysander Aurelius
 * Croft". A single word is a given name alone, and leaves the family name
 * untouched rather than blanking it. This only ever runs on a name the player
 * actually changed: an unedited box is equal to the record and writes nothing.
 */
export function splitTypedName(typed: string): { givenName: string; familyName: string | null } {
  const parts = typed.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { givenName: "", familyName: null };
  if (parts.length === 1) return { givenName: parts[0], familyName: null };
  return { givenName: parts.slice(0, -1).join(" "), familyName: parts[parts.length - 1] };
}

function currentContactValue(
  record: PersonRecord,
  kind: "email" | "phone",
  scope: "college" | "personal" | null,
): string {
  const current = record.contacts.find(
    (contact) => contact.kind === kind && contact.scope === scope && contact.validUntil === null,
  );
  return current?.rawValue ?? "";
}

/** What the step shows when it is opened — every value the record already holds, ready to be edited in place. */
export function photoReleasePrefill(record: PersonRecord): {
  name: string;
  address: string;
  postcode: string;
  tel: string;
  email: string;
  printedName: string;
} {
  return {
    name: record.displayName,
    address: record.address ?? "",
    postcode: record.postcode ?? "",
    tel: currentContactValue(record, "phone", null),
    email: currentContactValue(record, "email", "personal"),
    printedName: record.displayName,
  };
}

/**
 * Saves what the consent form collected and records the agreement.
 *
 * The three required answers are the address, the post code and the printed
 * name, plus the tick — LAN-347's acceptance ("they cannot continue without
 * address, postcode, printed name and the tick; refusals name what is
 * missing"). The name, phone and email are prefilled conveniences: a player
 * who blanks one is not blocked, and a blank never clears a recorded value.
 */
export async function savePhotoRelease(input: PhotoReleaseInput): Promise<PhotoReleaseResult> {
  const current = await readPersonRecord(input.personId);
  const errors: PhotoReleaseResult["errors"] = {};

  const address = normaliseAddressLines(input.address).trim();
  const postcode = input.postcode.trim();
  const printedName = input.printedName.trim();
  const tel = input.tel.trim();
  const email = input.email.trim();

  if (address === "") errors.address = ADDRESS_REQUIRED_MESSAGE;
  if (postcode === "") errors.postcode = POSTCODE_REQUIRED_MESSAGE;
  if (printedName === "") errors.printedName = PRINTED_NAME_REQUIRED_MESSAGE;

  // Shape, on the same footing as step 1: checked only for a value that
  // changed, and a failure leaves that one field unwritten without touching
  // any other.
  const telChanged = tel !== "" && tel !== currentContactValue(current, "phone", null);
  if (telChanged && !looksLikePhone(tel)) errors.tel = PHONE_SHAPE;
  const emailChanged = email !== "" && email !== currentContactValue(current, "email", "personal");
  if (emailChanged && !looksLikeEmail(email)) errors.email = EMAIL_SHAPE;

  // Every field that validated is written, whatever else failed (F1).
  const typedName = splitTypedName(input.name);
  if (typedName.givenName !== "" && typedName.givenName !== current.givenName) {
    await withTransaction((tx) =>
      applyDisputableFieldIn(tx, {
        personId: input.personId,
        field: "given_name",
        currentRecord: current,
        newValue: typedName.givenName,
      }),
    );
  }
  if (typedName.familyName !== null && typedName.familyName !== (current.familyName ?? "")) {
    await withTransaction((tx) =>
      applyDisputableFieldIn(tx, {
        personId: input.personId,
        field: "family_name",
        currentRecord: current,
        newValue: typedName.familyName as string,
      }),
    );
  }
  if (address !== "") {
    await withTransaction((tx) =>
      applyDisputableFieldIn(tx, {
        personId: input.personId,
        field: "address",
        currentRecord: current,
        newValue: address,
      }),
    );
  }
  if (postcode !== "") {
    await withTransaction((tx) =>
      applyDisputableFieldIn(tx, {
        personId: input.personId,
        field: "postcode",
        currentRecord: current,
        newValue: postcode,
      }),
    );
  }
  if (telChanged && !errors.tel) {
    await supersedeContactPoint({
      actorPersonId: input.personId,
      personId: input.personId,
      kind: "phone",
      rawValue: tel,
      source: "player self-service",
      reason: "Player self-service correction.",
    });
  }
  if (emailChanged && !errors.email) {
    await supersedeContactPoint({
      actorPersonId: input.personId,
      personId: input.personId,
      kind: "email",
      scope: "personal",
      rawValue: email,
      source: "player self-service",
      reason: "Player self-service correction.",
    });
  }

  // What the player typed is saved either way; the agreement itself is not
  // recorded until the form is complete and ticked.
  if (Object.keys(errors).length > 0 || !input.agreed) {
    if (Object.keys(errors).length > 0) {
      await withTransaction((tx) =>
        recordOnboardingActivityIn(tx, {
          membershipId: input.membershipId,
          seasonId: input.seasonId,
          section: "Photo release",
          kind: "answer",
          channel: "signed link",
          actorPersonId: input.personId,
        }),
      );
    }
    return { errors, agreeError: !input.agreed, agreement: null };
  }

  const agreement = await agreeOnboardingDocument({
    personId: input.personId,
    seasonId: input.seasonId,
    membershipId: input.membershipId,
    agreementType: "photo_release",
    printedName,
  });

  return { errors, agreeError: false, agreement };
}
