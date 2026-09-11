import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { describeQuestionAnswer, type EventQuestion } from "@/lib/services/events";
import { RSVP_FIRST_QUESTION, RSVP_FIRST_QUESTION_ANSWER } from "../presentation";

// The questions, exactly as a player will meet them — amendment W4-A1.
// Decision history: docs/ux/tickets/LAN-77-event-approval.md.
export function QuestionList({
  questions,
  leadWithRsvp,
  testId,
}: {
  questions: readonly EventQuestion[];
  leadWithRsvp: boolean;
  testId: string;
}) {
  return (
    <Stack component="ol" spacing={1} sx={{ listStyle: "none", p: 0, m: 0 }} data-testid={testId}>
      {leadWithRsvp ? (
        <Box component="li" sx={{ py: 1, borderBottom: 1, borderColor: "divider" }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {RSVP_FIRST_QUESTION}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {RSVP_FIRST_QUESTION_ANSWER}
          </Typography>
        </Box>
      ) : null}
      {questions.map((question) => (
        <Box
          component="li"
          key={question.id}
          sx={{ py: 1, borderBottom: 1, borderColor: "divider" }}
          data-testid="question-row"
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {question.prompt}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {question.isRequired ? "Required" : "Optional"}
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {describeQuestionAnswer(question)}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}
