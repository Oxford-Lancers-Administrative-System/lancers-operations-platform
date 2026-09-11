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
 * LAN-215, `WP-arrival-doors`, `W1`. Mirrors `../../events/import/actions.ts`.
 * `requireCapability("roster_bulk_import")` (four-role), guarded again in
 * the service layer. Decision history: missions/intake/M-PEOPLE-AND-ROSTER
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
    // Re-proposing after a duplicate answer: the file is carried through the hidden field, not re-chosen.
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
    // Kept, not reset: W1-04's approved screen replaces the confirmation with a richer summary, not the empty start screen.
    return { ...previous, error: null, applied };
  } catch (error) {
    // The proposal stays on screen — nothing was written, whatever went wrong.
    return { ...previous, error: messageFor(error), applied: null };
  }
}
