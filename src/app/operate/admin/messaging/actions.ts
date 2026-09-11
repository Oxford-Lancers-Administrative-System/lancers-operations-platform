"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guards";
import { isServiceError, withTransaction } from "@/lib/db";
import {
  readMessagingScheduleIn,
  updateMessagingScheduleIn,
} from "@/lib/services/messaging-schedule";
import {
  listRecruitmentCycleStepsIn,
  updateRecruitmentCycleStepIn,
  type RecruitmentCycleStepName,
} from "@/lib/services/recruitment-cycle";
import {
  readOnboardingChaseSettingsIn,
  setOnboardingChaseSettingsIn,
} from "@/lib/services/onboarding-chase";
import { EMPTY_ADMIN_ACTION_STATE, type AdminActionState } from "../action-state";
import { CYCLE_STEP_LABELS, readCycleStepsChange } from "./cycle-validation";
import { onboardingChaseChanged, readOnboardingChaseChange } from "./onboarding-chase-validation";
import {
  NO_SCHEDULE_CHANGES_NOTICE,
  cycleStepSavedNotice,
  cycleStepSaveFailedNotice,
  onboardingChaseSavedNotice,
  onboardingChaseSaveFailedNotice,
  scheduleSavedNotice,
  scheduleSaveFailedNotice,
} from "./presentation";
import { readOneScheduleChange, scheduleChanged } from "./validation";

// Saving one template's messaging schedule — W7, LAN-171, rekeyed by
// LAN-265. One action per row, not the whole page (OWNER-LAN171-04, Brian).
// Written only if it actually changed — an audit row otherwise misreports
// history.
export async function updateOneMessagingScheduleAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const operator = await requireCapability("delivery_administration");

  const templateId = formData.get("templateId");
  if (typeof templateId !== "string" || templateId.trim() === "") {
    return {
      ...EMPTY_ADMIN_ACTION_STATE,
      error: "This submission did not say which template it was for, so nothing was saved.",
    };
  }

  // LAN-265: read before checked, so a refusal names the template in the
  // club's words, not a browser-chosen hidden label.
  let current;
  try {
    current = await withTransaction((tx) => readMessagingScheduleIn(tx, templateId));
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return { ...EMPTY_ADMIN_ACTION_STATE, error: error.message };
  }

  const label = current.templateName;

  const validated = readOneScheduleChange(label, current.eventType, formData);
  if (!validated.ok) {
    return { ...EMPTY_ADMIN_ACTION_STATE, error: validated.message };
  }

  try {
    const wrote = await withTransaction(async (tx) => {
      const fresh = await readMessagingScheduleIn(tx, templateId);
      if (!scheduleChanged(fresh, validated.change)) return false;
      await updateMessagingScheduleIn(tx, operator.personId, templateId, validated.change);
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
    // OWNER-LAN171-02: names the row and rejected values, not a generic "try again".
    return {
      ...EMPTY_ADMIN_ACTION_STATE,
      error: scheduleSaveFailedNotice(label, validated.change),
    };
  }
}

// Saving one row of the recruitment cycle — LAN-203, `REQ-recruitment-cycle`.
// Both page rows cover two recruitment_cycle_steps rows each, written in
// one transaction — saves both or neither.
export async function updateRecruitmentCycleStepsAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const operator = await requireCapability("delivery_administration");

  const stepsField = formData.get("steps");
  if (typeof stepsField !== "string" || stepsField.trim() === "") {
    return {
      ...EMPTY_ADMIN_ACTION_STATE,
      error:
        "This submission did not say which recruitment cycle steps it was for, so nothing " +
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
        const changed = !before || before.offsetHours !== change.offsetHours;
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

// Saving the Onboarding section's one row — LAN-218, `W11`. Three fields;
// written only if changed (an audit row otherwise misreports history).
export async function updateOnboardingChaseSettingsAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const operator = await requireCapability("delivery_administration");

  const validated = readOnboardingChaseChange(formData);
  if (!validated.ok) {
    return { ...EMPTY_ADMIN_ACTION_STATE, error: validated.message };
  }

  try {
    const wrote = await withTransaction(async (tx) => {
      const current = await readOnboardingChaseSettingsIn(tx);
      if (!onboardingChaseChanged(current, validated.change)) return false;
      await setOnboardingChaseSettingsIn(tx, {
        actorPersonId: operator.personId,
        ...validated.change,
      });
      return true;
    });

    revalidatePath("/operate/admin/messaging");

    return {
      ...EMPTY_ADMIN_ACTION_STATE,
      notice: wrote ? onboardingChaseSavedNotice() : NO_SCHEDULE_CHANGES_NOTICE,
    };
  } catch (error) {
    if (!isServiceError(error)) throw error;
    if (error.kind === "not_permitted") {
      return { ...EMPTY_ADMIN_ACTION_STATE, refusal: error.message };
    }
    return {
      ...EMPTY_ADMIN_ACTION_STATE,
      error: onboardingChaseSaveFailedNotice(),
    };
  }
}
