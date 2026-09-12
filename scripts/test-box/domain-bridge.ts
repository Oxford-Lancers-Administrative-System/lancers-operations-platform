/** Local node entrypoint, bundled only by the separate test panel. */
import { withTransaction } from "../../src/lib/db/transaction";
import {
  listOnboardingChaseCandidatesIn,
  readOnboardingChaseSettingsIn,
  describeOnboardingChaseNext,
} from "../../src/lib/services/onboarding-chase";
import {
  resolveAnswerTokenIn,
  consumeAnswerTokenIn,
  type PlayerAnswer,
} from "../../src/lib/services/player-answer-tokens";
import {
  readPlayerAnswerLandingIn,
  answerEventQuestionsIn,
} from "../../src/lib/services/player-home";
import { readPanelState, effectivePersonSettings } from "./panel-state.mjs";
import path from "node:path";

export async function onboardingExpectations() {
  return withTransaction(async (tx) => {
    const settings = await readOnboardingChaseSettingsIn(tx);
    return (await listOnboardingChaseCandidatesIn(tx)).map((c) => ({
      ...c,
      next: describeOnboardingChaseNext(c, settings),
    }));
  });
}

/** Recheck current identity, destination and valid link inside the write transaction. */
export async function simulateResponse(
  personId: string,
  token: string,
  kind: string,
  response?: string,
) {
  // LAN-297: people complete recruitment and onboarding forms manually.
  if (
    !["invitation", "reminder", "recruit_event_follow_up"].includes(kind) ||
    !/^[yn]\./.test(token)
  )
    throw new Error("Only event RSVPs and event questions may be simulated.");
  return withTransaction(async (tx) => {
    const p = (
      await tx.query<{ phone: string }>(
        `select coalesce(normalised_value,raw_value) as phone from public.contact_points where person_id=$1 and kind='phone' and valid_until is null order by is_preferred desc,created_at desc limit 1`,
        [personId],
      )
    ).rows[0];
    const state = readPanelState(path.resolve(".lancers-runtime"));
    const profile = effectivePersonSettings(state.people[personId], p ?? { phone: null });
    if (
      profile.identity !== "synthetic" ||
      profile.delivery !== "intercepted" ||
      !["prompt", "late"].includes(profile.responder) ||
      profile.completion === "none"
    )
      throw new Error("Synthetic response is not enabled for this person.");
    // LAN-298: the caller states the answer, because a change-of-mind plan
    // records the opposite of the person's standing event answer.
    const requested = response ?? profile.eventAnswer ?? "yes";
    if (requested !== "yes" && requested !== "no")
      throw new Error("A simulated event answer is either yes or no.");
    const answer: PlayerAnswer = requested;
    if (/^[yn]\./.test(token)) {
      const resolved = await resolveAnswerTokenIn(tx, token);
      if (!resolved.invitation || !resolved.writable)
        throw new Error("The response link does not belong to this synthetic person.");
      const recorded = await consumeAnswerTokenIn(tx, token, {
        response: answer,
        reason: answer === "no" ? "Synthetic test: unavailable" : undefined,
      });
      if (recorded.personId !== personId)
        throw new Error("The response token belongs to a different person.");
      let count = 0;
      if (recorded.answer === "yes" && recorded.capacity !== "recruit") {
        const landing = await readPlayerAnswerLandingIn(tx, recorded.invitationId);
        const questions =
          profile.completion === "all"
            ? landing.questions
            : profile.completion === "minimum"
              ? landing.questions.filter((q) => q.isRequired)
              : landing.questions.slice(0, Math.floor(landing.questions.length / 2));
        const answers = questions.map((q) => ({
          questionId: q.id,
          ...(q.answerType === "boolean"
            ? { boolean: true }
            : q.answerType === "choice"
              ? { choice: q.choices?.[0] ?? "" }
              : { text: "Synthetic test answer" }),
        }));
        if (answers.length)
          await answerEventQuestionsIn(tx, personId, recorded.invitationId, answers);
        count = answers.length;
      }
      return { action: `Event ${recorded.answer}; ${count} question answers`, fields: count };
    }
    throw new Error("Only event responses may be simulated.");
  });
}

export { MESSAGE_TEMPLATES } from "../../src/lib/delivery/templates";

// Same app services used by the local end-to-end proof; no panel HTTP route
// exposes event creation or operator impersonation.
export { createEventDraft } from "../../src/lib/services/events";
export { saveEventAudience, approveEvent } from "../../src/lib/services/event-approval";
export { selectionKey } from "../../src/lib/services/event-audience";
