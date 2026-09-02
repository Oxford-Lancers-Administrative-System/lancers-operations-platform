import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import type { EventQuestionForAnswer } from "@/lib/services/player-home";
import type { RecruitmentQuestionnaireAnswers } from "@/lib/services/recruitment-prospect";
import { QuestionField } from "./question-field";
import { submitInterestQuestionnaire } from "./interest-actions";
import { BANNER, PRIVACY_NOTE } from "./presentation";

/**
 * Questionnaire B — "how you came to football". `W4-02`, LAN-206.
 *
 * The recruit-stage field set W4 enumerates: yes/no for played and watched,
 * a chooser where the answer set is fixed, fill-in text only for "anything
 * else" — `question-field.tsx`'s own three controls, reused rather than
 * replaced, per the mockup's own note that College and Matriculation year
 * (Questionnaire A, gone from this route) are text inputs on the shipped
 * person-edit form while "How did you hear" and its siblings are genuinely
 * fixed sets. Position interest and gear are one choice each, not a
 * multi-select — `question-field.tsx` exports exactly `boolean`, `choice`
 * and `text`, and W4's own approved field table calls each a single
 * "chooser", not a chooser-of-many.
 *
 * Every field is optional — no `isRequired`, ever, on any of the six —
 * `REQ-missing-never-blocks` and W4's own "every field is optional and
 * nothing gates."
 */

const POSITION_CHOICES = [
  "No preference",
  "Quarterback",
  "Running back",
  "Wide receiver",
  "Offensive line",
  "Defensive line",
  "Linebacker",
  "Defensive back",
  "Kicker",
];

const GEAR_CHOICES = ["None", "Boots only", "Boots and gloves", "Full pads", "Something else"];

const HEARD_CHOICES = [
  "Freshers' Fair",
  "A friend or teammate",
  "A poster or QR code",
  "Social media",
  "Somewhere else",
];

function questionsFor(answers: RecruitmentQuestionnaireAnswers): readonly EventQuestionForAnswer[] {
  return [
    {
      id: "B1",
      prompt: "Have you played American football before?",
      answerType: "boolean",
      choices: null,
      isRequired: false,
      currentAnswer:
        answers.playedBefore === null
          ? null
          : { text: null, boolean: answers.playedBefore === "yes", choice: null },
    },
    {
      id: "B2",
      prompt: "Have you watched American football before?",
      answerType: "boolean",
      choices: null,
      isRequired: false,
      currentAnswer:
        answers.watchedBefore === null
          ? null
          : { text: null, boolean: answers.watchedBefore === "yes", choice: null },
    },
    {
      id: "B3",
      prompt: "Which position interests you?",
      answerType: "choice",
      choices: POSITION_CHOICES,
      isRequired: false,
      currentAnswer:
        answers.positionInterest === null
          ? null
          : { text: null, boolean: null, choice: answers.positionInterest },
    },
    {
      id: "B4",
      prompt: "What playing gear do you already own?",
      answerType: "choice",
      choices: GEAR_CHOICES,
      isRequired: false,
      currentAnswer:
        answers.gearOwned === null
          ? null
          : { text: null, boolean: null, choice: answers.gearOwned },
    },
    {
      id: "B5",
      prompt: "How did you hear about the Lancers?",
      answerType: "choice",
      choices: HEARD_CHOICES,
      isRequired: false,
      currentAnswer:
        answers.howTheyHeard === null
          ? null
          : { text: null, boolean: null, choice: answers.howTheyHeard },
    },
    {
      id: "B6",
      prompt: "Anything else you would like us to know?",
      answerType: "text",
      choices: null,
      isRequired: false,
      currentAnswer:
        answers.anythingElse === null
          ? null
          : { text: answers.anythingElse, boolean: null, choice: null },
    },
  ];
}

export function QuestionnaireBShell({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "grey.100", py: { xs: 3, sm: 6 }, px: 2 }}>
      <Box sx={{ maxWidth: 720, mx: "auto" }}>
        <Typography
          component="p"
          sx={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: "text.secondary",
            mb: 2,
          }}
        >
          {BANNER}
        </Typography>
        <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 2 }}>
          {children}
        </Paper>
      </Box>
    </Box>
  );
}

export function QuestionnaireBForm({
  token,
  displayName,
  answers,
  saved,
}: {
  token: string;
  displayName: string;
  answers: RecruitmentQuestionnaireAnswers;
  saved: boolean;
}) {
  return (
    <QuestionnaireBShell>
      <Typography
        sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "primary.main" }}
      >
        {displayName.toUpperCase()}
      </Typography>
      <Typography component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700, mt: 0.5 }}>
        About your football experience
      </Typography>
      <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1 }}>
        So the coaches know where to start with you. There are no wrong answers and nothing here
        decides whether you can play. Every question is optional.
      </Typography>

      {saved ? (
        <Alert severity="success" sx={{ mt: 3 }} data-testid="questionnaire-b-saved">
          Thanks — your answers are saved. You can change anything below at any time.
        </Alert>
      ) : null}

      <Box component="form" action={submitInterestQuestionnaire} sx={{ mt: 3 }}>
        <input type="hidden" name="token" value={token} />
        <Stack spacing={2.5}>
          {questionsFor(answers).map((question) => (
            <QuestionField key={question.id} question={question} enforceRequired={false} />
          ))}
        </Stack>
        <Button
          type="submit"
          variant="contained"
          fullWidth
          sx={{ minHeight: 48, mt: 3 }}
          data-testid="questionnaire-b-submit"
        >
          SEND MY ANSWERS
        </Button>
      </Box>

      <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 3 }}>{PRIVACY_NOTE}</Typography>
    </QuestionnaireBShell>
  );
}
