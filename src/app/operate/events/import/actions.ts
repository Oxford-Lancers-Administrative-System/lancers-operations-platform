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
import {
  EMPTY_IMPORT_STATE,
  NO_FILE_CHOSEN_MESSAGE,
  type ImportScreenState,
} from "./import-state";

/**
 * The bulk import's two writes — one of which writes nothing. LAN-155.
 *
 * ## Authorization
 *
 * Both open with `requireCapability("event_calendar_management")`, which resolves
 * the actor from the **verified session** and refuses unless they hold a
 * permitted role. Neither takes an actor argument and neither may: a server
 * action is a POST endpoint the browser can call directly, so an action that
 * accepted "who am I" would accept whatever was sent.
 *
 * The services behind them guard again — `W3` requires the capability enforced in
 * the service layer, and `@/lib/services/event-import` does exactly that. Two
 * independent refusals, neither depending on the other having run.
 *
 * ## Why one action with an intent
 *
 * The screen is one screen: choosing a file, reading the proposal and applying
 * it are three steps through the same state, and `useActionState` holds one
 * state per action. Splitting them into three actions would mean three states
 * and a component reconciling them, which is where a screen ends up showing a
 * stale proposal beside a fresh error.
 *
 * ## `cancel` is the whole of "abandoning writes nothing"
 *
 * It reaches no service and issues no statement. That is not an oversight to be
 * tidied into a client-side reset later: the workflow's exception table says
 * "the operator abandons the confirmation → nothing is written. The import is not
 * a transaction that half-happened", and an action that provably does nothing is
 * the clearest possible statement of it.
 */

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

/**
 * Turns a service failure into something an operator can read, and lets a
 * refusal through untouched.
 *
 * `NotPermitted` is deliberately rethrown. A refusal rendered as red text above
 * a table reads as "fix your file and try again", which is the wrong instruction
 * and hides an authorization event inside a validation failure. Anything that is
 * not a `ServiceError` reaches the error boundary as itself.
 */
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

  // Checked before the bytes are decoded, not after: `File.text()` on a file
  // chosen to be enormous is the cost this limit exists to avoid paying.
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
    // The proposal stays on screen. Whatever went wrong, nothing was written,
    // and the operator is looking at the same rows they were looking at.
    return { ...previous, error: messageFor(error), applied: null };
  }
}
