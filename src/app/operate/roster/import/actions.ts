"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import { MAX_IMPORT_BYTES } from "@/lib/services/roster-csv";
import {
  applyRosterImport,
  IMPORT_TOO_LARGE_MESSAGE,
  planRosterImport,
  type DuplicateAnswers,
} from "@/lib/services/roster-import";
import { EMPTY_IMPORT_STATE, NO_FILE_CHOSEN_MESSAGE, type ImportScreenState } from "./import-state";

/**
 * The roster bulk import's two writes — one of which writes nothing.
 * LAN-215, `WP-arrival-doors`, workflow `W1`.
 *
 * Mirrors `../../events/import/actions.ts`'s own reasoning throughout: one
 * action with an intent, because the screen is one screen in three states
 * and `useActionState` holds one state per action; `cancel` reaches no
 * service and writes nothing, which is the whole of "abandoning a
 * confirmation leaves nothing behind."
 *
 * ## Authorization
 *
 * `requireCapability("roster_bulk_import")` — four-role, not the shipped
 * general-operator floor `/operate/roster/new` uses. `roster-import.ts`
 * guards again in the service layer, enforced twice exactly as
 * `/operate/events/import` is.
 *
 * ## `answerLine`/`answerValue` — the duplicate section's own submit
 *
 * A "Same person" or "Different person" button submits the whole form with
 * `intent=propose` and its own `name`/`value` pair naming which line it
 * answered and how. The action merges that one answer into the running
 * `duplicateAnswers` map already carried in hidden fields and re-proposes —
 * `W1`'s own exceptions table: "The operator answers it and confirms
 * again," which is exactly a second `propose` rather than a silent client-
 * side patch.
 */

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function messageFor(error: unknown): string {
  if (!isServiceError(error)) throw error;
  if (error.kind === "not_permitted") throw error;
  return error.message;
}

function readDuplicateAnswers(formData: FormData): DuplicateAnswers {
  const raw = text(formData, "duplicateAnswersJson");
  let parsed: Record<string, string> = {};
  if (raw !== "") {
    try {
      const value: unknown = JSON.parse(raw);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        parsed = Object.fromEntries(
          Object.entries(value as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        );
      }
    } catch {
      parsed = {};
    }
  }

  const answerLine = text(formData, "answerLine");
  const answerValue = text(formData, "answerValue");
  if (answerLine === "" || answerValue === "") return parsed;
  return { ...parsed, [answerLine]: answerValue };
}

export async function importRosterAction(
  previous: ImportScreenState,
  formData: FormData,
): Promise<ImportScreenState> {
  await requireCapability("roster_bulk_import");

  const intent = text(formData, "intent");
  if (intent === "cancel") return EMPTY_IMPORT_STATE;
  if (intent === "apply") return applyImport(previous, formData);
  return proposeImport(previous, formData);
}

/** Read the file (or a fresh duplicate answer), say what it would do, and write nothing. */
async function proposeImport(
  previous: ImportScreenState,
  formData: FormData,
): Promise<ImportScreenState> {
  const uploaded = formData.get("file");
  const carryingFile = uploaded !== null && typeof uploaded !== "string" && uploaded.size > 0;

  let csvText: string;
  let fileName: string | null;

  if (carryingFile) {
    const file = uploaded as File;
    if (file.size > MAX_IMPORT_BYTES) {
      return { ...EMPTY_IMPORT_STATE, error: IMPORT_TOO_LARGE_MESSAGE };
    }
    fileName = file.name === "" ? null : file.name;
    csvText = await file.text();
  } else {
    // Re-proposing after a duplicate answer: the file itself is not
    // re-chosen, only carried through the hidden field exactly as
    // `../../events/import`'s own confirmation carries its own `csvText`.
    csvText = text(formData, "csvText");
    fileName = text(formData, "fileName") || null;
    if (csvText === "") return { ...EMPTY_IMPORT_STATE, error: NO_FILE_CHOSEN_MESSAGE };
  }

  const duplicateAnswers = readDuplicateAnswers(formData);

  let result;
  try {
    result = await planRosterImport({ csvText, fileName, duplicateAnswers });
  } catch (error) {
    return { ...EMPTY_IMPORT_STATE, error: messageFor(error) };
  }

  if (!result.ok) {
    return { ...EMPTY_IMPORT_STATE, error: result.reason, fileName };
  }

  return {
    error: null,
    plan: result.plan,
    csvText,
    fileName,
    duplicateAnswers,
    applied: null,
  };
}

/** Apply the proposal the operator confirmed, as one transaction. */
async function applyImport(
  previous: ImportScreenState,
  formData: FormData,
): Promise<ImportScreenState> {
  const csvText = text(formData, "csvText");
  const digest = text(formData, "digest");
  const fileName = text(formData, "fileName") || null;
  const duplicateAnswers = readDuplicateAnswers(formData);

  if (csvText === "" || digest === "") {
    return { ...EMPTY_IMPORT_STATE, error: NO_FILE_CHOSEN_MESSAGE };
  }

  try {
    const applied = await applyRosterImport({ csvText, fileName, duplicateAnswers, digest });
    revalidatePath("/operate/roster");
    revalidatePath("/operate/roster/import");
    // Kept, not reset: `W1-04`'s approved screen replaces the confirmation
    // with a richer "who arrived, what did not" summary read off the same
    // plan the operator just confirmed, rather than reverting to the empty
    // start-here screen.
    return { ...previous, error: null, applied };
  } catch (error) {
    // The proposal stays on screen. Whatever went wrong, nothing was
    // written, and the operator is looking at the same rows they were
    // looking at.
    return { ...previous, error: messageFor(error), applied: null };
  }
}
