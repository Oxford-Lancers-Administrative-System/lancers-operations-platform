/**
 * The chrome every questionnaire step shares: the "Where you are" navigator,
 * the two-column status box, and the two page shells that wrap a step's own
 * content in them. Split from `page.tsx` (LAN-300).
 *
 * Decision history: docs/ux/tickets/LAN-216-player-questionnaire.md.
 */
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Surface } from "@/components/surface";
import { Fact, FactGrid } from "@/components/fact";
import { StepTrail } from "@/components/step-trail";

import {
  STEP_ORDER,
  type QuestionnaireStep,
  type QuestionnaireView,
} from "@/lib/services/player-questionnaire";
import { RESOLVED_ITEM_STATUSES, type OnboardingItemStatus } from "@/lib/services/membership";

import { submitTrustStep } from "./actions";
import { PRIVACY_NOTE, stepLabel } from "./presentation";

/** The onboarding item codes this questionnaire's five steps map onto. */
type QuestionnaireItemCode = keyof QuestionnaireView["itemStatus"];

// The checklist strip — the map of the sequence

function ChecklistStrip({
  view,
  currentStep,
}: {
  view: QuestionnaireView;
  currentStep: QuestionnaireStep;
}) {
  const steps = [];
  for (const step of STEP_ORDER) {
    const isCurrent = step === currentStep;
    if (step === "details") {
      steps.push({
        label: stepLabel(step),
        status: view.detailsComplete ? "complete" : "pending",
        statusLabel: view.detailsComplete ? "Saved" : isCurrent ? "In progress" : "Still needed",
      });
      continue;
    }
    if (step === "done") continue; // the step union carries "done"; item codes below do not

    const code: QuestionnaireItemCode = step === "hudl" ? "hudl_access" : step;
    const status = view.itemStatus[code] ?? "pending";
    steps.push({ label: stepLabel(step), status, statusLabel: itemStepWord(code, status) });
  }

  return <StepTrail steps={steps} currentIndex={STEP_ORDER.indexOf(currentStep)} />;
}

/**
 * The one word this page says about an onboarding item's state. Sourced from
 * `status` alone, never a second test. `claimed` keeps its own word (player
 * says done, club hasn't confirmed). Player-facing only — `itemStateLabel`
 * is the administrator's version and not interchangeable.
 *
 * Decision history: docs/ux/tickets/LAN-216-player-questionnaire.md.
 */
export function itemStepWord(code: QuestionnaireItemCode, status: OnboardingItemStatus): string {
  const isDocument = code === "code_of_conduct" || code === "photo_release";
  if (status === "complete") return isDocument ? "Agreed" : "Confirmed";
  if (status === "claimed") return "Claimed";
  if (status === "waived") return "Waived";
  if (status === "not_applicable") return "Not needed";
  return "Outstanding";
}

/** Whether this page treats an item as needing nothing further — the same test the service's own `bucsDone`/`hudlDone` use. */
export function itemIsSettled(status: OnboardingItemStatus | null): boolean {
  if (status === null) return false;
  return status === "claimed" || RESOLVED_ITEM_STATUSES.includes(status);
}

/**
 * The two-column status box Done and BUCS Play both show above their own
 * steps, one grid shared rather than two copies. `positive` colours a row
 * with this route's Alert convention (`success.main`/`warning.main`).
 *
 * Decision history: docs/ux/tickets/LAN-216-player-questionnaire.md.
 */
export function QuestionnaireStatus({ rows }: { rows: Array<[string, string, boolean?]> }) {
  return (
    <Surface>
      <FactGrid>
        {rows.map(([label, value, positive]) => (
          <Fact
            key={label}
            label={label}
            value={
              <Typography
                variant="body2"
                color={
                  positive === undefined
                    ? "text.primary"
                    : positive
                      ? "success.main"
                      : "warning.main"
                }
              >
                {value}
              </Typography>
            }
          />
        ))}
      </FactGrid>
    </Surface>
  );
}

export function Shell({
  children,
  view,
  currentStep,
  heading,
  lead,
  privacyNote = PRIVACY_NOTE,
}: {
  children: React.ReactNode;
  view: QuestionnaireView;
  currentStep: QuestionnaireStep;
  heading: string;
  lead: string;
  privacyNote?: string;
}) {
  return (
    <>
      <Section title="Where you are">
        <ChecklistStrip view={view} currentStep={currentStep} />
      </Section>
      <PageHeader title={heading} subtitle={lead} />
      <Typography variant="caption" color="text.secondary">
        {privacyNote}
      </Typography>
      {children}
    </>
  );
}

export function BucsHudlShell({
  view,
  step,
  token,
  heading,
  lead,
  code,
  statusRows,
  children,
}: {
  view: QuestionnaireView;
  step: "bucs_play" | "hudl";
  token: string;
  heading: string;
  lead: string;
  code?: "hudl_access";
  /** F3 (LAN-230): the `W4-05` two-column status box — BUCS Play only. */
  statusRows?: Array<[string, string, boolean?]>;
  children: React.ReactNode;
}) {
  return (
    <>
      <Section title="Where you are">
        <ChecklistStrip view={view} currentStep={step} />
      </Section>
      <PageHeader title={heading} subtitle={lead} />
      <Typography variant="caption" color="text.secondary">
        {PRIVACY_NOTE}
      </Typography>
      {statusRows ? <QuestionnaireStatus rows={statusRows} /> : null}
      <Surface>
        <Box component="form" action={submitTrustStep}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="code" value={code ?? "bucs_play"} />
          {children}
        </Box>
      </Surface>
    </>
  );
}
