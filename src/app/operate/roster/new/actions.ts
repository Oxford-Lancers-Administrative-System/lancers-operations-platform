"use server";

import { redirect } from "next/navigation";

import { requireOperator } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import { enterReturningPlayer, findPersonCandidates } from "@/lib/services/roster";
import { GENERIC_FAILURE, personLabel, type IntakeState } from "./intake-state";
import { readIntakeValues, validateIntake, type IntakeFormValues } from "./validation";

/**
 * The returner intake server action. LAN-74, screens UX-10 → UX-13.
 *
 * ## Why one action with an intent, rather than three actions
 *
 * The three things an operator can do here — check for matches, use the person
 * they picked, confirm this is a new person — are three answers to one
 * question, and every one of them has to re-read the same five fields and
 * re-authorize the same caller. Splitting them into three entry points would
 * mean three places that could forget the guard. There is one place, and it is
 * the first statement.
 *
 * ## Authorization
 *
 * `requireOperator()` — a linked, active operator, and nothing more.
 *
 * That is the whole requirement, and choosing it is a reading worth stating.
 * `docs/ux/slice-ux.md` § 8 puts "ordinary operator actions" under "only the
 * role/capability mapping in LAN-73 and owning live issue"; LAN-73's capability
 * map names activation, approval, attendance, role management, delivery and the
 * report, and does **not** name roster intake; and LAN-74 says only "an
 * authenticated operator enters a returning player". `destinations.ts` already
 * treats Roster as an ordinary operator surface for the same reason.
 *
 * Inventing a `roster_intake` capability here would be adding a role mapping
 * without a recorded decision, which `docs/ux/tickets/LAN-74-returner-intake.md`
 * explicitly forbids. If Brian wants intake narrowed to particular seats, that
 * is one entry added to `capabilities.ts` and one word changed here.
 *
 * The guard resolves the actor from the verified session. The actor is never
 * read from the form — a server action is a POST endpoint the browser can call
 * directly, and an action that accepted "who am I" would accept whatever was
 * sent.
 *
 * ## Why nothing is written until step two
 *
 * `check` never writes. `use_existing` and `confirm_new` are the only intents
 * that reach the database, and each of them is a decision the operator has
 * explicitly made about a named human being. There is deliberately no path
 * where an empty candidate list creates a person on its own: "nothing matched"
 * is still the operator's call, and UX-10's own note promises them that.
 */

export async function submitReturnerIntake(
  _previous: IntakeState,
  formData: FormData,
): Promise<IntakeState> {
  const operator = await requireOperator();

  const values = readIntakeValues(formData);
  const intent = formData.get("intent");

  // "Back to candidate review" and "Back" both return to a rendered step
  // without touching the database.
  if (intent === "back_to_details") {
    return { step: "details", values, errors: {} };
  }

  const errors = validateIntake(values);
  if (Object.keys(errors).length > 0) {
    return { step: "details", values, errors };
  }

  // No `knownAs`: intake no longer collects a nickname (Brian, 12 August 2026 —
  // "that's not a good way to talk about it"). The service still accepts one,
  // because `person_aliases` is how an import matches a name form to a person,
  // but this form never supplies it and therefore never writes an alias.
  const input = {
    givenName: values.givenName,
    familyName: values.familyName,
    email: values.email,
    phone: values.phone,
  };

  if (intent === "check" || intent === "back_to_candidates") {
    try {
      return { step: "candidates", values, candidates: await findPersonCandidates(input) };
    } catch (error) {
      return { step: "details", values, errors: {}, formError: safeMessage(error) };
    }
  }

  if (intent !== "use_existing" && intent !== "confirm_new") {
    return { step: "details", values, errors: {}, formError: GENERIC_FAILURE };
  }

  const selectedPersonId = formData.get("personId");
  if (intent === "use_existing" && typeof selectedPersonId !== "string") {
    return {
      step: "candidates",
      values,
      candidates: await candidatesOrNone(input),
      formError: "Choose the person this is, or confirm that this is a new person.",
    };
  }

  let membershipId: string;
  try {
    const result = await enterReturningPlayer({
      actorPersonId: operator.personId,
      input,
      decision:
        intent === "use_existing"
          ? { kind: "existing", personId: selectedPersonId as string }
          : { kind: "new", confirmed: true },
    });
    membershipId = result.membershipId;
  } catch (error) {
    return buildFailureState(error, values, input, selectedPersonId);
  }

  // Outside the try: `redirect` signals by throwing, and catching it here would
  // turn a successful intake into a generic failure message.
  redirect(`/operate/roster/${membershipId}?created=1`);
}

/**
 * Turns a refused write into the screen that explains it.
 *
 * The duplicate-membership case gets its own screen (UX-12) because it is not
 * really an error — it is the system telling the operator that the person they
 * are entering is already on this season's roster, which is usually good news
 * and always actionable. Everything else stays on the candidate review with a
 * sentence attached.
 */
async function buildFailureState(
  error: unknown,
  values: IntakeFormValues,
  input: Parameters<typeof findPersonCandidates>[0],
  selectedPersonId: FormDataEntryValue | null,
): Promise<IntakeState> {
  const candidates = await candidatesOrNone(input);

  if (
    isServiceError(error) &&
    error.rule === "season_memberships_one_per_person_per_season" &&
    typeof selectedPersonId === "string"
  ) {
    const person = candidates.find((candidate) => candidate.personId === selectedPersonId);
    return {
      step: "membership_refused",
      values,
      candidates,
      refusal: {
        message: error.message,
        personName: person
          ? personLabel(person)
          : personLabel({ givenName: values.givenName, familyName: values.familyName || null }),
        personGivenName: person ? person.givenName : values.givenName.trim(),
        seasonLabel: person?.currentMembership?.seasonLabel ?? null,
        membershipId: person?.currentMembership?.id ?? null,
      },
    };
  }

  return { step: "candidates", values, candidates, formError: safeMessage(error) };
}

/**
 * The sentence an operator is shown.
 *
 * A `ServiceError` is a refusal or a rule the club recognises, and its message
 * was written to be read by an operator, so it is passed through. Anything else
 * is a bug, a driver failure or a connection problem, and its text may quote a
 * host, a connection string or a row — so it is replaced. `mapDatabaseError`
 * already keeps driver detail out of `ServiceError` messages; this is the
 * second line.
 */
function safeMessage(error: unknown): string {
  return isServiceError(error) ? error.message : GENERIC_FAILURE;
}

/**
 * The candidate list, or an empty one — never a throw.
 *
 * Both call sites are on a path that is *already* reporting a failure, and the
 * commonest reason the write failed is a reason `findPersonCandidates` shares:
 * no open season, or two of them. Letting it raise there would replace the
 * sentence the operator needs with an unhandled server-action error, on exactly
 * the submission where they most need to be told what happened.
 *
 * Returning nothing is safe here because an empty candidate list on a refusal
 * screen is a display detail; the refusal itself is what the operator acts on.
 */
async function candidatesOrNone(
  input: Parameters<typeof findPersonCandidates>[0],
): Promise<Awaited<ReturnType<typeof findPersonCandidates>>> {
  try {
    return await findPersonCandidates(input);
  } catch {
    return [];
  }
}
