import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormHelperText from "@mui/material/FormHelperText";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";

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

import { agreeDocument, saveDetails, submitTrustStep } from "./actions";
import { CheckboxField } from "./checkbox-field";
import {
  AGREE_AND_CONTINUE,
  ALREADY_COMPLETE_CHANGE_NOTE,
  ALREADY_COMPLETE_HEADING,
  ALREADY_COMPLETE_REST_NOTE,
  BANNER,
  BUCS_CLAIM_LABEL,
  BUCS_HAVE_YOU_DONE_IT,
  BUCS_HEADING,
  BUCS_LEAD,
  BUCS_OWED_NOTE,
  BUCS_STEPS,
  BUSY_MESSAGE,
  CODE_OF_CONDUCT_AGREE_LABEL,
  CODE_OF_CONDUCT_HEADING,
  CODE_OF_CONDUCT_LEAD,
  CONSENT_ALREADY_GRANTED,
  CONSENT_HEADING,
  CONSENT_LABEL,
  CONTINUE,
  DETAILS_HEADING,
  DETAILS_LEAD_RETURNING,
  DETAILS_LEAD_STEP,
  DETAILS_SECONDARY,
  DISPUTED_NOTICE,
  DOCUMENT_PRIVACY_NOTE,
  DONE_HEADING,
  FIELD_COLLEGE,
  FIELD_DATE_OF_BIRTH,
  FIELD_DEGREE_FIELD,
  FIELD_EC_EMAIL,
  FIELD_EC_FAMILY_NAME,
  FIELD_EC_GIVEN_NAME,
  FIELD_EC_PHONE,
  FIELD_EC_RELATIONSHIP,
  FIELD_EXPECTED_GRADUATION,
  FIELD_FAMILY_NAME,
  FIELD_GIVEN_NAME,
  FIELD_MATRICULATION_YEAR,
  FIELD_MOBILE,
  FIELD_PERSONAL_EMAIL,
  FINISH,
  HUDL_ARE_YOU_IN,
  HUDL_CLAIM_LABEL,
  HUDL_HEADING,
  HUDL_LEAD,
  HUDL_NO_INVITATION_LABEL,
  HUDL_OWED_NOTE,
  HUDL_STEPS,
  HUDL_TWO_PARTS_NOTE,
  MUST_AGREE_ERROR,
  OUTSTANDING_HEADING,
  OUTSTANDING_SAME_LINK_NOTE,
  PHOTO_RELEASE_AGREE_LABEL,
  PHOTO_RELEASE_HEADING,
  PHOTO_RELEASE_LEAD,
  PLACEHOLDER_LABEL,
  PRIVACY_NOTE,
  REQUIRED_NOTE,
  SAVE_AND_CONTINUE,
  SAVE_CHANGES,
  SECTION_EMERGENCY_CONTACT,
  SECTION_KEPT_PRIVATE,
  SECTION_WHERE_YOU_STUDY,
  SECTION_WHO_YOU_ARE,
  sourceLine,
  stepLabel,
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
  const fieldError = first(query.fieldError) !== null;
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

        {busy ? (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {BUSY_MESSAGE}
          </Alert>
        ) : null}

        {page === "already-complete" ? (
          <AlreadyCompletePage />
        ) : page === "done" ? (
          <DonePage view={view} token={token} />
        ) : page === "details" ? (
          <DetailsStepPage view={view} token={token} fieldError={fieldError} />
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
      </Box>
    </Box>
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
  const rows: Array<[string, string]> = [];
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
    rows.push([stepLabel(step), value]);
  }

  return (
    <Box
      component="dl"
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(5, 1fr)" },
        gap: 1,
        m: 0,
      }}
    >
      {rows.map(([label, value]) => (
        <Box key={label}>
          <Typography
            component="dt"
            sx={{ fontSize: 11, fontWeight: 700, color: "text.secondary" }}
          >
            {label}
          </Typography>
          <Typography component="dd" sx={{ m: 0, fontSize: 13 }}>
            {value}
          </Typography>
        </Box>
      ))}
    </Box>
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
      <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 2, mb: 3 }}>
        <ChecklistStrip view={view} currentStep={currentStep} />
      </Paper>
      <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 2, mb: 3 }}>
        <Typography component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700 }}>
          {heading}
        </Typography>
        <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 1 }}>{lead}</Typography>
        <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 1.5 }}>
          {privacyNote}
        </Typography>
      </Paper>
      {children}
    </>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — the details
// ---------------------------------------------------------------------------

function FieldWithSource({
  name,
  label,
  defaultValue,
  required,
  help,
  source,
  type = "text",
  disputed = false,
}: {
  name: string;
  label: string;
  defaultValue: string;
  required?: boolean;
  help?: string;
  source?: string | null;
  type?: string;
  disputed?: boolean;
}) {
  return (
    <Box>
      <TextField
        name={name}
        label={label}
        defaultValue={defaultValue}
        required={required}
        fullWidth
        type={type}
        slotProps={type === "date" ? { inputLabel: { shrink: true } } : undefined}
      />
      {help ? <FormHelperText>{help}</FormHelperText> : null}
      {source ? <FormHelperText>{source}</FormHelperText> : null}
      {disputed ? (
        <Alert severity="info" sx={{ mt: 0.75 }}>
          {DISPUTED_NOTICE}
        </Alert>
      ) : null}
    </Box>
  );
}

function currentContact(view: QuestionnaireView, kind: "phone" | "email"): string {
  const contact = view.person.contacts.find(
    (c) => c.kind === kind && c.validUntil === null && (kind === "phone" || c.scope === "personal"),
  );
  return contact?.rawValue ?? "";
}

function DetailsStepPage({
  view,
  token,
  fieldError,
}: {
  view: QuestionnaireView;
  token: string;
  fieldError: boolean;
}) {
  const p = view.person;
  const ec = view.emergencyContact;
  const isReturning = p.givenNameSource !== null || p.collegeSource !== null;

  return (
    <Shell
      view={view}
      currentStep="details"
      heading={DETAILS_HEADING}
      lead={isReturning ? DETAILS_LEAD_RETURNING : DETAILS_LEAD_STEP}
    >
      <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 2, mb: 3 }}>
        {fieldError ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            One of the values entered was not in a shape the club can save. Check the highlighted
            fields and try again.
          </Alert>
        ) : null}
        <Box component="form" action={saveDetails}>
          <input type="hidden" name="token" value={token} />
          <Stack spacing={2.5}>
            {view.needsConsentStep ? (
              <Box>
                <Typography component="h2" sx={{ fontSize: 16, fontWeight: 700, mb: 1 }}>
                  {CONSENT_HEADING}
                </Typography>
                <CheckboxField name="consent" label={CONSENT_LABEL} />
              </Box>
            ) : (
              <Alert severity="success">{CONSENT_ALREADY_GRANTED}</Alert>
            )}

            <FormHelperText sx={{ fontSize: 13 }}>{REQUIRED_NOTE}</FormHelperText>

            <Typography component="h2" sx={{ fontSize: 16, fontWeight: 700 }}>
              {SECTION_WHO_YOU_ARE}
            </Typography>
            <FieldWithSource
              name="given_name"
              label={FIELD_GIVEN_NAME}
              defaultValue={p.givenName}
              required
              source={p.givenNameSource ? sourceLine("you", null) : null}
              disputed={view.openDisputedFields.has("given_name")}
            />
            <FieldWithSource
              name="family_name"
              label={FIELD_FAMILY_NAME}
              defaultValue={p.familyName ?? ""}
              required
              source={p.familyNameSource ? sourceLine("you", null) : null}
              disputed={view.openDisputedFields.has("family_name")}
            />
            <FieldWithSource
              name="mobile"
              label={FIELD_MOBILE}
              defaultValue={currentContact(view, "phone")}
              required
            />
            <FieldWithSource
              name="personal_email"
              label={FIELD_PERSONAL_EMAIL}
              defaultValue={currentContact(view, "email")}
              required
            />

            <Typography component="h2" sx={{ fontSize: 16, fontWeight: 700 }}>
              {SECTION_WHERE_YOU_STUDY}
            </Typography>
            <FieldWithSource
              name="college"
              label={FIELD_COLLEGE}
              defaultValue={p.college ?? ""}
              required
              source={p.collegeSource ? sourceLine("club", null) : null}
              disputed={view.openDisputedFields.has("college")}
            />
            <FieldWithSource
              name="matriculation_year"
              label={FIELD_MATRICULATION_YEAR}
              defaultValue={p.matriculationYear?.toString() ?? ""}
              required
              source={p.matriculationYearSource ? sourceLine("club", null) : null}
              disputed={view.openDisputedFields.has("matriculation_year")}
            />
            <FieldWithSource
              name="expected_graduation_year"
              label={FIELD_EXPECTED_GRADUATION}
              defaultValue={p.expectedGraduationYear?.toString() ?? ""}
              required
              source={p.expectedGraduationYearSource ? sourceLine("you", null) : null}
              disputed={view.openDisputedFields.has("expected_graduation_year")}
            />
            <FieldWithSource
              name="degree_field"
              label={FIELD_DEGREE_FIELD}
              defaultValue={p.degreeField ?? ""}
              required
              source={p.degreeFieldSource ? sourceLine("you", null) : null}
              disputed={view.openDisputedFields.has("degree_field")}
            />

            <Typography component="h2" sx={{ fontSize: 16, fontWeight: 700 }}>
              {SECTION_KEPT_PRIVATE}
            </Typography>
            <FieldWithSource
              name="date_of_birth"
              label={FIELD_DATE_OF_BIRTH}
              defaultValue={p.dateOfBirth ?? ""}
              required
              type="date"
              source={p.dateOfBirthSource ? sourceLine("you", null) : null}
              disputed={view.openDisputedFields.has("date_of_birth")}
            />

            <Typography component="h2" sx={{ fontSize: 16, fontWeight: 700 }}>
              {SECTION_EMERGENCY_CONTACT}
            </Typography>
            <FieldWithSource
              name="ec_given_name"
              label={FIELD_EC_GIVEN_NAME}
              defaultValue={ec?.givenName ?? ""}
              required
            />
            <FieldWithSource
              name="ec_family_name"
              label={FIELD_EC_FAMILY_NAME}
              defaultValue={ec?.familyName ?? ""}
              required
            />
            <FieldWithSource
              name="ec_relationship"
              label={FIELD_EC_RELATIONSHIP}
              defaultValue={ec?.relationship ?? ""}
            />
            <FieldWithSource
              name="ec_phone"
              label={FIELD_EC_PHONE}
              defaultValue={ec?.phone ?? ""}
              required
            />
            <FieldWithSource
              name="ec_email"
              label={FIELD_EC_EMAIL}
              defaultValue={ec?.email ?? ""}
              required
            />

            <Button type="submit" variant="contained" sx={{ minHeight: 48 }}>
              {isReturning ? SAVE_CHANGES : SAVE_AND_CONTINUE}
            </Button>
          </Stack>
        </Box>
        <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 2 }}>
          {DETAILS_SECONDARY}
        </Typography>
      </Paper>
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
      <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 2, mb: 3 }}>
        {agreeError ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {MUST_AGREE_ERROR}
          </Alert>
        ) : null}
        {agreement ? (
          <Alert severity="success" sx={{ mb: 2 }}>
            Already agreed — version {agreement.agreementVersionId.slice(0, 8)}, on{" "}
            {agreement.agreedAt.toISOString().slice(0, 10)}.
          </Alert>
        ) : null}
        <Typography sx={{ fontSize: 12, fontWeight: 700, color: "warning.main", mb: 1 }}>
          {PLACEHOLDER_LABEL}
        </Typography>
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
          <CheckboxField name="agree" label={agreeLabel} />
          <Box sx={{ mt: 2 }}>
            <Button type="submit" variant="contained" sx={{ minHeight: 48 }}>
              {AGREE_AND_CONTINUE}
            </Button>
          </Box>
        </Box>
      </Paper>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — BUCS Play
// ---------------------------------------------------------------------------

function BucsStepPage({ view, token }: { view: QuestionnaireView; token: string }) {
  return (
    <BucsHudlShell
      view={view}
      step="bucs_play"
      token={token}
      heading={BUCS_HEADING}
      lead={BUCS_LEAD}
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
      <CheckboxField name="claim" label={BUCS_CLAIM_LABEL} />
      <Box sx={{ mt: 2 }}>
        <Button type="submit" variant="contained" sx={{ minHeight: 48 }}>
          {CONTINUE}
        </Button>
      </Box>
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
      <Alert severity="info" sx={{ mb: 2 }}>
        {HUDL_TWO_PARTS_NOTE}
      </Alert>
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
      <CheckboxField name="claim" label={HUDL_CLAIM_LABEL} />
      <CheckboxField name="no_invitation" label={HUDL_NO_INVITATION_LABEL} />
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
  children,
}: {
  view: QuestionnaireView;
  step: "bucs_play" | "hudl";
  token: string;
  heading: string;
  lead: string;
  code?: "hudl_access";
  children: React.ReactNode;
}) {
  return (
    <>
      <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 2, mb: 3 }}>
        <ChecklistStrip view={view} currentStep={step} />
      </Paper>
      <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 2, mb: 3 }}>
        <Typography component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700 }}>
          {heading}
        </Typography>
        <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 1, mb: 2 }}>{lead}</Typography>
        <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 2 }}>
          {PRIVACY_NOTE}
        </Typography>
        <Box component="form" action={submitTrustStep}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="code" value={code ?? "bucs_play"} />
          {children}
        </Box>
      </Paper>
    </>
  );
}

// ---------------------------------------------------------------------------
// Done — outstanding by section, each a link back to its step
// ---------------------------------------------------------------------------

function DonePage({ view, token }: { view: QuestionnaireView; token: string }) {
  return (
    <>
      <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 2, mb: 3 }}>
        <Typography component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700 }}>
          {DONE_HEADING}
        </Typography>
        <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 1.5 }}>
          {PRIVACY_NOTE}
        </Typography>
      </Paper>
      <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 2, mb: 3 }}>
        <ChecklistStrip view={view} currentStep="details" />
      </Paper>
      {view.outstandingSections.length > 0 ? (
        <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 2, mb: 3 }}>
          <Typography component="h2" sx={{ fontSize: 16, fontWeight: 700, mb: 1 }}>
            {OUTSTANDING_HEADING}
          </Typography>
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
                    <a
                      href={`/me/${encodeURIComponent(token)}/details?step=${item.step}`}
                      style={{ color: "#1565c0", textDecoration: "underline" }}
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </Box>
          ))}
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            {OUTSTANDING_SAME_LINK_NOTE}
          </Typography>
        </Paper>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Already complete — nothing outstanding, no sequence
// ---------------------------------------------------------------------------

function AlreadyCompletePage() {
  return (
    <>
      <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 2, mb: 3 }}>
        <Typography component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700 }}>
          {ALREADY_COMPLETE_HEADING}
        </Typography>
        <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 1.5 }}>
          {PRIVACY_NOTE}
        </Typography>
      </Paper>
      <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 2, mb: 3 }}>
        <Typography sx={{ fontSize: 14, mb: 2 }}>{ALREADY_COMPLETE_REST_NOTE}</Typography>
        <Typography sx={{ fontSize: 14 }}>{ALREADY_COMPLETE_CHANGE_NOTE}</Typography>
      </Paper>
    </>
  );
}
