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
 * Writing the questions an event asks — amendment W4-A1, inside the create/edit
 * form itself, not a separate screen. Every question is editable in place (no
 * read/edit toggle); reordering moves the array (no drag-and-drop); the type
 * owns template questions (D42) so the list is controlled by the parent; the
 * hidden inputs are the payload, read back via `FormData.getAll`.
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
   * The heading — same component serves the event and template editors,
   * since a template's questions become an event's questions unchanged.
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
      {/* Always posted, even with no questions — distinguishes "asks nothing" from "not about questions" (service would otherwise leave a deleted question in place). */}
      <input type="hidden" name="questionsPresent" value="1" />
      <Stack spacing={2}>
        {/* C4: no filler when the list is empty — Add a question already says what to do. */}

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
