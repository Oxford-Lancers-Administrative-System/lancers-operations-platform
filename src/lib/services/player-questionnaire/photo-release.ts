import { withTransaction } from "@/lib/db";
import {
  PRINTED_NAME_REQUIRED_MESSAGE,
  readLastSubmittedAgreementFormIn,
  type OnboardingAgreement,
} from "../onboarding-agreements";
import { type PersonRecord } from "../person-record";
import { agreeOnboardingDocument } from "./later-steps";

/**
 * Step 3 — the photo release, which since LAN-347 is the University of
 * Oxford's own "Photograph / filming / interview consent form".
 *
 * The wording is the versioned row's (`onboarding_agreement_versions`), and the
 * page renders it; this module owns everything the page must not: which boxes
 * are required, and where the submitted form is kept.
 *
 * **It writes nothing to the person record** — Brian, 2026-09-14, decision 4:
 * "Nothing in this form should change anything else. If I add an address, it
 * shouldn't change anything. If I change my name here, it should prefill that
 * information, but the only place this goes is into the onboarding form with
 * the information they put there. It's just a record."
 *
 * So there is no `applyDisputableFieldIn` here and no `supersedeContactPoint`:
 * a name, phone or email typed on this form is what this person wrote on this
 * form on this day, stored with the agreement and read back nowhere else. The
 * record's own name, phone and email are what the contact step wrote and stay
 * exactly as they are, whatever is typed here.
 *
 * That also decides the validation. There is no shape check on the phone or the
 * email, because nothing downstream will ever send to them: they are stored as
 * submitted, whatever they are. The three boxes that must be filled are the
 * ones the University's form leaves no room to skip — the address, the post
 * code and the printed name — plus the tick.
 */

/** Every field the consent form posts. */
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

/** The three boxes a refusal can name. `name`, `tel` and `email` are never refused — whatever is typed is what was written. */
type PhotoReleaseField = "address" | "postcode" | "printedName";

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
 * A textarea posts its line breaks as CRLF. The address is the one multi-line
 * box on the form, and a carriage return stored in the middle of it is a
 * character nothing ever wants to read back — least of all the next open of
 * this form, which prints it straight back into the box.
 */
function normaliseAddressLines(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

export interface PhotoReleasePrefill {
  name: string;
  address: string;
  postcode: string;
  tel: string;
  email: string;
  printedName: string;
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

/**
 * What the step shows when it is opened — starting values only, every one of
 * them editable and none of them written back (decision 5).
 *
 * Name, Tel and Email start from the record, because the club already holds
 * them and the player should not retype what it knows. Address and Post code
 * start empty the first time — the record holds no postal address at all — and
 * on a reopen start from the form this person last submitted this season.
 * Print name always starts empty: it stands where a signature would, and it is
 * the one box the player has to type themselves.
 */
export function photoReleasePrefill(
  record: PersonRecord,
  lastSubmitted: OnboardingAgreement | null,
): PhotoReleasePrefill {
  return {
    name: record.displayName,
    address: lastSubmitted?.form.address ?? "",
    postcode: lastSubmitted?.form.postcode ?? "",
    tel: currentContactValue(record, "phone", null),
    email: currentContactValue(record, "email", "personal"),
    printedName: "",
  };
}

/** The form this person last submitted for the photo release this season — the prefill's second source. */
export async function readLastPhotoReleaseForm(
  personId: string,
  seasonId: string,
): Promise<OnboardingAgreement | null> {
  return withTransaction((tx) =>
    readLastSubmittedAgreementFormIn(tx, { personId, seasonId, agreementType: "photo_release" }),
  );
}

/**
 * Records the agreement and the form it was given on, and touches nothing else.
 *
 * The three required answers are the address, the post code and the printed
 * name, plus the tick — LAN-347's acceptance ("they cannot continue without
 * address, postcode, printed name and the tick; refusals name what is
 * missing"). A refusal saves nothing at all, which is the whole of decision 4:
 * a submission that does not complete the form leaves the database exactly
 * where it found it.
 */
export async function savePhotoRelease(input: PhotoReleaseInput): Promise<PhotoReleaseResult> {
  const errors: PhotoReleaseResult["errors"] = {};

  const address = normaliseAddressLines(input.address).trim();
  const postcode = input.postcode.trim();
  const printedName = input.printedName.trim();

  if (address === "") errors.address = ADDRESS_REQUIRED_MESSAGE;
  if (postcode === "") errors.postcode = POSTCODE_REQUIRED_MESSAGE;
  if (printedName === "") errors.printedName = PRINTED_NAME_REQUIRED_MESSAGE;

  if (Object.keys(errors).length > 0 || !input.agreed) {
    return { errors, agreeError: !input.agreed, agreement: null };
  }

  const agreement = await agreeOnboardingDocument({
    personId: input.personId,
    seasonId: input.seasonId,
    membershipId: input.membershipId,
    agreementType: "photo_release",
    printedName,
    // As submitted, whatever it is. Blank is "not given" and is stored as null.
    form: {
      name: input.name,
      address,
      postcode,
      tel: input.tel,
      email: input.email,
    },
  });

  return { errors, agreeError: false, agreement };
}
