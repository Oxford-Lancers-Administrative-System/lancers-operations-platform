"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { Section } from "@/components/section";
import IconButton from "@mui/material/IconButton";
import { FieldGroup } from "@/components/section";
import Stack from "@mui/material/Stack";
import { Field, SelectField } from "@/components/field";
import Typography from "@mui/material/Typography";
import {
  QUESTION_ANSWER_TYPE_LABELS,
  QUESTION_ANSWER_TYPES,
  type QuestionIssue,
  type RawEventQuestion,
} from "@/lib/services/event-questions-input";
import {
  fromTemplateChip,
  labelFor,
  QUESTIONS_FORM_DETAIL,
  QUESTIONS_HEADLINE,
} from "./presentation";

/**
 * Writing the questions an event asks — amendment W4-A1, inside the create and
 * edit form rather than on a screen of its own.
 *
 * Brian, 2026-08-21: "This is part of the create event workflow. It's not a
 * separate screen that needs its own thing ... it's ingrained in the process, so
 * you separated that inappropriately." Writing an event and deciding what to ask
 * the people invited to it are one act, so this is a section of that form and
 * posts through it.
 *
 * ## Every question is editable in place
 *
 * There is no read mode and no edit mode. A question is four small controls and
 * hiding three of them behind an **Edit** button buys a tidier list at the cost
 * of a click before every correction — on a form whose whole purpose is
 * correcting things. What the operator can see, they can change.
 *
 * ## The order is the order asked, and moving one really moves it
 *
 * The arrows reorder the array, which is what `sort_order` is written from, and
 * the hidden inputs below are emitted in that order. There is no drag and drop:
 * a pointer gesture that a keyboard cannot perform would put the ordering out of
 * reach of anybody not using a mouse, and this list is three items long.
 *
 * ## Controlled, because the type owns the template questions
 *
 * The parent holds the list. Changing the event's type has to swap the questions
 * that came from the old type's template for the new one's while leaving the
 * operator's own questions alone (D42), and a component holding its own copy
 * could not be told.
 *
 * ## The hidden inputs are the payload
 *
 * Five parallel repeating fields, read back with `FormData.getAll`. `fromTemplate`
 * travels with each one because it is what marks a question as having come with
 * the type — the chip an operator reads, and the flag that decides whether a
 * later template change may touch it.
 */

export interface QuestionEditorProps {
  questions: RawEventQuestion[];
  onChange: (questions: RawEventQuestion[]) => void;
  /** "Practice" — for the chip on a question the template supplied. */
  eventTypeLabel: string;
  /** Corrections from the last submission, addressed by position. */
  issues: readonly QuestionIssue[];
  disabled?: boolean;
  /**
   * The heading, so the template editor can say whose questions these are.
   *
   * The same component serves both surfaces because they *are* the same thing:
   * a template's questions become an event's questions unchanged, and an editor
   * that differed between the two would eventually accept something on one that
   * the other refused.
   */
  headline?: string;
  detail?: string;
}

function blankQuestion(): RawEventQuestion {
  return {
    prompt: "",
    answerType: "boolean",
    required: "optional",
    choices: "",
    fromTemplate: "false",
  };
}

export default function QuestionEditor({
  questions,
  onChange,
  eventTypeLabel,
  issues,
  disabled = false,
  headline = QUESTIONS_HEADLINE,
  detail = QUESTIONS_FORM_DETAIL,
}: QuestionEditorProps) {
  function update(index: number, patch: Partial<RawEventQuestion>) {
    onChange(
      questions.map((question, at) => (at === index ? { ...question, ...patch } : question)),
    );
  }

  function remove(index: number) {
    onChange(questions.filter((_, at) => at !== index));
  }

  function move(index: number, by: -1 | 1) {
    const to = index + by;
    if (to < 0 || to >= questions.length) return;
    const next = [...questions];
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
  }

  return (
    <Section title={headline} description={detail} testId="question-editor">
      {/*
        Always posted, even with no questions at all, and it is the difference
        between "this event asks nothing" and "this submission was not about the
        questions". Without it, removing the last question would post exactly
        what a caller with no opinion posts, and the service would leave the
        question it was told to delete in place.
      */}
      <input type="hidden" name="questionsPresent" value="1" />
      <Stack spacing={2}>
        {/*
          C4. There was filler here — "Nothing extra is asked. Add a
          question if this event needs one." — and Brian's reaction was
          "I hate extra text like this." The Add a question control below
          already says what to do; an empty list needs nothing above it.
        */}

        <Stack component="ol" spacing={2} sx={{ listStyle: "none", p: 0, m: 0 }}>
          {questions.map((question, index) => {
            const issue = issues.find((entry) => entry.index === index)?.message;
            const answerType = question.answerType ?? "boolean";
            return (
              <Box component="li" key={index} data-testid="question-card" data-index={index}>
                <FieldGroup title={`Question ${index + 1}`}>
                  <Stack spacing={2}>
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}
                    >
                      {question.fromTemplate === "true" ? (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          data-testid="from-template-chip"
                        >
                          {fromTemplateChip(eventTypeLabel)}
                        </Typography>
                      ) : null}
                      <Box sx={{ flexGrow: 1 }} />
                      <IconButton
                        size="small"
                        aria-label={`Move question ${index + 1} earlier`}
                        disabled={disabled || index === 0}
                        onClick={() => move(index, -1)}
                        data-testid="move-question-up"
                      >
                        ↑
                      </IconButton>
                      <IconButton
                        size="small"
                        aria-label={`Move question ${index + 1} later`}
                        disabled={disabled || index === questions.length - 1}
                        onClick={() => move(index, 1)}
                        data-testid="move-question-down"
                      >
                        ↓
                      </IconButton>
                      <Button
                        size="small"
                        color="error"
                        disabled={disabled}
                        onClick={() => remove(index)}
                        data-testid="remove-question"
                        sx={{ minHeight: 44 }}
                      >
                        Remove
                      </Button>
                    </Stack>

                    <Field
                      label="Question"
                      value={question.prompt ?? ""}
                      onChange={(event) => update(index, { prompt: event.target.value })}
                      error={Boolean(issue)}
                      helperText={issue}
                      disabled={disabled}

                      slotProps={{ inputLabel: { shrink: true } }}
                    />

                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                      <SelectField
                        label="Answer"
                        value={answerType}
                        onChange={(event) => update(index, { answerType: event.target.value })}
                        disabled={disabled}
                        options={QUESTION_ANSWER_TYPES.map((type) => ({
                          value: type,
                          label: labelFor(QUESTION_ANSWER_TYPE_LABELS, type),
                        }))}
                      />
                      <SelectField
                        label="Answering it"
                        value={question.required === "required" ? "required" : "optional"}
                        onChange={(event) => update(index, { required: event.target.value })}
                        disabled={disabled}
                        options={[
                          { value: "optional", label: "Optional" },
                          { value: "required", label: "Required" },
                        ]}
                      />
                    </Stack>

                    {answerType === "choice" ? (
                      <Field
                        label="Options"
                        value={question.choices ?? ""}
                        onChange={(event) => update(index, { choices: event.target.value })}
                        disabled={disabled}
                        helperText="Separated by commas — S, M, L, XL"

                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                    ) : null}
                  </Stack>

                  <input type="hidden" name="questionPrompt" value={question.prompt ?? ""} />
                  <input type="hidden" name="questionAnswerType" value={answerType} />
                  <input
                    type="hidden"
                    name="questionRequired"
                    value={question.required === "required" ? "required" : "optional"}
                  />
                  <input type="hidden" name="questionChoices" value={question.choices ?? ""} />
                  <input
                    type="hidden"
                    name="questionFromTemplate"
                    value={question.fromTemplate === "true" ? "true" : "false"}
                  />
                </FieldGroup>
              </Box>
            );
          })}
        </Stack>

        <Box>
          <Button
            variant="outlined"
            disabled={disabled}
            onClick={() => onChange([...questions, blankQuestion()])}
            data-testid="add-question"
            sx={{ minHeight: 44 }}
          >
            Add a question
          </Button>
        </Box>
      </Stack>
    </Section>
  );
}
