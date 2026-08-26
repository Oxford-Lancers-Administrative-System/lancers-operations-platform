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
 */
export function QuestionField({ question }: { question: EventQuestionForAnswer }) {
  const name = `q_${question.id}`;
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
          required={question.isRequired}
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
          required={question.isRequired}
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
        required={question.isRequired}
        fullWidth
        defaultValue={question.currentAnswer?.text ?? ""}
        slotProps={{ htmlInput: { maxLength: 500 } }}
      />
    </>
  );
}
