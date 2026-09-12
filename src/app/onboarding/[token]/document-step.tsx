/**
 * Steps 2 and 3 — the two documents. Split from `page.tsx` (LAN-300).
 */
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { Notice } from "@/components/notice";
import { Surface } from "@/components/surface";
import { CheckField } from "@/components/field";
import { ActionBar } from "@/components/action-bar";
import { formatDay } from "@/app/operate/roster/presentation";

import type { OnboardingAgreementType } from "@/lib/services/onboarding-agreements";
import type { QuestionnaireView } from "@/lib/services/player-questionnaire";

import { agreeDocument } from "./actions";
import {
  AGREE_AND_CONTINUE,
  CODE_OF_CONDUCT_AGREE_LABEL,
  CODE_OF_CONDUCT_HEADING,
  CODE_OF_CONDUCT_LEAD,
  DOCUMENT_PRIVACY_NOTE,
  MUST_AGREE_ERROR,
  PHOTO_RELEASE_AGREE_LABEL,
  PHOTO_RELEASE_HEADING,
  PHOTO_RELEASE_LEAD,
  PLACEHOLDER_LABEL,
} from "./presentation";
import { Shell } from "./step-shell";

export function DocumentStepPage({
  view,
  token,
  agreementType,
  agreeError,
}: {
  view: QuestionnaireView;
  token: string;
  agreementType: OnboardingAgreementType;
  agreeError: boolean;
}) {
  // LAN-240: settled, not "is there a row". The panel used to read the
  // agreement row directly while the navigator above it read the item, so a
  // reopened document announced "Already agreed" and "Outstanding" on the
  // same screen. Both now read the one answer the view publishes, and the row
  // is consulted only for the version and date to print once it *is* settled.
  const agreed = view.documentAgreed[agreementType];
  const agreement = agreed ? view.agreements[agreementType] : null;
  const isCodeOfConduct = agreementType === "code_of_conduct";
  const heading = isCodeOfConduct ? CODE_OF_CONDUCT_HEADING : PHOTO_RELEASE_HEADING;
  const lead = isCodeOfConduct ? CODE_OF_CONDUCT_LEAD : PHOTO_RELEASE_LEAD;
  const agreeLabel = isCodeOfConduct ? CODE_OF_CONDUCT_AGREE_LABEL : PHOTO_RELEASE_AGREE_LABEL;

  return (
    <Shell
      view={view}
      currentStep={agreementType}
      heading={heading}
      lead={lead}
      privacyNote={DOCUMENT_PRIVACY_NOTE}
    >
      <Surface>
        {agreeError ? <Notice severity="error">{MUST_AGREE_ERROR}</Notice> : null}
        {agreement ? (
          <Notice severity="success">
            Already agreed — version {agreement.agreementVersionId.slice(0, 8)}, on{" "}
            {formatDay(agreement.agreedAt.toISOString().slice(0, 10))}.
          </Notice>
        ) : null}
        <Notice severity="warning">{PLACEHOLDER_LABEL}</Notice>
        <Box
          sx={{
            border: "1px solid rgba(0,0,0,0.23)",
            borderRadius: 1,
            p: 2,
            maxHeight: 340,
            overflow: "auto",
            bgcolor: "background.paper",
          }}
        >
          <Typography sx={{ fontSize: 13.5, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
            {isCodeOfConduct
              ? "PLACEHOLDER. The real Code of Conduct is Clint's, through LAN-213, and has not been written into this system. This text exists only to show the shape of the page and the length a real document runs to."
              : "PLACEHOLDER. The real photo release is Clint's, through LAN-213. This text shows the shape of the page and carries no policy of its own."}
          </Typography>
        </Box>
        <Box component="form" action={agreeDocument} sx={{ mt: 2 }}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="agreementType" value={agreementType} />
          <CheckField name="agree" label={agreeLabel} />
          <ActionBar
            primary={
              <Button type="submit" variant="contained">
                {AGREE_AND_CONTINUE}
              </Button>
            }
          />
        </Box>
      </Surface>
    </Shell>
  );
}
