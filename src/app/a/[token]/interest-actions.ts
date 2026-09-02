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
 * Redirects back to the same `/a/[token]` route on success, `?saved=1` —
 * this page has no second, "answered" route the way the RSVP flow's
 * `/me/[token]` is; the same GET re-resolves the same token and renders the
 * mockup's own "Answers received" screen (`interest-questionnaire.tsx`'s
 * `QuestionnaireBScreen`). A recruit may return and change any answer at any
 * time (W4's own "the recruit answers twice" exception) — a later visit with
 * no `?saved=1` and an answer already on record shows "Already completed"
 * instead, with its own "Change an answer" link back to the same route with
 * `?edit=1`, which is what actually reaches the form again.
 */
function yesNoOrNull(value: FormDataEntryValue | null): "yes" | "no" | null {
  if (value === "true") return "yes";
  if (value === "false") return "no";
  return null;
}

function textOrNull(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * F-206-02, correction round 1: "Which positions interest you?" and "What
 * playing gear do you already have?" are genuine multi-selects, each its own
 * checkbox per option under the same `name` — `getAll` returns every one
 * that was checked, in document order.
 */
function multiOrEmpty(form: FormData, name: string): readonly string[] {
  return form
    .getAll(name)
    .filter((value): value is string => typeof value === "string" && value.trim() !== "");
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
