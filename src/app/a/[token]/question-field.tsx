import { Field, SelectField } from "@/components/field";

import type { EventQuestionForAnswer } from "@/lib/services/player-home";

/**
 * One event question's answer control — text, boolean or choice. Shared by
 * `/a/[token]`'s landing page and `/me/[token]`'s focused panel. A hidden
 * `qkind_<id>` field rides beside the answer so the server action can parse
 * `q_<id>` without a second database round trip.
 *
 * `enforceRequired` (OWNER-LAN172-18): `/a/[token]` passes `false` because
 * its confirm button shares one `<form>` with the questions, so native
 * `required` would silently block the click that records the answer itself
 * — the opposite of W2's "a Yes stands while required questions remain
 * outstanding." `answerEventQuestionsIn` already skips a blank submission
 * rather than recording a false answer.
 *
 * Decision history: docs/ux/tickets/LAN-172-player-answer.md
 */
export function QuestionField({
  question,
  enforceRequired = true,
}: {
  question: EventQuestionForAnswer;
  enforceRequired?: boolean;
}) {
  const name = `q_${question.id}`;
  const required = enforceRequired && question.isRequired;
  const kindField = (
    <input type="hidden" name={`qkind_${question.id}`} value={question.answerType} />
  );

  if (question.answerType === "boolean") {
    return (
      <>
        {kindField}
        <SelectField
          name={name}
          label={question.prompt}
          required={required}
          defaultValue={
            question.currentAnswer?.boolean === true
              ? "true"
              : question.currentAnswer?.boolean === false
                ? "false"
                : ""
          }
          options={[
            { value: "", label: "(no answer)" },
            { value: "true", label: "Yes" },
            { value: "false", label: "No" },
          ]}
        />
      </>
    );
  }
  if (question.answerType === "choice") {
    return (
      <>
        {kindField}
        <SelectField
          name={name}
          label={question.prompt}
          required={required}
          defaultValue={question.currentAnswer?.choice ?? ""}
          options={[
            { value: "", label: "(no answer)" },
            ...(question.choices ?? []).map((choice) => ({ value: choice, label: choice })),
          ]}
        />
      </>
    );
  }
  return (
    <>
      {kindField}
      <Field
        name={name}
        label={question.prompt}
        required={required}
        defaultValue={question.currentAnswer?.text ?? ""}
        slotProps={{ htmlInput: { maxLength: 500 } }}
      />
    </>
  );
}
