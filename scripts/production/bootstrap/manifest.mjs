/**
 * The founding-operator manifest: what Brian supplies at run time, and every
 * reason this script refuses it — LAN-135, mission M-OPERATOR-ADMIN-WITHOUT-SQL,
 * `REQ-one-time-bootstrap`.
 *
 * Pure. No database, no network, no `process`. Every rule below is provable
 * from a plain object, which is what `tests/production-bootstrap-contract.test.ts`
 * does.
 *
 * ## Why the identities are a file and not arguments
 *
 * The exact names and personal email addresses of the club's first three
 * administrators are real member data. `AGENTS.md` is unambiguous that no real
 * member data enters this repository, and the mission brief adds that they must
 * not enter a commit, Linear, a log or a prompt either. So they are not checked
 * in, not defaulted, not inferred, and not passed on the command line — where
 * they would land in shell history — but read from a JSON file Brian writes
 * outside the repository and deletes afterwards.
 *
 * This module therefore contains **no name and no address**, only the shape one
 * has to have. The synthetic values in the contract test are obviously
 * synthetic for the same reason.
 *
 * ## The minimum manifest
 *
 * `REQ-one-time-bootstrap` says the bootstrap establishes "**at least** Clint as
 * active-year President, Stewart as standing General Manager and Brian as
 * standing IT Officer". "At least" is read literally: those three seats must be
 * present or the manifest is refused, and further seats from the approved
 * catalogue are permitted.
 *
 * The three names are Brian's to supply; the three **role codes** are the
 * requirement's, so they are the thing pinned here.
 *
 * ## "Standing" is not a column
 *
 * The requirement calls the General Manager and IT Officer seats *standing* and
 * the President seat *active-year*. `supabase/migrations/20260819090100_role_catalogue.sql`
 * records what that means: `DEC-general-manager-standing` "makes both seats
 * standing across operating years, which is a statement about how an assignment
 * is **renewed** rather than about which cycle it names". All three roles are
 * `committee_year`-scoped in the approved catalogue, so all three assignments
 * this script writes have the same shape — open-ended, against the one active
 * committee year. Nothing here invents a storage difference the schema does not
 * have, and nothing here decides renewal policy; that stays a club decision
 * recorded against the seat.
 */

/**
 * The three seats `REQ-one-time-bootstrap` names, as `public.roles.code`.
 *
 * Frozen, and checked against the catalogue at run time as well: a code that is
 * not in `public.roles` fails loudly rather than silently provisioning nobody.
 */
export const REQUIRED_ROLE_CODES = Object.freeze(["president", "general_manager", "it_officer"]);

/**
 * The value that says "I know a Person may match; create a new one anyway".
 *
 * Written out rather than implied by omission, because omission means the
 * opposite: an omitted `personId` asks the script to *look*, and a look that
 * finds a candidate refuses the run. See `plan.mjs`.
 */
export const PERSON_NEW = "new";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a canonical UUID. Identifiers come from the database. */
export function isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/**
 * The same coarse address check the application applies, restated.
 *
 * A deliberate reimplementation, not a reuse: `looksLikeEmailAddress` lives in
 * `src/lib/auth/recovery.ts`, which is TypeScript that ships inside the
 * container, and this is a standalone operator script that must not import it.
 * The duplication is the cost of that separation and
 * `tests/production-bootstrap-contract.test.ts` pays it, running both over one
 * table of addresses and failing if they ever disagree — the arrangement
 * `src/lib/db/url.ts` already documents for the two local-only guards.
 */
export function looksLikeEmailAddress(value) {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > 320) return false;
  if (/\s/.test(value)) return false;
  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@")) return false;
  const domain = value.slice(at + 1);
  return (
    domain.length > 2 && domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".")
  );
}

/** A refusal a human can act on, carrying a stable rule for a test to match. */
export class ManifestRefused extends Error {
  constructor(message, rule) {
    super(message);
    this.name = "ManifestRefused";
    this.rule = rule;
  }
}

function refuse(message, rule) {
  throw new ManifestRefused(message, rule);
}

function requiredText(value, field, index) {
  if (typeof value !== "string" || value.trim() === "") {
    refuse(`Operator ${index + 1}: "${field}" must be given.`, `manifest_${field}_required`);
  }
  return value.trim();
}

function optionalText(value, field, index) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    refuse(`Operator ${index + 1}: "${field}" must be text or null.`, `manifest_${field}_invalid`);
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Reads and checks one manifest, returning the normalised entries.
 *
 * Refuses before anything is connected to, let alone written: a manifest is
 * either completely acceptable or the run does not start. Partial acceptance is
 * how a club ends up with a President, no General Manager, and no record of why.
 *
 * @param {unknown} raw parsed JSON
 * @returns {{ operators: Array<{ roleCode: string, givenName: string, familyName: string,
 *             knownAs: string | null, email: string, personId: string | null,
 *             createPerson: boolean }> }}
 */
export function parseManifest(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    refuse("The manifest must be a JSON object.", "manifest_not_an_object");
  }

  const operators = raw.operators;
  if (!Array.isArray(operators) || operators.length === 0) {
    refuse(
      'The manifest must carry an "operators" array with at least the three founding seats.',
      "manifest_operators_required",
    );
  }

  const parsed = operators.map((entry, index) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      refuse(`Operator ${index + 1} must be a JSON object.`, "manifest_entry_not_an_object");
    }

    // **Not trimmed.** `" president "` is refused, not tidied up — the same
    // leniency `resolveRoles` in `src/lib/services/operator-invitations.ts`
    // refuses, and for the same reason: whitespace around a role code means the
    // manifest was built wrongly, and this script is provisioning the most
    // dangerous seats in the club.
    const roleCode = entry.roleCode;
    if (typeof roleCode !== "string" || roleCode === "" || roleCode !== roleCode.trim()) {
      refuse(
        `Operator ${index + 1}: "roleCode" must be an exact role code from the approved ` +
          "catalogue, with no surrounding whitespace.",
        "manifest_role_code_invalid",
      );
    }

    const givenName = requiredText(entry.givenName, "givenName", index);
    const familyName = requiredText(entry.familyName, "familyName", index);
    const knownAs = optionalText(entry.knownAs, "knownAs", index);

    const email = requiredText(entry.email, "email", index).toLowerCase();
    if (!looksLikeEmailAddress(email)) {
      refuse(
        `Operator ${index + 1}: "${maskEmail(email)}" is not an email address.`,
        "manifest_email_invalid",
      );
    }

    const rawPersonId = entry.personId;
    let personId = null;
    let createPerson = false;
    if (rawPersonId === undefined || rawPersonId === null) {
      // Decide by duplicate check. See `plan.mjs`.
    } else if (rawPersonId === PERSON_NEW) {
      createPerson = true;
    } else if (isUuid(rawPersonId)) {
      personId = rawPersonId;
    } else {
      refuse(
        `Operator ${index + 1}: "personId" must be omitted, "${PERSON_NEW}", or a Person's UUID.`,
        "manifest_person_id_invalid",
      );
    }

    return { roleCode, givenName, familyName, knownAs, email, personId, createPerson };
  });

  assertNoDuplicates(parsed);
  assertMinimumManifest(parsed);

  return { operators: parsed };
}

function assertNoDuplicates(parsed) {
  const seenRoles = new Set();
  const seenEmails = new Set();
  const seenPeople = new Set();

  for (const entry of parsed) {
    // One seat, one holder, in one bootstrap. Two entries naming the same role
    // is either a mistake or a decision about a shared seat, and this script
    // refuses rather than guessing which. The application assigns a second
    // holder afterwards, where the exclusion constraints and the leadership
    // rules both apply.
    if (seenRoles.has(entry.roleCode)) {
      refuse(
        `The manifest names "${entry.roleCode}" more than once. One seat, one founding holder.`,
        "manifest_duplicate_role",
      );
    }
    seenRoles.add(entry.roleCode);

    if (seenEmails.has(entry.email)) {
      refuse(
        `The manifest uses ${maskEmail(entry.email)} for more than one operator. ` +
          "One person has one login.",
        "manifest_duplicate_email",
      );
    }
    seenEmails.add(entry.email);

    if (entry.personId !== null) {
      if (seenPeople.has(entry.personId)) {
        refuse(
          "The manifest names the same Person for more than one operator. " +
            "One Person has at most one operator login.",
          "manifest_duplicate_person",
        );
      }
      seenPeople.add(entry.personId);
    }
  }
}

function assertMinimumManifest(parsed) {
  const present = new Set(parsed.map((entry) => entry.roleCode));
  const missing = REQUIRED_ROLE_CODES.filter((code) => !present.has(code));

  if (missing.length > 0) {
    refuse(
      `The manifest is missing ${missing.join(", ")}. REQ-one-time-bootstrap establishes at ` +
        "least the President, the General Manager and the IT Officer, so a manifest without " +
        "all three would leave the club without an administrator it is required to have.",
      "manifest_minimum_not_met",
    );
  }
}

/**
 * An address reduced to what a refusal needs, so that a message a human may
 * paste into a ticket does not carry somebody's personal address whole.
 *
 * The dry-run preview deliberately does *not* use this — checking the address
 * is the point of the preview, and it is printed to Brian's own terminal from
 * a file he wrote seconds earlier. Refusals are different: they get copied.
 */
export function maskEmail(value) {
  if (typeof value !== "string") return "(not an address)";
  const at = value.indexOf("@");
  if (at <= 0) return `${value.slice(0, 1)}***`;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const tail = dot === -1 ? "" : domain.slice(dot);
  return `${local.slice(0, 1)}***@${domain.slice(0, 1)}***${tail}`;
}
