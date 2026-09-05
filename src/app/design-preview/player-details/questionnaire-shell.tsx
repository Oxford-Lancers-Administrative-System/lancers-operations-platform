import type { ReactNode } from "react";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  STEP_ORDER,
  type QuestionnaireStep,
  type QuestionnaireView,
} from "@/lib/services/player-questionnaire";
import { PageHeader } from "@/components/page-header";
import { PublicShell } from "@/components/public-shell";
import { Section } from "@/components/section";
import { StepTrail, type TrailStep } from "@/components/step-trail";
import { PRIVACY_NOTE, stepLabel } from "@/app/me/[token]/details/presentation";

/**
 * The frame both questionnaire previews share — LAN-225's player-surfaces
 * addendum. `/me/[token]/details` draws this itself, five times, as a
 * `Paper` holding a five-column `<dl>` over a second `Paper` holding an
 * `h1` built from raw `fontSize`.
 *
 * Here it is the public masthead, one `StepTrail`, and one `PageHeader`. The
 * step words, the lead lines and the privacy note are the real page's own,
 * unchanged: `Step 2 of 5 · Read it, then agree` still says exactly that,
 * because the trail showing the same fact does not make the sentence wrong,
 * and cutting it would be a copy change (player-surfaces finding P6, left as
 * a finding).
 */
function trailFor(view: QuestionnaireView): readonly TrailStep[] {
  return STEP_ORDER.map((step): TrailStep => {
    if (step === "details") {
      return {
        label: stepLabel(step),
        status: view.detailsComplete ? "complete" : "outstanding",
        statusLabel: view.detailsComplete ? "Saved" : "Still needed",
      };
    }
    if (step === "code_of_conduct" || step === "photo_release") {
      const agreed = view.itemStatus[step] === "complete";
      return {
        label: stepLabel(step),
        status: agreed ? "complete" : "outstanding",
        statusLabel: agreed ? "Agreed" : "Outstanding",
      };
    }
    const code = step === "bucs_play" ? "bucs_play" : "hudl_access";
    const claimed = view.itemStatus[code] === "claimed";
    return {
      label: stepLabel(step),
      status: claimed ? "complete" : "outstanding",
      statusLabel: claimed ? "Claimed" : "Outstanding",
    };
  });
}

export function QuestionnaireShell({
  view,
  currentStep,
  heading,
  lead,
  privacyNote = PRIVACY_NOTE,
  testId,
  children,
}: {
  view: QuestionnaireView;
  currentStep: QuestionnaireStep;
  heading: string;
  lead: string;
  privacyNote?: string;
  testId: string;
  children: ReactNode;
}) {
  const steps = trailFor(view);
  return (
    <PublicShell
      caption={view.seasonLabel ? `Joining · ${view.seasonLabel}` : "Joining"}
      width="medium"
      layout="stack"
      testId={testId}
    >
      <Stack spacing={3}>
        <Section title="Where you are" testId="step-trail">
          <StepTrail steps={steps} currentIndex={STEP_ORDER.indexOf(currentStep)} />
        </Section>
        <PageHeader title={heading} subtitle={lead} />
        <Typography variant="caption" color="text.secondary" component="p">
          {privacyNote}
        </Typography>
        {children}
      </Stack>
    </PublicShell>
  );
}
