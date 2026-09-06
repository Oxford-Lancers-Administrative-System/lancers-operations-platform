import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { PublicShell } from "@/components/public-shell";
import { PageHeader } from "@/components/page-header";
import { ActionBar } from "@/components/action-bar";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import type { EventQuestionForAnswer } from "@/lib/services/player-home";
import type { RecruitmentQuestionnaireAnswers } from "@/lib/services/recruitment-prospect";
import {
  GEAR_ITEMS,
  POSITION_GROUPS,
  positionValue,
  splitMultiAnswer,
} from "@/lib/services/recruitment-vocabulary";
import { QuestionField } from "./question-field";
import { GroupedMultiSelectField, MultiSelectField } from "@/components/multi-select-field";
import { submitInterestQuestionnaire } from "./interest-actions";
import { PRIVACY_NOTE } from "./presentation";

/**
 * Questionnaire B — "how you came to football". `W4`, LAN-206.
 *
 * Correction round 1, F-206-02 (Brian: "Mock up wins" on structure and copy
 * where the runnable fidelity mockup and the approved screens disagree):
 * heading, sub-heading, every field's prompt, the submit label and the
 * saved/already-answered flow all follow
 * `src/app/recruitment-preview/questionnaire-b.tsx` on
 * `origin/chore/recruitment-fidelity-mockup`, read directly. `played`,
 * `watched`, `heard` and `anything else` stay `question-field.tsx`'s own
 * shipped controls; `positions` and `gear` are the two the mockup makes
 * genuine multi-selects (Brian: "A recruit is allowed to be interested in
 * more than one thing"), which the shared `QuestionField` has no variant
 * for, so those two use the same `Checkbox`/`FormControlLabel` idiom
 * `audience-builder.tsx` already ships elsewhere in this application —
 * native, uncontrolled checkboxes, each its own `q_B3`/`q_B4` form field, so
 * the plain server-action `<form>` this page already posts through needs no
 * client-side state to carry several selections at once.
 *
 * Every field is optional — no `isRequired`, ever, on any of the six —
 * `REQ-missing-never-blocks` and W4's own "every field is optional and
 * nothing gates."
 */

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
      prompt: "Anything else",
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
    <PublicShell caption="Football background">
      <Stack spacing={3}>{children}</Stack>
    </PublicShell>
  );
}

/** The mockup's own "saved" state — right after this visit's own submit. */
function AnswersReceivedScreen({ token, displayName }: { token: string; displayName: string }) {
  return (
    <QuestionnaireBShell>
      <PageHeader title="Answers received" eyebrow={displayName} />
      <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1 }}>
        Nothing further is needed.
      </Typography>
      <Button
        variant="text"
        href={`/a/${token}?edit=1`}
        sx={{ minHeight: 48, mt: 2 }}
        data-testid="questionnaire-b-change-answer"
      >
        Change an answer
      </Button>
    </QuestionnaireBShell>
  );
}

/** The mockup's own "already" state — a later revisit, answers already on record. */
function AlreadyCompletedScreen({ token, displayName }: { token: string; displayName: string }) {
  return (
    <QuestionnaireBShell>
      <PageHeader title="Already completed" eyebrow={displayName} />
      <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1 }}>
        You can change any answer.
      </Typography>
      <Button
        variant="contained"
        href={`/a/${token}?edit=1`}
        sx={{ minHeight: 48, mt: 2 }}
        data-testid="questionnaire-b-change-answer"
      >
        Change an answer
      </Button>
    </QuestionnaireBShell>
  );
}

function QuestionnaireBForm({
  token,
  displayName,
  answers,
}: {
  token: string;
  displayName: string;
  answers: RecruitmentQuestionnaireAnswers;
}) {
  const selectedPositions = new Set(splitMultiAnswer(answers.positionInterest));
  const selectedGear = new Set(splitMultiAnswer(answers.gearOwned));
  const [played, watched, heard, anythingElse] = questionsFor(answers);

  return (
    <QuestionnaireBShell>
      <PageHeader title="Football background" eyebrow={displayName} />
      <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1 }}>
        For the coaching staff. Every question is optional.
      </Typography>

      <Box component="form" action={submitInterestQuestionnaire} sx={{ mt: 3 }}>
        <input type="hidden" name="token" value={token} />
        <Stack spacing={2.5}>
          <QuestionField question={played} enforceRequired={false} />
          <QuestionField question={watched} enforceRequired={false} />

          {/* V-5, correction round 2 (Brian: "The dropdown should have a
              multi-tick... That's awful" of the inline checkbox list
              correction round 1 shipped): the same outlined `TextField
              select` idiom `played`/`watched`/`heard` above already use,
              carrying tick boxes in its own menu — `multi-select-field.tsx`'s
              own module note has the mockup citation and the wiring detail.
              The option sets are unchanged from round 1. */}
          <GroupedMultiSelectField
            name="q_B3"
            label="Which positions interest you?"
            groups={POSITION_GROUPS.map((group) => ({
              label: group.label,
              options: group.positions.map(positionValue),
            }))}
            selected={selectedPositions}
          />

          <MultiSelectField
            name="q_B4"
            label="What playing gear do you already have?"
            options={GEAR_ITEMS}
            selected={selectedGear}
          />

          <QuestionField question={heard} enforceRequired={false} />
          <QuestionField question={anythingElse} enforceRequired={false} />
        </Stack>
        <Box sx={{ mt: 3 }}>
          <ActionBar
            primary={
              <Button type="submit" variant="contained" data-testid="questionnaire-b-submit">
                Submit
              </Button>
            }
          />
        </Box>
      </Box>

      <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 3 }}>{PRIVACY_NOTE}</Typography>
    </QuestionnaireBShell>
  );
}

/**
 * The three real states a GET to this route resolves to, matching the
 * mockup's own `state: "form" | "saved" | "already"` (`"invalid"` is the
 * uniform `not-found.tsx` the caller reaches through `notFound()` instead,
 * never rendered here).
 */
export function QuestionnaireBScreen({
  token,
  displayName,
  answers,
  saved,
  edit,
  hasAnyAnswer,
}: {
  token: string;
  displayName: string;
  answers: RecruitmentQuestionnaireAnswers;
  /** `?saved=1` — this visit's own submit just landed. */
  saved: boolean;
  /** `?edit=1` — "Change an answer", from either summary screen. */
  edit: boolean;
  /** Whether any of the six questions already carries an answer, from an earlier visit. */
  hasAnyAnswer: boolean;
}) {
  if (saved) return <AnswersReceivedScreen token={token} displayName={displayName} />;
  if (hasAnyAnswer && !edit) {
    return <AlreadyCompletedScreen token={token} displayName={displayName} />;
  }
  return <QuestionnaireBForm token={token} displayName={displayName} answers={answers} />;
}
