import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";

import type { EventQuestionForAnswer } from "@/lib/services/player-home";

/**
 * One event question's own answer control — text, boolean or choice,
 * required or optional. Shared between the two surfaces that ask an event's
 * questions: `/a/[token]`'s own landing page (owner correction round 5,
 * OWNER-LAN172-12 — "the answers should be [there]... I shouldn't have to
 * click twice") and `/me/[token]`'s focused panel, which still asks whatever
 * the landing page did not collect (Q-11 keeps the landing page's GET
 * side-effect-free, so a scanner or reload never answers on the player's
 * behalf; the panel remains the fallback surface for anything left over).
 *
 * A hidden `qkind_<id>` field always rides beside the answer field itself so
 * the server action can parse `q_<id>`'s value without a second round trip
 * to the database to learn what kind of question it was answering.
 *
 * ## `enforceRequired` — OWNER-LAN172-18
 *
 * `/me/[token]`'s own dedicated questions form (`submitQuestions`) never
 * records the RSVP itself — the Yes already stands by the time that form is
 * on screen — so the native `required` attribute there only ever blocks
 * *that form's own* save, never the answer, and stays on by default.
 * `/a/[token]`'s landing page is different: its confirm button and its
 * questions share one `<form>`, so `required` there silently blocked the
 * click that records the answer itself — the opposite of W2's "a Yes stands
 * while required event questions remain outstanding." `/a/[token]` passes
 * `enforceRequired={false}` so a blank required question never stops that
 * submit (auto- or manual); `answerEventQuestionsIn` already skips a blank
 * submission rather than saving an empty answer, so nothing false is ever
 * recorded — the question simply stays outstanding for the follow-up panel.
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
        <TextField
          select
          name={name}
          label={question.prompt}
          required={required}
          fullWidth
          defaultValue={
            question.currentAnswer?.boolean === true
              ? "true"
              : question.currentAnswer?.boolean === false
                ? "false"
                : ""
          }
        >
          <MenuItem value="">(no answer)</MenuItem>
          <MenuItem value="true">Yes</MenuItem>
          <MenuItem value="false">No</MenuItem>
        </TextField>
      </>
    );
  }
  if (question.answerType === "choice") {
    return (
      <>
        {kindField}
        <TextField
          select
          name={name}
          label={question.prompt}
          required={required}
          fullWidth
          defaultValue={question.currentAnswer?.choice ?? ""}
        >
          <MenuItem value="">(no answer)</MenuItem>
          {(question.choices ?? []).map((choice) => (
            <MenuItem key={choice} value={choice}>
              {choice}
            </MenuItem>
          ))}
        </TextField>
      </>
    );
  }
  return (
    <>
      {kindField}
      <TextField
        name={name}
        label={question.prompt}
        required={required}
        fullWidth
        defaultValue={question.currentAnswer?.text ?? ""}
        slotProps={{ htmlInput: { maxLength: 500 } }}
      />
    </>
  );
}
