import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import { Field, SelectField } from "@/components/field";

import type { EventQuestionForAnswer } from "@/lib/services/player-home";

/**
 * One event question's answer control — text, boolean or choice. Shared by
 * `/a/<yes|no>/[token]`'s landing page, `/questions/[token]`'s own page, and
 * `/events/[token]`'s focused panel. A hidden `qkind_<id>` field rides
 * beside the answer so the server action can parse `q_<id>` without a
 * second database round trip.
 *
 * `enforceRequired` (OWNER-LAN172-18): `/a/<yes|no>/[token]` passes `false` because
 * its confirm button shares one `<form>` with the questions, so native
 * `required` would silently block the click that records the answer itself
 * — the opposite of W2's "a Yes stands while required questions remain
 * outstanding." `answerEventQuestionsIn` already skips a blank submission
 * rather than recording a false answer.
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
  // LAN-367 correction (A3): a label only, beside the question, so an
  // invitee who already answered once is not left thinking their answer
  // never arrived — never a sentence, the same rule every other state on
  // this surface keeps.
  const changedLabel = question.wasChanged ? (
    <Chip
      size="small"
      variant="outlined"
      color="warning"
      label="Question changed"
      data-testid="question-changed-label"
      sx={{ alignSelf: "flex-start" }}
    />
  ) : null;

  if (question.answerType === "boolean") {
    return (
      <Stack spacing={0.5}>
        {changedLabel}
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
      </Stack>
    );
  }
  if (question.answerType === "choice") {
    return (
      <Stack spacing={0.5}>
        {changedLabel}
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
      </Stack>
    );
  }
  return (
    <Stack spacing={0.5}>
      {changedLabel}
      {kindField}
      <Field
        name={name}
        label={question.prompt}
        required={required}
        defaultValue={question.currentAnswer?.text ?? ""}
        slotProps={{ htmlInput: { maxLength: 500 } }}
      />
    </Stack>
  );
}
