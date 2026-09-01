"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guards";
import { isServiceError, withTransaction } from "@/lib/db";
import { TYPE_LABELS } from "@/lib/services/event-vocabulary";
import {
  readMessagingScheduleIn,
  updateMessagingScheduleIn,
} from "@/lib/services/messaging-schedule";
import {
  listRecruitmentCycleStepsIn,
  updateRecruitmentCycleStepIn,
  type RecruitmentCycleStepName,
} from "@/lib/services/recruitment-cycle";
import { EMPTY_ADMIN_ACTION_STATE, type AdminActionState } from "../action-state";
import { CYCLE_STEP_LABELS, readCycleStepsChange } from "./cycle-validation";
import {
  NO_SCHEDULE_CHANGES_NOTICE,
  cycleStepSavedNotice,
  cycleStepSaveFailedNotice,
  scheduleSavedNotice,
  scheduleSaveFailedNotice,
} from "./presentation";
import { readOneScheduleChange, scheduleChanged } from "./validation";

/**
 * Saving one event type's messaging schedule — W7, LAN-171, round 2.
 *
 * One action per row, not one action for the whole page (OWNER-LAN171-04):
 * Brian, on the approved-then-reversed shape, "I think there should be a save
 * button per event. Having one group save at the top doesn't really make a
 * lot of sense." Each of the seven rows on `/operate/admin/messaging` posts
 * its own `<form>`, carrying a hidden `eventType` alongside its six fields, to
 * this one action — which is what "one action per row" actually needs to mean
 * for a Server Action: the function is shared, but each row's `useActionState`
 * call is independent, so one row's pending/error/notice state can never leak
 * onto another's.
 *
 * `requireCapability("delivery_administration")` resolves the actor from the
 * verified session, exactly as every other Administration action does — a
 * server action is a POST endpoint the browser can call directly, so an
 * action that trusted a hidden field for "who is asking" would trust whatever
 * was sent.
 *
 * A row is written only if it actually changed. `updateMessagingScheduleIn`
 * records an audit row carrying both the old and the new values every time it
 * is called, and calling it for a row nobody touched would misreport the
 * club's history — as attributed as a genuine change, when nothing changed.
 */
export async function updateOneMessagingScheduleAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const operator = await requireCapability("delivery_administration");

  const eventType = formData.get("eventType");
  if (typeof eventType !== "string" || eventType.trim() === "") {
    // Not a reachable state from the page's own markup — every row's form
    // carries this hidden field — but a malformed direct POST names the
    // actual problem rather than crashing on a `null` event type below.
    return {
      ...EMPTY_ADMIN_ACTION_STATE,
      error: "This submission did not say which event type it was for, so nothing was saved.",
    };
  }

  const validated = readOneScheduleChange(eventType, formData);
  if (!validated.ok) {
    return { ...EMPTY_ADMIN_ACTION_STATE, error: validated.message };
  }

  const label = TYPE_LABELS[eventType] ?? eventType;

  try {
    const wrote = await withTransaction(async (tx) => {
      const current = await readMessagingScheduleIn(tx, eventType);
      if (!scheduleChanged(current, validated.change)) return false;
      await updateMessagingScheduleIn(tx, operator.personId, eventType, validated.change);
      return true;
    });

    revalidatePath("/operate/admin/messaging");

    return {
      ...EMPTY_ADMIN_ACTION_STATE,
      notice: wrote ? scheduleSavedNotice(label) : NO_SCHEDULE_CHANGES_NOTICE,
    };
  } catch (error) {
    if (!isServiceError(error)) throw error;
    if (error.kind === "not_permitted") {
      return { ...EMPTY_ADMIN_ACTION_STATE, refusal: error.message };
    }
    // OWNER-LAN171-02: name the row and the values that were rejected, rather
    // than the generic "please try again" — a deterministic rejection cannot
    // be fixed by retrying the same submission unchanged.
    return {
      ...EMPTY_ADMIN_ACTION_STATE,
      error: scheduleSaveFailedNotice(label, validated.change),
    };
  }
}

/**
 * Saving one row of the recruitment cycle — LAN-203, `REQ-recruitment-cycle`.
 *
 * Two of the cycle's three rows cover exactly one `recruitment_cycle_steps`
 * row; the third — Recruitment questionnaire — covers two (the ask and its
 * own reminder), on the same "one row, one form, one SAVE" law
 * `updateOneMessagingScheduleAction` already keeps for the Recruitment event
 * type's six fields. `steps` names which database rows this particular
 * form's fields cover; every one of them is written in the same transaction,
 * so a row that covers two steps either saves both or saves neither.
 */
export async function updateRecruitmentCycleStepsAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const operator = await requireCapability("delivery_administration");

  const stepsField = formData.get("steps");
  if (typeof stepsField !== "string" || stepsField.trim() === "") {
    return {
      ...EMPTY_ADMIN_ACTION_STATE,
      error: "This submission did not say which recruitment cycle steps it was for, so nothing " +
        "was saved.",
    };
  }
  const steps = stepsField.split(",").filter(Boolean) as RecruitmentCycleStepName[];

  const validated = readCycleStepsChange(steps, formData);
  if (!validated.ok) {
    return { ...EMPTY_ADMIN_ACTION_STATE, error: validated.message };
  }

  const rowLabel = steps.map((step) => CYCLE_STEP_LABELS[step]).join(" / ");

  try {
    const wrote = await withTransaction(async (tx) => {
      const current = await listRecruitmentCycleStepsIn(tx);
      const currentByStep = new Map(current.map((step) => [step.step, step]));

      let anyChanged = false;
      for (const [step, change] of validated.changes) {
        const before = currentByStep.get(step);
        const changed =
          !before || before.enabled !== change.enabled || before.offsetHours !== change.offsetHours;
        if (!changed) continue;
        anyChanged = true;
        await updateRecruitmentCycleStepIn(tx, operator.personId, step, change);
      }
      return anyChanged;
    });

    revalidatePath("/operate/admin/messaging");

    return {
      ...EMPTY_ADMIN_ACTION_STATE,
      notice: wrote ? cycleStepSavedNotice(rowLabel) : NO_SCHEDULE_CHANGES_NOTICE,
    };
  } catch (error) {
    if (!isServiceError(error)) throw error;
    if (error.kind === "not_permitted") {
      return { ...EMPTY_ADMIN_ACTION_STATE, refusal: error.message };
    }
    return {
      ...EMPTY_ADMIN_ACTION_STATE,
      error: cycleStepSaveFailedNotice(rowLabel),
    };
  }
}
