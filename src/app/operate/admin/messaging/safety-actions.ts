"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guards";
import { isServiceError, withTransaction } from "@/lib/db";
import { pauseMessagingIn, resumeMessagingIn } from "@/lib/services/messaging-safety";
import { EMPTY_ADMIN_ACTION_STATE, type AdminActionState } from "../action-state";
import {
  pausedNotice,
  REASON_REQUIRED,
  resumedNotice,
  SAFETY_ACTION_FAILED,
} from "./safety-presentation";

/**
 * The two controls — LAN-394.
 *
 * Both guard on `messaging_safety_authority`, the narrow capability the core
 * four hold, rather than on `delivery_administration`, which gates the page.
 * The page is open to the IT Officer because seeing that messaging is paused is
 * how somebody diagnoses a deployment; deciding that it stops is not an
 * administrative act (Brian, 17 September 2026).
 *
 * The service re-checks the same capability. A Server Action is a POST endpoint
 * anybody with a session can call whether or not a screen offered it, and a
 * service function is callable from anywhere on the server, so both guard —
 * `docs/architecture.md`, "Enforcement is in the action, not the route."
 *
 * The browser supplies the scope and the version it saw, and nothing else. It
 * cannot supply an actor, a threshold or a scope it was not shown, and a stale
 * version is refused rather than allowed to undo a newer incident.
 */

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function target(formData: FormData): { scopeId: string; version: number } | null {
  const scopeId = field(formData, "scopeId").trim();
  const version = Number(field(formData, "version"));
  if (scopeId === "" || !Number.isInteger(version)) return null;
  return { scopeId, version };
}

/**
 * The recorded reason, from a one-tap preset and an optional note.
 *
 * Brian, 18 September 2026: the preset alone satisfies the requirement. What is
 * stored is still one string, and still whatever the operator actually chose —
 * the preset is not privileged over free text and neither is validated against
 * a list, because a reason is a sentence for a person to read, not a code
 * anything branches on.
 */
function reasonFrom(formData: FormData): string {
  const preset = field(formData, "reasonPreset").trim();
  const notes = field(formData, "reason").trim();
  if (preset !== "" && notes !== "") return `${preset} — ${notes}`;
  return preset !== "" ? preset : notes;
}

export async function pauseMessagingAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await requireCapability("messaging_safety_authority");
  } catch (error) {
    // LAN-423: the refusal is the control's own state, never a crashed page.
    if (!isServiceError(error)) throw error;
    return { ...EMPTY_ADMIN_ACTION_STATE, refusal: error.message };
  }

  const scope = target(formData);
  const reason = reasonFrom(formData);
  if (!scope) return { ...EMPTY_ADMIN_ACTION_STATE, error: SAFETY_ACTION_FAILED };
  if (reason === "") return { ...EMPTY_ADMIN_ACTION_STATE, error: REASON_REQUIRED };

  try {
    await withTransaction((tx) => pauseMessagingIn(tx, scope, reason));
  } catch (error) {
    if (!isServiceError(error)) throw error;
    if (error.kind === "not_permitted") {
      return { ...EMPTY_ADMIN_ACTION_STATE, refusal: error.message };
    }
    return { ...EMPTY_ADMIN_ACTION_STATE, error: error.message };
  }

  revalidatePath("/operate/admin/messaging");
  return { ...EMPTY_ADMIN_ACTION_STATE, notice: pausedNotice() };
}

export async function resumeMessagingAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await requireCapability("messaging_safety_authority");
  } catch (error) {
    // LAN-423: the refusal is the control's own state, never a crashed page.
    if (!isServiceError(error)) throw error;
    return { ...EMPTY_ADMIN_ACTION_STATE, refusal: error.message };
  }

  const scope = target(formData);
  const reason = reasonFrom(formData);
  if (!scope) return { ...EMPTY_ADMIN_ACTION_STATE, error: SAFETY_ACTION_FAILED };
  if (reason === "") return { ...EMPTY_ADMIN_ACTION_STATE, error: REASON_REQUIRED };

  try {
    await withTransaction((tx) => resumeMessagingIn(tx, scope, reason));
  } catch (error) {
    if (!isServiceError(error)) throw error;
    if (error.kind === "not_permitted") {
      return { ...EMPTY_ADMIN_ACTION_STATE, refusal: error.message };
    }
    return { ...EMPTY_ADMIN_ACTION_STATE, error: error.message };
  }

  revalidatePath("/operate/admin/messaging");
  return { ...EMPTY_ADMIN_ACTION_STATE, notice: resumedNotice() };
}
