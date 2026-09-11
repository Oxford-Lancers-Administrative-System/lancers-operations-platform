"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import { MAX_IMPORT_BYTES } from "@/lib/services/event-csv";
import {
  applySeasonImport,
  IMPORT_TOO_LARGE_MESSAGE,
  planSeasonImport,
} from "@/lib/services/event-import";
import { EMPTY_IMPORT_STATE, NO_FILE_CHOSEN_MESSAGE, type ImportScreenState } from "./import-state";

/** The bulk import's two writes — one of which writes nothing. LAN-155. */

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

/** Turns a service failure into readable text; rethrows `NotPermitted` untouched so a refusal isn't rendered as a fixable error. */
function messageFor(error: unknown): string {
  if (!isServiceError(error)) throw error;
  if (error.kind === "not_permitted") throw error;
  return error.message;
}

export async function importEventsAction(
  previous: ImportScreenState,
  formData: FormData,
): Promise<ImportScreenState> {
  await requireCapability("event_calendar_management");

  const intent = text(formData, "intent");
  if (intent === "cancel") return EMPTY_IMPORT_STATE;
  if (intent === "apply") return applyImport(previous, formData);
  return proposeImport(formData);
}

/** Read the file, say what it would do, and write nothing. */
async function proposeImport(formData: FormData): Promise<ImportScreenState> {
  const uploaded = formData.get("file");

  if (uploaded === null || typeof uploaded === "string" || uploaded.size === 0) {
    return { ...EMPTY_IMPORT_STATE, error: NO_FILE_CHOSEN_MESSAGE };
  }

  // Checked before decoding: avoids paying the cost of File.text() on an enormous file.
  if (uploaded.size > MAX_IMPORT_BYTES) {
    return { ...EMPTY_IMPORT_STATE, error: IMPORT_TOO_LARGE_MESSAGE };
  }

  const fileName = uploaded.name === "" ? null : uploaded.name;
  const csvText = await uploaded.text();

  let result;
  try {
    result = await planSeasonImport({ csvText, fileName });
  } catch (error) {
    return { ...EMPTY_IMPORT_STATE, error: messageFor(error) };
  }

  if (!result.ok) {
    return { ...EMPTY_IMPORT_STATE, error: result.reason, fileName };
  }

  return { error: null, plan: result.plan, csvText, fileName, applied: null };
}

/** Apply the proposal the operator confirmed, as one transaction. */
async function applyImport(
  previous: ImportScreenState,
  formData: FormData,
): Promise<ImportScreenState> {
  const csvText = text(formData, "csvText");
  const digest = text(formData, "digest");
  const fileName = text(formData, "fileName");

  if (csvText === "" || digest === "") {
    return { ...EMPTY_IMPORT_STATE, error: NO_FILE_CHOSEN_MESSAGE };
  }

  try {
    const applied = await applySeasonImport({
      csvText,
      fileName: fileName === "" ? null : fileName,
      digest,
    });
    revalidatePath("/operate/events");
    revalidatePath("/operate/events/calendar");
    revalidatePath("/operate/events/import");
    return { ...EMPTY_IMPORT_STATE, applied };
  } catch (error) {
    // The proposal stays on screen — nothing was written, whatever went wrong.
    return { ...previous, error: messageFor(error), applied: null };
  }
}
