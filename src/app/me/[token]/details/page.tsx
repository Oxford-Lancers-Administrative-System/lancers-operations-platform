import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Link from "@mui/material/Link";
import { PublicShell } from "@/components/public-shell";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Surface } from "@/components/surface";
import { Fact, FactGrid } from "@/components/fact";
import { StepTrail } from "@/components/step-trail";
import { ActionBar } from "@/components/action-bar";
import { formatDay } from "@/app/operate/roster/presentation";
import Typography from "@mui/material/Typography";
import { Notice } from "@/components/notice";

import { withTransaction } from "@/lib/db";
import {
  allowPlayerHomeRequest,
  clientKeyFrom,
  logThrottledPlayerHomeRequest,
  withUniformTerminalTiming,
} from "@/lib/rsvp/public-surface";
import { resolvePersonTokenIn } from "@/lib/services/player-answer-tokens";
import {
  readQuestionnaireViewIn,
  STEP_ORDER,
  type QuestionnaireStep,
  type QuestionnaireView,
} from "@/lib/services/player-questionnaire";
import type { OnboardingAgreementType } from "@/lib/services/onboarding-agreements";

import { agreeDocument, submitTrustStep } from "./actions";
import { CheckField } from "@/components/field";
import { DetailsForm } from "./details-form";
import type { DetailsFormValues } from "./validation";
import {
  AGREE_AND_CONTINUE,
  ALREADY_COMPLETE_CHANGE_NOTE,
  ALREADY_COMPLETE_HEADING,
  ALREADY_COMPLETE_REST_NOTE,
  BUCS_CLAIM_LABEL,
  BUCS_CLAIM_SUBNOTE,
  BUCS_CONTINUE_ANYWAY_NOTE,
  BUCS_HAVE_YOU_DONE_IT,
  BUCS_HEADING,
  BUCS_LEAD,
  BUCS_OWED_NOTE,
  BUCS_STATUS_CONFIRMED_BY,
  BUCS_STATUS_CONFIRMED_BY_LABEL,
  BUCS_STATUS_INSTRUCTIONS,
  BUCS_STATUS_INSTRUCTIONS_LABEL,
  BUCS_STEPS,
  BUSY_MESSAGE,
  CLOSE,
  CODE_OF_CONDUCT_AGREE_LABEL,
  CODE_OF_CONDUCT_HEADING,
  CODE_OF_CONDUCT_LEAD,
  CONSENT_HEADING,
  CONTINUE,
  DETAILS_HEADING,
  DETAILS_LEAD_RETURNING,
  DETAILS_LEAD_STEP,
  DETAILS_SECONDARY,
  DOCUMENT_PRIVACY_NOTE,
  DONE_HEADING,
  DONE_STATUS_LABEL,
  FINISH,
  HUDL_ARE_YOU_IN,
  HUDL_CLAIM_LABEL,
  HUDL_HEADING,
  HUDL_LEAD,
  HUDL_NO_INVITATION_LABEL,
  HUDL_OWED_NOTE,
  HUDL_STEPS,
  HUDL_TWO_PARTS_NOTE,
  IF_SOMETHING_WRONG_BODY,
  IF_SOMETHING_WRONG_HEADING,
  MUST_AGREE_ERROR,
  OUTSTANDING_HEADING,
  OUTSTANDING_SAME_LINK_NOTE,
  PHOTO_RELEASE_AGREE_LABEL,
  PHOTO_RELEASE_HEADING,
  PHOTO_RELEASE_LEAD,
  PLACEHOLDER_LABEL,
  PRIVACY_NOTE,
  R3G_REASSURANCE,
  sourceLine,
  stepLabel,
  WHAT_CLUB_HAS_BODY,
  WHAT_CLUB_HAS_HEADING,
} from "./presentation";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

interface Resolved {
  personId: string | null;
  seasonId: string | null;
  view: QuestionnaireView | null;
}

const STEP_PARAM_VALUES: readonly string[] = [...STEP_ORDER, "done"];

export default async function PlayerDetailsPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const query = await searchParams;
  const requestedStep = first(query.step);
  const agreeError = first(query.agreeError) !== null;
  const busy = first(query.error) === "busy";

  const resolved = await withUniformTerminalTiming<Resolved>(
    async () => {
      const requestHeaders = await headers();
      const decision = allowPlayerHomeRequest(clientKeyFrom(requestHeaders), token);
      if (!decision.allowed) {
        logThrottledPlayerHomeRequest(decision.reason!);
        return { personId: null, seasonId: null, view: null };
      }

      return withTransaction(async (tx) => {
        const resolution = await resolvePersonTokenIn(tx, token);
        if (resolution.state !== "valid" || !resolution.resolved) {
          return { personId: null, seasonId: null, view: null };
        }
        const view = await readQuestionnaireViewIn(
          tx,
          resolution.resolved.personId,
          resolution.resolved.seasonId,
        );
        return {
          personId: resolution.resolved.personId,
          seasonId: resolution.resolved.seasonId,
          view,
        };
      });
    },
    (outcome) => outcome.personId === null || outcome.view === null,
  );

  if (resolved.personId === null || resolved.view === null) {
    notFound();
  }

  const view = resolved.view;

  /**
   * Three landings, decided in this order: an explicit `?step=` always wins
   * (it is how the finishing page's own "each one a link back to its step"
   * works); absent that, nothing left at all is the uniform "already
   * complete" page (`W4-08`) regardless of how the sequence got there;
   * absent that, `view.nextStep` resumes the sequence at the first step
   * genuinely still outstanding (`view.nothingOutstanding` and
   * `nextStep === "done"` are the same condition by construction, so this
   * branch never actually reaches `"done"`).
   */
  type PageKind = "already-complete" | "done" | QuestionnaireStep;
  let page: PageKind;
  if (requestedStep && STEP_PARAM_VALUES.includes(requestedStep)) {
    page = requestedStep as PageKind;
  } else if (view.nothingOutstanding) {
    page = "already-complete";
  } else {
    page = view.nextStep;
  }

  return (
    <PublicShell layout="stack">
      <Stack spacing={3}>
        {busy ? <Notice severity="warning">{BUSY_MESSAGE}</Notice> : null}

        {page === "already-complete" ? (
          <AlreadyCompletePage />
        ) : page === "done" ? (
          <DonePage view={view} token={token} />
        ) : page === "details" ? (
          <DetailsStepPage view={view} token={token} />
        ) : page === "code_of_conduct" || page === "photo_release" ? (
          <DocumentStepPage
            view={view}
            token={token}
            agreementType={page}
            agreeError={agreeError}
          />
        ) : page === "bucs_play" ? (
          <BucsStepPage view={view} token={token} />
        ) : (
          <HudlStepPage view={view} token={token} />
        )}
      </Stack>
    </PublicShell>
  );
}

// ---------------------------------------------------------------------------
// The checklist strip — the map of the sequence
// ---------------------------------------------------------------------------

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
    let value: string;
    if (step === "details") {
      value = view.detailsComplete ? "Saved" : isCurrent ? "In progress" : "Still needed";
    } else if (step === "code_of_conduct") {
      value = view.itemStatus.code_of_conduct === "complete" ? "Agreed" : "Outstanding";
    } else if (step === "photo_release") {
      value = view.itemStatus.photo_release === "complete" ? "Agreed" : "Outstanding";
    } else if (step === "bucs_play") {
      value = view.itemStatus.bucs_play === "claimed" ? "Claimed" : "Outstanding";
    } else {
      value = view.itemStatus.hudl_access === "claimed" ? "Claimed" : "Outstanding";
    }
    const status =
      step === "details"
        ? view.detailsComplete
          ? "complete"
          : "pending"
        : (view.itemStatus[
            step === "code_of_conduct" || step === "photo_release" || step === "bucs_play"
              ? step
              : "hudl_access"
          ] ?? "pending");
    steps.push({ label: stepLabel(step), status, statusLabel: value });
  }

  return <StepTrail steps={steps} currentIndex={STEP_ORDER.indexOf(currentStep)} />;
}

/**
 * F3 (LAN-230): the two-column status box `W4-07-proposed` (Done) and
 * `W4-05-proposed` (BUCS Play) each show above their steps — one `dl` grid
 * shared by both rather than two copies of the same layout. `positive`
 * colours a row's value the same way this route already colours an `Alert`
 * (`success.main`/`warning.main`), matching the mockups' green/amber without
 * a new colour convention.
 */
function QuestionnaireStatus({ rows }: { rows: Array<[string, string, boolean?]> }) {
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

function Shell({
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

// ---------------------------------------------------------------------------
// Step 1 — the details
// ---------------------------------------------------------------------------

function currentContact(view: QuestionnaireView, kind: "phone" | "email"): string {
  const contact = view.person.contacts.find(
    (c) => c.kind === kind && c.validUntil === null && (kind === "phone" || c.scope === "personal"),
  );
  return contact?.rawValue ?? "";
}

/**
 * F4 (LAN-230): the source line for one of the seven disputable fields, read
 * from who actually supplied it (`view.fieldSuppliedBy`) rather than a
 * hard-coded "you" or "the club" per field name. `null` when nobody
 * attributable did — the same "nothing to say" case the field already
 * rendered silently.
 */
function sourceOf(
  view: QuestionnaireView,
  field: keyof QuestionnaireView["fieldSuppliedBy"],
): string | null {
  const who = view.fieldSuppliedBy[field];
  return who ? sourceLine(who, null) : null;
}

/**
 * B-009 (LAN-216, correction round 2): the field-level rendering — errors
 * under each field, values surviving a failed submit, focus on the first
 * invalid control — lives in `./details-form.tsx`, a client component, because
 * only a client component can hold `saveDetails`'s returned state without a
 * navigation. Everything computed here is plain data the server already has:
 * the values a fresh page load starts from, and the source/dispute badges
 * that come from `view` rather than from anything the player just typed.
 */
function DetailsStepPage({ view, token }: { view: QuestionnaireView; token: string }) {
  const p = view.person;
  const ec = view.emergencyContact;
  const isReturning = p.givenNameSource !== null || p.collegeSource !== null;

  const initialValues: DetailsFormValues = {
    given_name: p.givenName,
    family_name: p.familyName ?? "",
    mobile: currentContact(view, "phone"),
    personal_email: currentContact(view, "email"),
    college: p.college ?? "",
    matriculation_year: p.matriculationYear?.toString() ?? "",
    expected_graduation_year: p.expectedGraduationYear?.toString() ?? "",
    degree_field: p.degreeField ?? "",
    date_of_birth: p.dateOfBirth ?? "",
    ec_given_name: ec?.givenName ?? "",
    ec_family_name: ec?.familyName ?? "",
    ec_relationship: ec?.relationship ?? "",
    ec_phone: ec?.phone ?? "",
    ec_email: ec?.email ?? "",
  };

  return (
    <Shell
      view={view}
      currentStep="details"
      heading={DETAILS_HEADING}
      lead={isReturning ? DETAILS_LEAD_RETURNING : DETAILS_LEAD_STEP}
    >
      <DetailsForm
        token={token}
        needsConsentStep={view.needsConsentStep}
        isReturning={isReturning}
        initialValues={initialValues}
        meta={{
          given_name: {
            source: sourceOf(view, "given_name"),
            disputed: view.openDisputedFields.has("given_name"),
          },
          family_name: {
            source: sourceOf(view, "family_name"),
            disputed: view.openDisputedFields.has("family_name"),
          },
          college: {
            source: sourceOf(view, "college"),
            disputed: view.openDisputedFields.has("college"),
          },
          matriculation_year: {
            source: sourceOf(view, "matriculation_year"),
            disputed: view.openDisputedFields.has("matriculation_year"),
          },
          expected_graduation_year: {
            source: sourceOf(view, "expected_graduation_year"),
            disputed: view.openDisputedFields.has("expected_graduation_year"),
          },
          degree_field: {
            source: sourceOf(view, "degree_field"),
            disputed: view.openDisputedFields.has("degree_field"),
          },
          date_of_birth: {
            source: sourceOf(view, "date_of_birth"),
            disputed: view.openDisputedFields.has("date_of_birth"),
          },
        }}
      />
      <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 2 }}>
        {DETAILS_SECONDARY}
      </Typography>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Steps 2 and 3 — the two documents
// ---------------------------------------------------------------------------

function DocumentStepPage({
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
  const agreement = view.agreements[agreementType];
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

// ---------------------------------------------------------------------------
// Step 4 — BUCS Play
// ---------------------------------------------------------------------------

function BucsStepPage({ view, token }: { view: QuestionnaireView; token: string }) {
  const photoReleaseAgreed = view.itemStatus.photo_release === "complete";
  const bucsClaimed = view.itemStatus.bucs_play === "claimed";
  return (
    <BucsHudlShell
      view={view}
      step="bucs_play"
      token={token}
      heading={BUCS_HEADING}
      lead={BUCS_LEAD}
      statusRows={[
        [
          stepLabel("photo_release"),
          photoReleaseAgreed ? "Agreed" : "Outstanding",
          photoReleaseAgreed,
        ],
        [stepLabel("bucs_play"), bucsClaimed ? "Claimed" : "Outstanding", bucsClaimed],
        [BUCS_STATUS_CONFIRMED_BY_LABEL, BUCS_STATUS_CONFIRMED_BY],
        [BUCS_STATUS_INSTRUCTIONS_LABEL, BUCS_STATUS_INSTRUCTIONS, false],
      ]}
    >
      <ol style={{ margin: 0, paddingLeft: 22 }}>
        {BUCS_STEPS.map((line) => (
          <li key={line} style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>
            {line}
          </li>
        ))}
      </ol>
      <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 1 }}>
        {BUCS_OWED_NOTE}
      </Typography>
      <Typography component="h2" sx={{ fontSize: 16, fontWeight: 700, mt: 3 }}>
        {BUCS_HAVE_YOU_DONE_IT}
      </Typography>
      <CheckField name="claim" label={BUCS_CLAIM_LABEL} />
      <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.5 }}>
        {BUCS_CLAIM_SUBNOTE}
      </Typography>
      <Box sx={{ mt: 2 }}>
        <Button type="submit" variant="contained" sx={{ minHeight: 48 }}>
          {CONTINUE}
        </Button>
      </Box>
      <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 2, textAlign: "center" }}>
        {BUCS_CONTINUE_ANYWAY_NOTE}
      </Typography>
    </BucsHudlShell>
  );
}

// ---------------------------------------------------------------------------
// Step 5 — Hudl
// ---------------------------------------------------------------------------

function HudlStepPage({ view, token }: { view: QuestionnaireView; token: string }) {
  return (
    <BucsHudlShell
      view={view}
      step="hudl"
      token={token}
      heading={HUDL_HEADING}
      lead={HUDL_LEAD}
      code="hudl_access"
    >
      <Notice severity="info">{HUDL_TWO_PARTS_NOTE}</Notice>
      <ol style={{ margin: 0, paddingLeft: 22 }}>
        {HUDL_STEPS.map((line) => (
          <li key={line} style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>
            {line}
          </li>
        ))}
      </ol>
      <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 1 }}>
        {HUDL_OWED_NOTE}
      </Typography>
      <Typography component="h2" sx={{ fontSize: 16, fontWeight: 700, mt: 3 }}>
        {HUDL_ARE_YOU_IN}
      </Typography>
      <CheckField name="claim" label={HUDL_CLAIM_LABEL} />
      <CheckField name="no_invitation" label={HUDL_NO_INVITATION_LABEL} />
      <Box sx={{ mt: 2 }}>
        <Button type="submit" variant="contained" sx={{ minHeight: 48 }}>
          {FINISH}
        </Button>
      </Box>
    </BucsHudlShell>
  );
}

function BucsHudlShell({
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

// ---------------------------------------------------------------------------
// Done — outstanding by section, each a link back to its step
// ---------------------------------------------------------------------------

/** F3 (LAN-230): "5 September 2026" — the person/date line's own format. */
function formatLongDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "Europe/London" }).format(
    date,
  );
}

function DonePage({ view, token }: { view: QuestionnaireView; token: string }) {
  const consentGiven = !view.needsConsentStep;
  const codeOfConductAgreed = view.itemStatus.code_of_conduct === "complete";
  const photoReleaseAgreed = view.itemStatus.photo_release === "complete";
  const bucsClaimed = view.itemStatus.bucs_play === "claimed";
  const hudlClaimed = view.itemStatus.hudl_access === "claimed";

  return (
    <>
      <Surface>
        <Typography variant="overline" color="text.secondary">
          {DONE_STATUS_LABEL(view.seasonLabel)}
        </Typography>
        <PageHeader title={DONE_HEADING} />
        <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 1 }}>
          {view.person.displayName}
          {view.lastAnsweredAt ? ` · ${formatLongDate(view.lastAnsweredAt)}` : null}
        </Typography>
        <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 1.5 }}>
          {PRIVACY_NOTE}
        </Typography>
      </Surface>
      <QuestionnaireStatus
        rows={[
          [CONSENT_HEADING, consentGiven ? "Given" : "Outstanding", consentGiven],
          [
            stepLabel("details"),
            view.detailsComplete ? "Saved" : "Still needed",
            view.detailsComplete,
          ],
          [
            stepLabel("code_of_conduct"),
            codeOfConductAgreed ? "Agreed" : "Outstanding",
            codeOfConductAgreed,
          ],
          [
            stepLabel("photo_release"),
            photoReleaseAgreed ? "Agreed" : "Outstanding",
            photoReleaseAgreed,
          ],
          [stepLabel("bucs_play"), bucsClaimed ? "Claimed" : "Outstanding", bucsClaimed],
          [stepLabel("hudl"), hudlClaimed ? "Claimed" : "Outstanding", hudlClaimed],
        ]}
      />
      {view.outstandingSections.length > 0 ? (
        <Section title={OUTSTANDING_HEADING}>
          {view.outstandingSections.map((group) => (
            <Box key={group.section} sx={{ mb: 2 }}>
              <Typography
                sx={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "text.secondary",
                  mb: 0.5,
                }}
              >
                {group.section}
              </Typography>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {group.items.map((item) => (
                  <li key={item.label} style={{ fontSize: 14, marginBottom: 4 }}>
                    <Link href={`/me/${encodeURIComponent(token)}/details?step=${item.step}`}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </Box>
          ))}
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            {OUTSTANDING_SAME_LINK_NOTE}
          </Typography>
        </Section>
      ) : null}
      <Section title={WHAT_CLUB_HAS_HEADING}>
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>{WHAT_CLUB_HAS_BODY}</Typography>
      </Section>
      <Section title={IF_SOMETHING_WRONG_HEADING}>
        <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
          {IF_SOMETHING_WRONG_BODY}
        </Typography>
      </Section>
      <Surface>
        <Button component="span" variant="contained" fullWidth sx={{ minHeight: 48 }}>
          {CLOSE}
        </Button>
      </Surface>
      <Typography sx={{ fontSize: 13, color: "text.secondary", textAlign: "center" }}>
        {R3G_REASSURANCE}
      </Typography>
    </>
  );
}

// ---------------------------------------------------------------------------
// Already complete — nothing outstanding, no sequence
// ---------------------------------------------------------------------------

function AlreadyCompletePage() {
  return (
    <>
      <Surface>
        <PageHeader title={ALREADY_COMPLETE_HEADING} />
        <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 1.5 }}>
          {PRIVACY_NOTE}
        </Typography>
      </Surface>
      <Surface>
        <Typography sx={{ fontSize: 14, mb: 2 }}>{ALREADY_COMPLETE_REST_NOTE}</Typography>
        <Typography sx={{ fontSize: 14 }}>{ALREADY_COMPLETE_CHANGE_NOTE}</Typography>
      </Surface>
    </>
  );
}
