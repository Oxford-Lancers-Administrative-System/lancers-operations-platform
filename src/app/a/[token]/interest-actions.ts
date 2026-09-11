"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { withTransaction } from "@/lib/db";
import { ANSWER_GATE_COOKIE } from "@/lib/rsvp/answer-gate";
import { resolveRecruitmentInterestTokenIn } from "@/lib/services/recruitment-interest-tokens";
import { submitQuestionnaireBAnswersIn } from "@/lib/services/recruitment-questionnaire";
import { splitMultiAnswer } from "@/lib/services/recruitment-vocabulary";

/**
 * Questionnaire B's one write — LAN-206, same cookie-gated posture as
 * `submitAnswer`: refused without `ANSWER_GATE_COOKIE`, before any
 * transaction opens. Redirects back to `/a/[token]?saved=1` on success — no
 * second "answered" route; a recruit may return and change any answer any
 * time (W4's "the recruit answers twice" exception), reaching the form again
 * via `?edit=1`.
 *
 * Decision history: missions/intake/M-RECRUITMENT
 */
function yesNoOrNull(value: FormDataEntryValue | null): "yes" | "no" | null {
  if (value === "true") return "yes";
  if (value === "false") return "no";
  return null;
}

function textOrNull(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** F-206-02/V-5, round 2: MUI's multi-select posts one comma-joined field, not several same-name fields — `form.get`, not `getAll`, split with the same `splitMultiAnswer` the read path uses. */
function multiOrEmpty(form: FormData, name: string): readonly string[] {
  const value = form.get(name);
  return splitMultiAnswer(typeof value === "string" ? value : null);
}

export async function submitInterestQuestionnaire(form: FormData): Promise<void> {
  const token = typeof form.get("token") === "string" ? (form.get("token") as string) : "";
  const encoded = encodeURIComponent(token);

  const jar = await cookies();
  const gateIsOpen = (jar.get(ANSWER_GATE_COOKIE)?.value ?? "") !== "";
  if (!gateIsOpen) {
    redirect(`/a/${encoded}`);
  }

  try {
    await withTransaction(async (tx) => {
      const resolution = await resolveRecruitmentInterestTokenIn(tx, token);
      if (resolution.state !== "valid" || !resolution.resolved) {
        // Resolved again on the next GET; this action never distinguishes the reason.
        return;
      }
      await submitQuestionnaireBAnswersIn(tx, resolution.resolved.prospectId, {
        playedBefore: yesNoOrNull(form.get("q_B1")),
        watchedBefore: yesNoOrNull(form.get("q_B2")),
        positionInterest: multiOrEmpty(form, "q_B3"),
        gearOwned: multiOrEmpty(form, "q_B4"),
        howTheyHeard: textOrNull(form.get("q_B5")),
        anythingElse: textOrNull(form.get("q_B6")),
      });
    });
  } catch {
    redirect(`/a/${encoded}`);
  }

  redirect(`/a/${encoded}?saved=1`);
}
