"use client";

import { useActionState, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import { ActionBar } from "@/components/action-bar";
import { preventImplicitSubmit } from "@/components/field";
import { Notice } from "@/components/notice";
import { RECRUITMENT_EVENT_TYPE } from "@/lib/services/audience-selection";
import type { RawEventQuestion } from "@/lib/services/event-questions-input";
import { updateEventQuestionsAction } from "../../actions";
import { EMPTY_FORM_STATE } from "../../form-state";
import { RECRUIT_QUESTIONS_NOTICE } from "../../presentation";
import QuestionEditor from "../../question-editor";

// LAN-318, amending D41 (Brian, 2026-09-11) — the questions of an event that has already been
// approved. The same `QuestionEditor` the draft uses, on its own: the event's own facts are not
// editable here (that is the amend path, W5), and Remove is absent because an answer already given
// points at the question row.
//
// LAN-367, Brian 2026-09-16: a save that changes a question no longer passes in silence. It voids
// the answers to that question and asks the people who gave them again, so the save is confirmed
// first — with the count, and with D3's "This is a correction, keep answers" tick for a wording fix
// that is genuinely a fix. A save that changes no question shows no confirm and sends nothing.

/** What the confirmation says, in the club's own counting. */
function changeSummary(changed: number, added: number, people: number): string {
  const parts: string[] = [];
  if (changed > 0)
    parts.push(changed === 1 ? "1 question changed" : `${changed} questions changed`);
  if (added > 0) parts.push(added === 1 ? "1 question added" : `${added} questions added`);
  const who =
    people === 1 ? "1 person will be asked again" : `${people} people will be asked again`;
  return `${parts.join(", ")}, ${who}.`;
}

export default function QuestionEditForm({
  eventId,
  eventTypeLabel,
  eventType,
  initialQuestions,
  cancelHref,
}: {
  eventId: string;
  eventTypeLabel: string;
  /** The `public.event_type` class, for LAN-339's notice — never the template's name. */
  eventType: string;
  initialQuestions: readonly RawEventQuestion[];
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(updateEventQuestionsAction, EMPTY_FORM_STATE);

  const [questions, setQuestions] = useState<RawEventQuestion[]>(() => [
    ...(state.questions ?? initialQuestions),
  ]);
  const [correction, setCorrection] = useState(false);
  const change = state.questionChange ?? null;

  return (
    <Box
      component="form"
      action={formAction}
      onKeyDown={preventImplicitSubmit}
      data-testid="event-questions-form"
    >
      <input type="hidden" name="eventId" value={eventId} />

      <Stack spacing={3} sx={{ maxWidth: 760 }}>
        {state.error ? (
          <Notice severity="error" testId="event-questions-error">
            {state.error}
          </Notice>
        ) : null}

        <QuestionEditor
          questions={questions}
          onChange={setQuestions}
          eventTypeLabel={eventTypeLabel}
          issues={state.questionIssues}
          disabled={pending}
          removable={false}
          notice={eventType === RECRUITMENT_EVENT_TYPE ? RECRUIT_QUESTIONS_NOTICE : undefined}
        />

        {change ? (
          <Notice severity="warning" testId="event-questions-confirm">
            {changeSummary(change.changedPrompts.length, change.addedCount, change.peopleToAsk)}
          </Notice>
        ) : null}

        {change ? (
          <Box>
            <FormControlLabel
              control={
                <Checkbox
                  checked={correction}
                  onChange={(event) => setCorrection(event.target.checked)}
                  disabled={pending}
                  data-testid="event-questions-correction"
                />
              }
              label="This is a correction, keep answers"
            />
            <input type="hidden" name="correction" value={correction ? "1" : "0"} />
            <input type="hidden" name="confirm" value="1" />
          </Box>
        ) : null}

        <ActionBar
          primary={
            <Button
              type="submit"
              variant="contained"
              disabled={pending}
              data-testid="event-questions-save"
            >
              {pending ? "Saving…" : change ? "Save and ask again" : "Save questions"}
            </Button>
          }
          cancel={
            <Button variant="text" href={cancelHref} disabled={pending}>
              Cancel
            </Button>
          }
        />
      </Stack>
    </Box>
  );
}
