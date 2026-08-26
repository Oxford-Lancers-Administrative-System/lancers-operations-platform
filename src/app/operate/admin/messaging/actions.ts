"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guards";
import { isServiceError, withTransaction } from "@/lib/db";
import {
  listMessagingSchedulesIn,
  updateMessagingScheduleIn,
  type MessagingSchedule,
} from "@/lib/services/messaging-schedule";
import { EMPTY_ADMIN_ACTION_STATE, type AdminActionState } from "../action-state";
import { NO_SCHEDULE_CHANGES_NOTICE, scheduleChangesSavedNotice } from "./presentation";
import { readScheduleChanges, scheduleChanged } from "./validation";

/**
 * Saving the messaging schedule — W7, LAN-171.
 *
 * One action for the whole page's one form, because the approved mockup is
 * one "Save changes" button over seven rows rather than seven separate
 * confirmations — `/operate/admin/roles` needed one action per decision
 * because each decision is its own irreversible fact (who holds a seat, from
 * when); this page edits reference data, and a single edit is "this is the
 * club's schedule now", whichever rows changed to produce it.
 *
 * `requireCapability("delivery_administration")` resolves the actor from the
 * verified session, exactly as every other Administration action does — a
 * server action is a POST endpoint the browser can call directly, so an
 * action that trusted a hidden field for "who is asking" would trust whatever
 * was sent.
 *
 * Only rows that actually changed are written. `updateMessagingScheduleIn`
 * records an audit row carrying both the old and the new values every time it
 * is called, and calling it for a row nobody touched would misreport the
 * club's history — as attributed as a genuine change, when nothing changed.
 */
export async function updateMessagingSchedulesAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const operator = await requireCapability("delivery_administration");

  const validated = readScheduleChanges(formData);
  if (!validated.ok) {
    return { ...EMPTY_ADMIN_ACTION_STATE, error: validated.message };
  }

  try {
    const updated = await withTransaction(async (tx) => {
      const current = await listMessagingSchedulesIn(tx);
      const byType = new Map<string, MessagingSchedule>(
        current.map((schedule) => [schedule.eventType, schedule]),
      );

      let count = 0;
      for (const [eventType, change] of validated.changes) {
        const existing = byType.get(eventType);
        if (existing && !scheduleChanged(existing, change)) continue;
        await updateMessagingScheduleIn(tx, operator.personId, eventType, change);
        count += 1;
      }
      return count;
    });

    revalidatePath("/operate/admin/messaging");

    return {
      ...EMPTY_ADMIN_ACTION_STATE,
      notice: updated === 0 ? NO_SCHEDULE_CHANGES_NOTICE : scheduleChangesSavedNotice(updated),
    };
  } catch (error) {
    if (!isServiceError(error)) throw error;
    if (error.kind === "not_permitted") {
      return { ...EMPTY_ADMIN_ACTION_STATE, refusal: error.message };
    }
    return { ...EMPTY_ADMIN_ACTION_STATE, error: error.message };
  }
}
