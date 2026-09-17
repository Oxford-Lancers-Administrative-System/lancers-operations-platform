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
import Typography from "@mui/material/Typography";
import { Notice } from "@/components/notice";
import { Surface } from "@/components/surface";
import { CheckField } from "@/components/field";
import { ActionBar } from "@/components/action-bar";
import { formatDay } from "@/app/operate/roster/presentation";
import { todayInClubZone } from "@/lib/club-time";

import type { OnboardingAgreementType } from "@/lib/services/onboarding-agreements";
import { isPlaceholderVersion, parseAgreementBody } from "@/lib/services/onboarding-agreement-body";
import { photoReleasePrefill } from "@/lib/services/player-questionnaire";
import type { QuestionnaireView } from "@/lib/services/player-questionnaire";

import { agreeDocument } from "./actions";
import { AgreementBlocks } from "./agreement-text";
import { PdfDocumentView } from "./pdf-document-view";
import { PhotoReleaseForm } from "./photo-release-form";
import {
  AGREE_AND_CONTINUE,
  CODE_OF_CONDUCT_AGREE_LABEL,
  CODE_OF_CONDUCT_HEADING,
  CODE_OF_CONDUCT_LEAD,
  DOCUMENT_PRIVACY_NOTE,
  DOCUMENT_TEXT_HEADING,
  DOWNLOAD_DOCUMENT,
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
      token={token}
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

        {agreed ? (
          // LAN-362. The strip is navigation now, so a player can open a
          // document they have already agreed to — and what they get is the
          // wording they agreed to, with the agreement recorded above it. No
          // tick and no button: consent already given is never asked for twice.
          <Box
            sx={{
              border: "1px solid rgba(0,0,0,0.23)",
              borderRadius: 1,
              p: 2,
              maxHeight: 340,
              overflow: "auto",
              bgcolor: "background.paper",
            }}
            data-testid="agreed-document"
          >
            <AgreementBlocks blocks={sections.flatMap((section) => section.blocks)} />
          </Box>
        ) : isCodeOfConduct ? (
          <>
            {/* LAN-363: the document itself, where the version carries one, and
                the text of it underneath as the accessible version — never one
                instead of the other. */}
            {version.pdfPath ? (
              <>
                <PdfDocumentView path={version.pdfPath} testId="code-of-conduct-pdf" />
                <Box sx={{ mt: 1 }}>
                  <Button
                    href={version.pdfPath}
                    download
                    size="small"
                    data-testid="download-document"
                  >
                    {DOWNLOAD_DOCUMENT}
                  </Button>
                </Box>
                <Typography sx={{ fontWeight: 700, fontSize: 14, mt: 2, mb: 0.5 }}>
                  {DOCUMENT_TEXT_HEADING}
                </Typography>
              </>
            ) : null}
            <Box
              sx={{
                border: "1px solid rgba(0,0,0,0.23)",
                borderRadius: 1,
                p: 2,
                maxHeight: 340,
                overflow: "auto",
                bgcolor: "background.paper",
              }}
              data-testid="code-of-conduct-text"
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
            initialValues={photoReleasePrefill(view.person, view.lastPhotoReleaseForm)}
            eventLine={photoReleaseEventLine(view.seasonLabel)}
            dateLine={formatDay(todayInClubZone())}
          />
        )}
      </Surface>
    </Shell>
  );
}
