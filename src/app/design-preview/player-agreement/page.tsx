import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ActionBar } from "@/components/action-bar";
import { CheckField } from "@/components/field";
import { Notice } from "@/components/notice";
import { PublicShell } from "@/components/public-shell";
import { Refusal } from "@/components/refusal";
import { Section } from "@/components/section";
import {
  AGREE_AND_CONTINUE,
  CODE_OF_CONDUCT_AGREE_LABEL,
  CODE_OF_CONDUCT_HEADING,
  CODE_OF_CONDUCT_LEAD,
  DOCUMENT_PRIVACY_NOTE,
  PLACEHOLDER_LABEL,
} from "@/app/me/[token]/details/presentation";
import { gateShellPage } from "@/app/operate/gate";
import { pickQuestionnaireSubject } from "../picks";
import { QuestionnaireShell } from "../player-details/questionnaire-shell";

/**
 * S10b — step 2 of the player's questionnaire, the document to read and
 * agree (`/me/[token]/details?step=code_of_conduct`). LAN-225's
 * player-surfaces addendum.
 *
 * The second half of the questionnaire is a different shape from the first —
 * a long scrolling document, one tick box, one button — and judging the
 * sequence on the form alone would leave that shape unjudged. The words are
 * the real page's, unchanged, including the placeholder banner: the real Code
 * of Conduct is owed under LAN-213 and this ticket does not write it.
 *
 * What changes: the masthead, the `StepTrail` in place of the five-column
 * `<dl>`, the document in a `Section` at the reading measure rather than a
 * 340px scroll box with a hand-drawn `rgba(0,0,0,0.23)` border, the
 * placeholder banner as a `Notice` rather than 12px warning-coloured text,
 * and the foot as an `ActionBar`. Drawn, not wired.
 */
const PLACEHOLDER_BODY =
  "PLACEHOLDER. The real Code of Conduct is Clint's, through LAN-213, and has not been written " +
  "into this system. This text exists only to show the shape of the page and the length a real " +
  "document runs to.";

export default async function PlayerAgreementPreviewPage() {
  const gate = await gateShellPage("/design-preview/player-agreement");
  if ("screen" in gate) return gate.screen;

  const view = await pickQuestionnaireSubject();
  if (!view) {
    return (
      <PublicShell caption="Joining" width="medium">
        <Refusal
          title="No questionnaire to show"
          message="The seed has no active membership with an outstanding ask to draw."
          action={{ href: "/design-preview", label: "Back to the preview" }}
        />
      </PublicShell>
    );
  }

  const agreement = view.agreements.code_of_conduct;

  return (
    <QuestionnaireShell
      view={view}
      currentStep="code_of_conduct"
      heading={CODE_OF_CONDUCT_HEADING}
      lead={CODE_OF_CONDUCT_LEAD}
      privacyNote={DOCUMENT_PRIVACY_NOTE}
      testId="player-agreement-preview"
    >
      {agreement ? (
        <Notice severity="success">
          Already agreed — version {agreement.agreementVersionId.slice(0, 8)}, on{" "}
          {agreement.agreedAt.toISOString().slice(0, 10)}.
        </Notice>
      ) : null}

      <Notice severity="warning" testId="placeholder-wording">
        {PLACEHOLDER_LABEL}
      </Notice>

      <Section title="The document">
        <Box sx={{ maxHeight: 340, overflow: "auto" }}>
          <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
            {PLACEHOLDER_BODY}
          </Typography>
        </Box>
      </Section>

      <Stack spacing={2}>
        <CheckField name="agree" label={CODE_OF_CONDUCT_AGREE_LABEL} />
        <ActionBar
          primary={
            <Button type="button" variant="contained" sx={{ minHeight: 44 }}>
              {AGREE_AND_CONTINUE}
            </Button>
          }
        />
      </Stack>
    </QuestionnaireShell>
  );
}
