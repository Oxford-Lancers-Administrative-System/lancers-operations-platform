/**
 * What the bootstrap would do, decided before it does anything — LAN-135,
 * `REQ-one-time-bootstrap`: "dry-runs and duplicate-checks existing
 * Person/operator/auth state … with … fail-closed conflict handling".
 *
 * Pure. Takes the manifest and an observation of the database and the Auth
 * server, and returns a plan. It reads nothing and writes nothing, which is
 * what makes the dry run trustworthy: the preview a human approves is produced
 * by this function, and so is the thing that then runs.
 *
 * ## Fail closed means refusing the whole run
 *
 * Every refusal below is collected rather than thrown. The caller prints all of
 * them and then applies **nothing** — one conflict on the third operator stops
 * the first two as well.
 *
 * That is deliberate and it is the opposite of best-effort. A half-applied
 * bootstrap is the worst state this script can leave the club in: some seats
 * filled, some not, an operator with a login and no role, and a human who has
 * to work out which by hand — in the one database where working it out by hand
 * is the thing the mission exists to abolish. Re-running after a fix is free,
 * because every step is idempotent; reconciling a partial run is not.
 *
 * ## The one thing it will not do is guess
 *
 * The dangerous case is not a missing Person, it is the wrong one. Clint may
 * well already be in `public.people` as a player, and linking his new operator
 * login to the *other* Clint is a mistake nobody would notice until somebody
 * looked at a roster.
 *
 * So a manifest entry that names no `personId` asks this module to look, and a
 * look that finds **any** candidate refuses the run and prints the candidates.
 * Brian then pins the right one — or says `"new"` — and re-runs. It never picks
 * one because the name matched, and it never picks the first of several.
 */

import { maskEmail } from "./manifest.mjs";

/** Nothing is written. Used by the dry run and by every refused run. */
export const DRY_RUN = "dry-run";
/** Rows and logins are written. Only reachable with `--apply` and a clean plan. */
export const APPLY = "apply";

function conflict(rule, message) {
  return { rule, message };
}

/**
 * The plan for one manifest entry, against what was observed for it.
 *
 * @param {object} entry a parsed manifest entry
 * @param {object} observed see `database.mjs` `observeOperator`
 * @param {{ resend: boolean }} options
 */
export function planOperator(entry, observed, options = {}) {
  const conflicts = [];
  const label = `${entry.givenName} ${entry.familyName} (${entry.roleCode})`;

  // --- the seat ------------------------------------------------------------
  if (!observed.role) {
    conflicts.push(
      conflict(
        "role_not_in_catalogue",
        `${label}: "${entry.roleCode}" is not in public.roles. The role-catalogue migrations ` +
          "(20260819090000, 20260819090100) have to be applied to this database first.",
      ),
    );
  }

  if (!observed.operatingYear) {
    conflicts.push(
      conflict(
        "no_operating_cycle",
        `${label}: this seat hangs off ${
          observed.role?.scope === "season" ? "a season" : "a committee year"
        }, and this database has no single active one. Record it first.`,
      ),
    );
  }

  // --- the login and the Person -------------------------------------------
  let person = { action: "create", personId: null, existingName: null, candidates: [] };
  let login = { action: "create", operatorAccountId: null, authUserId: null };

  if (observed.operatorAccountByEmail) {
    // The strongest identity key this script has. `operator_accounts.login_email`
    // is unique, so an account carrying this address *is* this operator, and a
    // second run finds it here and changes nothing.
    const account = observed.operatorAccountByEmail;

    if (entry.personId !== null && entry.personId !== account.personId) {
      conflicts.push(
        conflict(
          "login_email_belongs_to_another_person",
          `${label}: ${maskEmail(entry.email)} already has an operator login, and it belongs ` +
            "to a different Person than the one the manifest pins. Nothing was changed. " +
            "Correct the manifest, or resolve the duplicate by hand.",
        ),
      );
    }

    if (!account.isActive) {
      // Reinstating an operator is a decision with a reason, recorded through
      // the application by somebody who holds the authority
      // (`REQ-deactivate-and-reinstate`). A provisioning script silently
      // undoing a deactivation would be a way to get access back without
      // anybody deciding to give it.
      conflicts.push(
        conflict(
          "operator_account_deactivated",
          `${label}: an operator account for ${maskEmail(entry.email)} exists and has been ` +
            "deactivated. This script will not reinstate it — reinstatement is a decision, " +
            "made in the application by somebody who holds the authority.",
        ),
      );
    }

    person = {
      action: "existing",
      personId: account.personId,
      existingName: account.personName,
      candidates: [],
    };
    login = {
      action: "existing",
      operatorAccountId: account.id,
      authUserId: account.authUserId,
    };
  } else {
    if (observed.authUser) {
      // A login exists that no operator account points at. This script created
      // logins in exactly one place and removes them again when the rows that
      // would have pointed at them fail to commit, so a dangling login is
      // somebody else's — or the residue of a hard crash. Adopting it would
      // mean binding the club's most privileged seat to an identity nothing in
      // this repository can account for.
      conflicts.push(
        conflict(
          "auth_login_without_operator_account",
          `${label}: Supabase Auth already has a login for ${maskEmail(entry.email)}, and no ` +
            "operator account points at it. This script will not adopt a login it did not " +
            "create. Remove it in the Supabase dashboard, or use a different address, then " +
            "re-run.",
        ),
      );
    }

    if (entry.personId !== null) {
      if (!observed.personById) {
        conflicts.push(
          conflict(
            "person_not_found",
            `${label}: the manifest pins a Person this database does not have.`,
          ),
        );
      } else if (observed.personById.mergedIntoPersonId !== null) {
        conflicts.push(
          conflict(
            "person_merged",
            `${label}: the Person the manifest pins has been merged into another record. ` +
              "Pin the surviving Person instead.",
          ),
        );
      } else if (observed.operatorAccountByPerson) {
        conflicts.push(
          conflict(
            "person_already_has_login",
            `${label}: the Person the manifest pins already has an operator login, under a ` +
              "different address. One person has one login.",
          ),
        );
      }

      person = {
        action: "link",
        personId: entry.personId,
        existingName: observed.personById?.name ?? null,
        candidates: [],
      };
    } else if (entry.createPerson) {
      person = { action: "create", personId: null, existingName: null, candidates: [] };
    } else if (observed.candidates.length > 0) {
      conflicts.push(
        conflict(
          "person_duplicate_candidates",
          `${label}: this database already holds ${observed.candidates.length} Person ` +
            `record${observed.candidates.length === 1 ? "" : "s"} that could be this person ` +
            `(${observed.candidates.map((c) => `${c.id} — ${c.name} [${c.matchedOn.join(", ")}]`).join("; ")}). ` +
            'Set "personId" to the right one to link it, or to "new" to create a separate ' +
            "record anyway. This script will not choose.",
        ),
      );
      person = {
        action: "create",
        personId: null,
        existingName: null,
        candidates: observed.candidates,
      };
    } else {
      person = { action: "create", personId: null, existingName: null, candidates: [] };
    }
  }

  // --- the appointment -----------------------------------------------------
  let role = {
    action: "assign",
    roleId: observed.role?.id ?? null,
    assignmentId: null,
  };

  if (observed.existingAssignment) {
    role = {
      action: "existing",
      roleId: observed.role?.id ?? null,
      assignmentId: observed.existingAssignment.id,
    };
  } else if (observed.conflictingHolder) {
    conflicts.push(
      conflict(
        "seat_already_held",
        `${label}: "${entry.roleCode}" admits one holder at a time and ${observed.conflictingHolder.personName} ` +
          "currently holds it. Ending that appointment is a decision with a reason, made in " +
          "the application — not something a provisioning script does on somebody's behalf.",
      ),
    );
  }

  // --- the invitation ------------------------------------------------------
  // Sending is the one step that is not idempotent in the ordinary sense: an
  // email arriving twice is a change, even though no row moved. So a second run
  // sends nothing by default, and `--resend` is how a human asks for the retry
  // an interrupted first run needs.
  let invitation;
  if (login.action === "create") {
    invitation = { action: "send", reason: "first invitation" };
  } else if (observed.operatorAccountByEmail?.activatedAt) {
    invitation = { action: "skip", reason: "the holder has already established credentials" };
  } else if (options.resend) {
    invitation = { action: "send", reason: "--resend was given" };
  } else {
    invitation = {
      action: "skip",
      reason: "the account already exists; pass --resend to send the invitation again",
    };
  }

  return { entry, label, person, login, role, invitation, conflicts };
}

/**
 * The whole plan: every entry, plus the refusals that are only visible across
 * entries.
 *
 * @param {{ operators: object[] }} manifest
 * @param {object[]} observations one per manifest entry, in the same order
 * @param {{ resend?: boolean }} options
 */
export function planBootstrap(manifest, observations, options = {}) {
  const entries = manifest.operators.map((entry, index) =>
    planOperator(entry, observations[index], options),
  );

  const conflicts = entries.flatMap((planned) => planned.conflicts);

  // Two entries resolving to one Person is not visible from either entry alone:
  // each pinned or matched a Person legitimately, and only together do they
  // ask for two logins on one record — which `operator_accounts_person_key`
  // would refuse halfway through, after the first login had been created.
  const byPerson = new Map();
  for (const planned of entries) {
    const personId = planned.person.personId;
    if (personId === null) continue;
    if (byPerson.has(personId)) {
      conflicts.push(
        conflict(
          "two_operators_one_person",
          `${byPerson.get(personId)} and ${planned.label} resolve to the same Person. ` +
            "One Person has at most one operator login.",
        ),
      );
    } else {
      byPerson.set(personId, planned.label);
    }
  }

  const writes = entries.reduce(
    (total, planned) =>
      total +
      (planned.person.action === "create" ? 1 : 0) +
      (planned.login.action === "create" ? 1 : 0) +
      (planned.role.action === "assign" ? 1 : 0),
    0,
  );

  return {
    entries,
    conflicts,
    /** True when the plan may be applied at all. */
    clean: conflicts.length === 0,
    /** How many rows-and-logins the plan would create. Zero means settled. */
    writes,
    /** True when everything the manifest asks for is already true. */
    settled: writes === 0 && conflicts.length === 0,
  };
}

/**
 * The preview a human reads before anything happens.
 *
 * Returns lines rather than printing, so the contract test can assert on them
 * and so nothing in this module writes to a stream by itself.
 *
 * **The lines carry personal names and email addresses**, because checking them
 * is the entire purpose of the preview and Brian wrote them into the manifest
 * seconds earlier. They are printed to his terminal and nowhere else: this
 * script opens no log file, and the caller is told not to paste the output into
 * a ticket, a pull request or a prompt.
 */
export function describePlan(plan, { mode }) {
  const lines = [];
  lines.push(mode === APPLY ? "APPLYING the founding bootstrap." : "DRY RUN — nothing is written.");
  lines.push("");

  for (const planned of plan.entries) {
    const { entry, person, login, role, invitation } = planned;
    lines.push(`${entry.roleCode}`);
    lines.push(`  Person   ${describePerson(person, entry)}`);
    lines.push(`  Login    ${describeLogin(login, entry)}`);
    lines.push(`  Seat     ${describeRole(role, entry)}`);
    lines.push(
      `  Email    ${invitation.action === "send" ? "send" : "skip"} — ${invitation.reason}`,
    );
    lines.push("");
  }

  if (plan.conflicts.length > 0) {
    lines.push(`REFUSED — ${plan.conflicts.length} conflict(s). Nothing will be written.`);
    for (const item of plan.conflicts) lines.push(`  [${item.rule}] ${item.message}`);
    lines.push("");
  } else if (plan.settled) {
    lines.push("Nothing to do — every founding operator is already established.");
    lines.push("");
  } else {
    lines.push(`${plan.writes} record(s) would be created.`);
    lines.push("");
  }

  return lines;
}

function describePerson(person, entry) {
  const name = [entry.givenName, entry.familyName].join(" ");
  switch (person.action) {
    case "create":
      return `create "${name}"${entry.knownAs ? ` (known as ${entry.knownAs})` : ""}`;
    case "link":
      return `link to existing ${person.personId}${person.existingName ? ` — ${person.existingName}` : ""}`;
    default:
      return `already ${person.personId}${person.existingName ? ` — ${person.existingName}` : ""}`;
  }
}

function describeLogin(login, entry) {
  return login.action === "create"
    ? `create operator login for ${entry.email}`
    : `already exists for ${entry.email} (${login.operatorAccountId})`;
}

function describeRole(role, entry) {
  return role.action === "assign"
    ? `assign ${entry.roleCode}, effective today, open-ended`
    : `already held (${role.assignmentId})`;
}
