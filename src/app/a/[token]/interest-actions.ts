"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { withTransaction } from "@/lib/db";
import { ANSWER_GATE_COOKIE } from "@/lib/rsvp/answer-gate";
import { resolveRecruitmentInterestTokenIn } from "@/lib/services/recruitment-interest-tokens";
import { submitQuestionnaireBAnswersIn } from "@/lib/services/recruitment-questionnaire";

/**
 * Questionnaire B's one write — LAN-206, on the same cookie-gated posture
 * `/a/[token]`'s own `submitAnswer` already keeps: `src/proxy.ts` sets
 * `ANSWER_GATE_COOKIE` on every GET to this exact path, scoped to this exact
 * token, and this POST is refused without it — the cheapest possible refusal
 * for the automated traffic that gate exists to repel, before any
 * transaction opens.
 *
 * Redirects back to the same `/a/[token]` route on success — this page has
 * no second, "answered" route the way the RSVP flow's `/me/[token]` is,
 * because a recruit may return and change any answer at any time (W4's own
 * "the recruit answers twice" exception), so the same GET simply re-renders
 * the same form, prefilled, with a transient saved banner.
 */
function yesNoOrNull(value: FormDataEntryValue | null): "yes" | "no" | null {
  if (value === "true") return "yes";
  if (value === "false") return "no";
  return null;
}

function textOrNull(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
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
        // Resolved again on the next GET, which renders the uniform invalid
        // page if the token really is dead — this action never distinguishes
        // the reason itself.
        return;
      }
      await submitQuestionnaireBAnswersIn(tx, resolution.resolved.prospectId, {
        playedBefore: yesNoOrNull(form.get("q_B1")),
        watchedBefore: yesNoOrNull(form.get("q_B2")),
        positionInterest: textOrNull(form.get("q_B3")),
        gearOwned: textOrNull(form.get("q_B4")),
        howTheyHeard: textOrNull(form.get("q_B5")),
        anythingElse: textOrNull(form.get("q_B6")),
      });
    });
  } catch {
    redirect(`/a/${encoded}`);
  }

  redirect(`/a/${encoded}?saved=1`);
}
