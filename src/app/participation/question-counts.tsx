import Box from "@mui/material/Box";
import { Section } from "@/components/section";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import {
  summariseQuestion,
  type OperatorParticipation,
  type ParticipationQuestion,
} from "@/lib/services/participation-view";

import { NOTHING, QUESTIONS_HEADING, QUESTION_NO_ANSWER } from "./presentation";

/**
 * D68's other half: **a collapsed Questions section on the event page showing
 * counts.** The per-person answers are in the table; this is the shape of the
 * answers at a glance — "eleven need a lift" is the thing an operator actually
 * acts on, and reading it off forty-seven rows is not answering the question.
 *
 * Collapsed by a real `<details>` rather than an accordion, so it needs no
 * client component, works with scripting disabled, and costs nothing on the
 * server. Open it and it stays open by the browser's own mechanics.
 *
 * The counts come from the rows the table already has —
 * `summariseQuestion` — so the section and the columns cannot disagree.
 */
function QuestionLine({
  question,
  people,
}: {
  question: ParticipationQuestion;
  people: OperatorParticipation["people"];
}) {
  const summary = summariseQuestion(people, question);
  const parts = [
    ...summary.answers.map((answer) => `${answer.label} ${answer.count}`),
    summary.noAnswer > 0 ? `${QUESTION_NO_ANSWER} ${summary.noAnswer}` : null,
  ].filter((part): part is string => part !== null);

  return (
    <Box data-testid="question-count" data-question={question.id}>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>
        {question.prompt}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {parts.length === 0 ? NOTHING : parts.join(" · ")}
      </Typography>
    </Box>
  );
}

export function QuestionCounts({ participation }: { participation: OperatorParticipation }) {
  if (participation.questions.length === 0) return null;

  return (
    <Box data-testid="question-counts">
      <Section title={QUESTIONS_HEADING} collapsible>
        <Stack spacing={1.5} sx={{ mt: 1.5 }}>
          {participation.questions.map((question) => (
            <QuestionLine key={question.id} question={question} people={participation.people} />
          ))}
        </Stack>
      </Section>
    </Box>
  );
}
