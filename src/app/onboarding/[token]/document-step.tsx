/**
 * Steps 2 and 3 — the two documents. Split from `page.tsx` (LAN-300).
 *
 * Both render the wording of the version they are asking to be agreed to, out
 * of `onboarding_agreement_versions` (LAN-347); neither carries its document's
 * text. The Code of Conduct's row is still the labelled placeholder LAN-214
 * seeded, so it shows the placeholder warning until LAN-282 lands Clint's
 * wording; the photo release's row is the University of Oxford's own consent
 * form, so it shows no warning and lays its sections out as that form prints
 * them — `photo-release-form.tsx`.
 */
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { Notice } from "@/components/notice";
import { Surface } from "@/components/surface";
import { CheckField } from "@/components/field";
import { ActionBar } from "@/components/action-bar";
import { formatDay } from "@/app/operate/roster/presentation";
import { todayInClubZone } from "@/lib/club-time";

import type { OnboardingAgreementType } from "@/lib/services/onboarding-agreements";
import {
  isPlaceholderVersion,
  parseAgreementBody,
} from "@/lib/services/onboarding-agreement-body";
import { photoReleasePrefill } from "@/lib/services/player-questionnaire";
import type { QuestionnaireView } from "@/lib/services/player-questionnaire";

import { agreeDocument } from "./actions";
import { AgreementBlocks } from "./agreement-text";
import { PhotoReleaseForm } from "./photo-release-form";
import {
  AGREE_AND_CONTINUE,
  CODE_OF_CONDUCT_AGREE_LABEL,
  CODE_OF_CONDUCT_HEADING,
  CODE_OF_CONDUCT_LEAD,
  DOCUMENT_PRIVACY_NOTE,
  MUST_AGREE_ERROR,
  PHOTO_RELEASE_HEADING,
  PHOTO_RELEASE_LEAD,
  PLACEHOLDER_LABEL,
  photoReleaseEventLine,
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
  const version = view.agreementVersions[agreementType];
  const sections = parseAgreementBody(version.body);

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
        {/* Only while this document's current version is still a placeholder. */}
        {isPlaceholderVersion(version.versionLabel) ? (
          <Notice severity="warning">{PLACEHOLDER_LABEL}</Notice>
        ) : null}

        {isCodeOfConduct ? (
          <>
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
              <AgreementBlocks blocks={sections.flatMap((section) => section.blocks)} />
            </Box>
            <Box component="form" action={agreeDocument} sx={{ mt: 2 }}>
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="agreementType" value={agreementType} />
              <CheckField name="agree" label={CODE_OF_CONDUCT_AGREE_LABEL} />
              <ActionBar
                primary={
                  <Button type="submit" variant="contained">
                    {AGREE_AND_CONTINUE}
                  </Button>
                }
              />
            </Box>
          </>
        ) : (
          <PhotoReleaseForm
            token={token}
            sections={sections}
            initialValues={photoReleasePrefill(view.person)}
            eventLine={photoReleaseEventLine(view.seasonLabel)}
            dateLine={formatDay(todayInClubZone())}
          />
        )}
      </Surface>
    </Shell>
  );
}
