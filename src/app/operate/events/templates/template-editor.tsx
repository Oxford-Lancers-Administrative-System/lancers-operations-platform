"use client";

import { useActionState, useState } from "react";
import { Notice } from "@/components/notice";
import { Section } from "@/components/section";
import { Field, SelectField } from "@/components/field";
import { ActionBar } from "@/components/action-bar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { AudienceGroup, AudienceGroupKey } from "@/lib/services/audience-selection";
import type { RawEventQuestion } from "@/lib/services/event-questions-input";
import type { RawEventTemplate } from "@/lib/services/event-template-input";
import type { TemplateChangePlan } from "@/lib/services/event-templates";
import QuestionEditor from "../question-editor";
import { previewEventTemplateAction, saveEventTemplateAction } from "./actions";
import { EMPTY_TEMPLATE_FORM_STATE, type TemplateFormState } from "./form-state";
import {
  changeTouchesNothing,
  confirmSaveAction,
  describeDuration,
  draftsHolding,
  draftsTaking,
  draftTakes,
  TEMPLATE_AUDIENCE_HEADLINE,
  TEMPLATE_CONFIRM_BACK,
  TEMPLATE_CONFIRM_TITLE,
  TEMPLATE_DISCARD_ACTION,
  TEMPLATE_DURATION_LABEL,
  TEMPLATE_DURATION_OPTIONS,
  TEMPLATE_EVENT_HEADLINE,
  TEMPLATE_QUESTIONS_HEADLINE,
  TEMPLATE_SAVE_ACTION,
  TEMPLATE_UNTOUCHED_HEADLINE,
  templateSaved,
  untouchedApproved,
  untouchedPast,
} from "./presentation";

/**
 * W8-02 and W8-03 — one template, and what changing it will touch.
 *
 * ## Two submissions of one form
 *
 * **Save…** posts to `previewEventTemplateAction`, which writes nothing and
 * returns the blast radius. The dialog then posts the *same fields* to
 * `saveEventTemplateAction`, which recomputes that blast radius under its own
 * locks and applies it. The operator is never shown one plan and given another,
 * and the browser is never trusted to carry a plan forward — it carries the
 * form, and the server decides again.
 *
 * That is why the dialog re-renders every field as a hidden input rather than
 * posting an identifier for something the server stashed. There is no server-side
 * draft to go stale, and no session state to disagree with the form.
 *
 * ## The screen's whole job
 *
 * W8: "An operator who has never used this should be able to tell, from the
 * screen, that editing a template is safe." So the confirmation names the drafts
 * that will take the change, names the ones that will not **and why**, and states
 * what will not move at all — approved events and past events, which are never
 * touched by anything here.
 *
 * The button says what it will do. "Save and update 3 drafts" is a different
 * promise from "Save", and the operator should not have to infer which one they
 * are making.
 */

export interface TemplateEditorProps {
  eventType: string;
  eventTypeLabel: string;
  initial: RawEventTemplate;
  initialQuestions: RawEventQuestion[];
  /** The groups this type may carry — recruits on Recruitment alone (D46). */
  groups: readonly AudienceGroup[];
}

function issueFor(state: TemplateFormState, field: keyof RawEventTemplate): string | undefined {
  return state.issues.find((issue) => issue.field === field)?.message;
}

export default function TemplateEditor({
  eventType,
  eventTypeLabel,
  initial,
  initialQuestions,
  groups,
}: TemplateEditorProps) {
  const [previewState, previewAction, previewing] = useActionState(
    previewEventTemplateAction,
    EMPTY_TEMPLATE_FORM_STATE,
  );
  const [saveState, saveAction, saving] = useActionState(
    saveEventTemplateAction,
    EMPTY_TEMPLATE_FORM_STATE,
  );

  // The later of the two outcomes wins. A save that has produced anything is
  // the current answer about this template; before that, the preview is.
  const state =
    saveState.phase === "editing" && saveState.error === null ? previewState : saveState;

  // Every field is controlled from here, so a refused submission keeps what the
  // operator typed without the action having to hand it back — and so the
  // dialog can re-post exactly what the form holds.
  const text = (field: keyof RawEventTemplate): string => {
    const raw = initial[field];
    return typeof raw === "string" ? raw : "";
  };

  const [selected, setSelected] = useState<AudienceGroupKey[]>(() => [
    ...((initial.audienceGroups ?? []) as AudienceGroupKey[]),
  ]);
  const [questions, setQuestions] = useState<RawEventQuestion[]>(() => [...initialQuestions]);
  const [venue, setVenue] = useState(text("defaultVenue"));
  const [deliveryMode, setDeliveryMode] = useState(text("defaultDeliveryMode") || "unset");
  const [duration, setDuration] = useState(text("defaultDurationMinutes"));
  const [description, setDescription] = useState(text("defaultDescription"));
  const [equipment, setEquipment] = useState(text("defaultRequiredEquipment"));
  const [attendance, setAttendance] = useState(text("defaultAttendance") || "unset");

  /**
   * The plan the operator has already dismissed with **Back**.
   *
   * Compared by identity rather than by a boolean, so a *new* preview reopens the
   * dialog without anything having to reset a flag. Nothing was written, so
   * dismissing is genuinely free — there is no draft on the server to discard.
   */
  const [dismissed, setDismissed] = useState<TemplateChangePlan | null>(null);

  const confirming =
    state.phase === "confirming" && state.plan !== null && state.plan !== dismissed;
  const busy = previewing || saving;

  /**
   * C6's off-grid case: a template saved before the eight-option grid existed
   * can hold a duration that is not one of them. A `select` refuses to show a
   * value that is not one of its own options, and snapping it to the nearest
   * one would silently change what the template means, so this becomes a
   * ninth `MenuItem`, truthfully labelled, only while it is what is selected
   * — choosing any of the eight makes it disappear.
   */
  const offGridDuration =
    duration !== "" && !TEMPLATE_DURATION_OPTIONS.includes(Number(duration))
      ? Number(duration)
      : null;

  function toggleGroup(key: AudienceGroupKey) {
    setSelected((current) =>
      current.includes(key) ? current.filter((group) => group !== key) : [...current, key],
    );
  }

  /** Every field, as the dialog has to re-post it. One place, so they agree. */
  const hiddenFields = (
    <>
      <input type="hidden" name="eventType" value={eventType} />
      <input type="hidden" name="defaultVenue" value={venue} />
      <input type="hidden" name="defaultDeliveryMode" value={deliveryMode} />
      <input type="hidden" name="defaultDurationMinutes" value={duration} />
      <input type="hidden" name="defaultDescription" value={description} />
      <input type="hidden" name="defaultRequiredEquipment" value={equipment} />
      <input type="hidden" name="defaultAttendance" value={attendance} />
      {selected.map((group) => (
        <input key={group} type="hidden" name="audienceGroup" value={group} />
      ))}
      {questions.map((question, index) => (
        <Box component="span" key={index}>
          <input type="hidden" name="questionPrompt" value={question.prompt ?? ""} />
          <input type="hidden" name="questionAnswerType" value={question.answerType ?? "boolean"} />
          <input
            type="hidden"
            name="questionRequired"
            value={question.required === "required" ? "required" : "optional"}
          />
          <input type="hidden" name="questionChoices" value={question.choices ?? ""} />
        </Box>
      ))}
    </>
  );

  return (
    <Stack spacing={3} sx={{ maxWidth: 760 }} data-testid="template-editor">
      {state.error ? (
        <Notice severity="error" testId="template-error">
          {state.error}
        </Notice>
      ) : null}

      {state.phase === "saved" && state.plan !== null ? (
        <Notice severity="success" testId="template-saved">
          {templateSaved(state.plan.taking.length)}
        </Notice>
      ) : null}

      <Box component="form" action={previewAction} data-testid="template-form">
        <input type="hidden" name="eventType" value={eventType} />

        <Stack spacing={3}>
          {/* D47 — the default audience, as groups and never as people. */}
          <Section title={TEMPLATE_AUDIENCE_HEADLINE}>
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                {groups.map((group) => {
                  const on = selected.includes(group.key);
                  return (
                    <Button
                      key={group.key}
                      variant={on ? "contained" : "outlined"}
                      size="small"
                      aria-pressed={on}
                      disabled={busy}
                      onClick={() => toggleGroup(group.key)}
                      data-testid="template-audience-group"
                      data-group={group.key}
                      sx={{ minHeight: 40 }}
                    >
                      {group.label}
                    </Button>
                  );
                })}
              </Stack>
              {selected.map((group) => (
                <input key={group} type="hidden" name="audienceGroup" value={group} />
              ))}
            </Stack>
          </Section>

          <Section title={TEMPLATE_EVENT_HEADLINE}>
            <Stack spacing={3}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <SelectField
                  label="Where"
                  name="defaultDeliveryMode"
                  data-field="defaultDeliveryMode"
                  value={deliveryMode}
                  onChange={(event) => setDeliveryMode(event.target.value)}
                  error={Boolean(issueFor(state, "defaultDeliveryMode"))}
                  helperText={issueFor(state, "defaultDeliveryMode")}
                  disabled={busy}
                  slotProps={{ inputLabel: { shrink: true } }}
                  options={[
                    { value: "unset", label: "Not set" },
                    { value: "in_person", label: "In person" },
                    { value: "online", label: "Online" },
                  ]}
                />

                <Field
                  label="Venue"
                  name="defaultVenue"
                  data-field="defaultVenue"
                  value={venue}
                  onChange={(event) => setVenue(event.target.value)}
                  error={Boolean(issueFor(state, "defaultVenue"))}
                  helperText={issueFor(state, "defaultVenue")}
                  disabled={busy}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Stack>

              {/*
                D78. A duration, not a start time — "the name is always going to
                be unique ... Usual time doesn't make any sense to me" (Brian,
                2026-08-21). A type recurs; a particular Wednesday does not.

                C6. Brian: "In the template, the default times should be done
                in 30-minute increments between 30 minutes and 4 hours ... It
                shouldn't be freeform text." Eight options, each labelled by
                the same `describeDuration` the template list and the
                confirmation dialog already use — see `offGridDuration` above
                for the one existing-template case a fixed grid has to answer.
              */}
              <SelectField
                label={TEMPLATE_DURATION_LABEL}
                name="defaultDurationMinutes"
                data-field="defaultDurationMinutes"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                error={Boolean(issueFor(state, "defaultDurationMinutes"))}
                helperText={issueFor(state, "defaultDurationMinutes")}
                disabled={busy}
                slotProps={{ inputLabel: { shrink: true } }}
                options={[
                  { value: "", label: "Not set" },
                  ...(offGridDuration !== null
                    ? [{ value: String(offGridDuration), label: describeDuration(offGridDuration) }]
                    : []),
                  ...TEMPLATE_DURATION_OPTIONS.map((minutes) => ({
                    value: String(minutes),
                    label: describeDuration(minutes),
                  })),
                ]}
              />

              <Field
                label="Required equipment"
                name="defaultRequiredEquipment"
                data-field="defaultRequiredEquipment"
                value={equipment}
                onChange={(event) => setEquipment(event.target.value)}
                error={Boolean(issueFor(state, "defaultRequiredEquipment"))}
                helperText={issueFor(state, "defaultRequiredEquipment")}
                disabled={busy}
                slotProps={{ inputLabel: { shrink: true } }}
              />

              <Field
                label="Description"
                name="defaultDescription"
                data-field="defaultDescription"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                error={Boolean(issueFor(state, "defaultDescription"))}
                helperText={issueFor(state, "defaultDescription")}
                disabled={busy}
                multiline
                minRows={3}
                slotProps={{ inputLabel: { shrink: true } }}
              />

              <SelectField
                label="Attendance"
                name="defaultAttendance"
                data-field="defaultAttendance"
                value={attendance}
                onChange={(event) => setAttendance(event.target.value)}
                disabled={busy}
                slotProps={{ inputLabel: { shrink: true } }}
                options={[
                  { value: "unset", label: "Not set" },
                  { value: "mandatory", label: "Mandatory" },
                  { value: "optional", label: "Optional" },
                ]}
              />
            </Stack>
          </Section>

          {/*
            D42. The questions every event of this type arrives with. The same
            editor the event form uses, because they are the same thing — one
            marked as coming from the template when it lands on an event.
          */}
          <QuestionEditor
            questions={questions}
            onChange={setQuestions}
            eventTypeLabel={eventTypeLabel}
            issues={state.questionIssues}
            disabled={busy}
            headline={TEMPLATE_QUESTIONS_HEADLINE}
            detail=""
          />

          <ActionBar
            primary={
              <Button
                type="submit"
                variant="contained"
                disabled={busy}
                data-testid="preview-template"
                sx={{ minHeight: 44 }}
              >
                {previewing ? "Checking…" : TEMPLATE_SAVE_ACTION}
              </Button>
            }
            cancel={
              <Button
                variant="text"
                href="/operate/events/templates"
                disabled={busy}
                sx={{ minHeight: 44 }}
              >
                {TEMPLATE_DISCARD_ACTION}
              </Button>
            }
          />
        </Stack>
      </Box>

      <Dialog
        open={confirming}
        onClose={() => (busy ? undefined : setDismissed(state.plan))}
        aria-labelledby="template-confirm-title"
        maxWidth="sm"
        fullWidth
        data-testid="template-confirm"
      >
        <DialogTitle id="template-confirm-title">{TEMPLATE_CONFIRM_TITLE}</DialogTitle>
        <DialogContent dividers>
          {state.plan ? <ChangePlan plan={state.plan} eventTypeLabel={eventTypeLabel} /> : null}
        </DialogContent>
        <DialogActions>
          {/*
            Back closes the dialog and leaves the form exactly as it was. It
            posts nothing, because nothing was written to undo — the preview
            took locks, read rows and released them.
          */}
          <Button
            onClick={() => setDismissed(state.plan)}
            disabled={busy}
            data-testid="dismiss-template-confirm"
            sx={{ minHeight: 44 }}
          >
            {TEMPLATE_CONFIRM_BACK}
          </Button>
          <Box component="form" action={saveAction}>
            {hiddenFields}
            <Button
              type="submit"
              variant="contained"
              disabled={busy}
              data-testid="confirm-save-template"
              sx={{ minHeight: 44 }}
            >
              {saving ? "Saving…" : confirmSaveAction(state.plan?.taking.length ?? 0)}
            </Button>
          </Box>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

/** W8-03's three panels: what moves, what does not, and what never does. */
function ChangePlan({
  plan,
  eventTypeLabel,
}: {
  plan: TemplateChangePlan;
  eventTypeLabel: string;
}) {
  const approved = untouchedApproved(plan.untouched.approved, eventTypeLabel);
  const past = untouchedPast(plan.untouched.past, eventTypeLabel);

  return (
    <Stack spacing={2}>
      {plan.fieldChanges.length > 0 || plan.questionChanges.length > 0 ? (
        <Box data-testid="plan-changes">
          {plan.fieldChanges.map((change) => (
            <Typography variant="body2" key={change.field}>
              {`${change.label}: `}
              <Box
                component="span"
                sx={{ textDecoration: "line-through", color: "text.secondary" }}
              >
                {change.from}
              </Box>
              {" → "}
              <strong>{change.to}</strong>
            </Typography>
          ))}
          {plan.questionChanges.map((change) => (
            <Typography variant="body2" key={`${change.kind}:${change.prompt}`}>
              {`Question ${change.kind}: `}
              <strong>{change.prompt}</strong>
            </Typography>
          ))}
        </Box>
      ) : null}

      {plan.audienceBefore.join(", ") !== plan.audienceAfter.join(", ") ? (
        <Typography variant="body2" data-testid="plan-audience-change">
          {`Invites by default: `}
          <Box component="span" sx={{ textDecoration: "line-through", color: "text.secondary" }}>
            {plan.audienceBefore.join(", ") || "Not set"}
          </Box>
          {" → "}
          <strong>{plan.audienceAfter.join(", ") || "Not set"}</strong>
        </Typography>
      ) : null}

      {plan.taking.length > 0 ? (
        <Section title={draftsTaking(plan.taking.length)} testId="plan-taking">
          {plan.taking.map((draft) => (
            <Box key={draft.id} sx={{ mb: 1 }}>
              <Typography variant="body2">
                {draft.name}
                {draft.scheduledOn ? ` · ${draft.scheduledOn}` : ""}
              </Typography>
              {draftTakes(draft).map((takes) => (
                <Typography variant="body2" color="text.secondary" key={takes}>
                  {takes}
                </Typography>
              ))}
            </Box>
          ))}
        </Section>
      ) : (
        <Notice severity="info" testId="plan-touches-nothing">
          {changeTouchesNothing(eventTypeLabel)}
        </Notice>
      )}

      {plan.holding.length > 0 ? (
        <Section title={draftsHolding(plan.holding.length)} testId="plan-holding">
          {plan.holding.map((draft) => (
            <Box key={draft.id} sx={{ mb: 1 }}>
              <Typography variant="body2">
                {draft.name}
                {draft.scheduledOn ? ` · ${draft.scheduledOn}` : ""}
              </Typography>
              {draft.reasons.map((reason) => (
                <Typography variant="body2" color="text.secondary" key={reason}>
                  {reason}
                </Typography>
              ))}
            </Box>
          ))}
        </Section>
      ) : null}

      {approved || past ? (
        <Section title={TEMPLATE_UNTOUCHED_HEADLINE} testId="plan-untouched">
          {approved ? (
            <Typography variant="body2" color="text.secondary">
              {approved}
            </Typography>
          ) : null}
          {past ? (
            <Typography variant="body2" color="text.secondary">
              {past}
            </Typography>
          ) : null}
        </Section>
      ) : null}
    </Stack>
  );
}
