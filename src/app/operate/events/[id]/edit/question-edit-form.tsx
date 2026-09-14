"use client";

import { useActionState, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
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
// points at the question row. Nothing this form saves is sent to anybody.

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

        <ActionBar
          primary={
            <Button type="submit" variant="contained" disabled={pending}>
              {pending ? "Saving…" : "Save questions"}
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
