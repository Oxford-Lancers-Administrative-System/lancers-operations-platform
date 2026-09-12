"use client";

import { useActionState, useState } from "react";
import { Notice } from "@/components/notice";
import { Section } from "@/components/section";
import { Field, NO_AUTOFILL, preventImplicitSubmit } from "@/components/field";
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
import {
  TEMPLATE_COLOUR_PALETTE,
  type RawEventTemplate,
} from "@/lib/services/event-template-input";
import type { TemplateChangePlan } from "@/lib/services/event-templates";
import QuestionEditor from "../question-editor";
import {
  createEventTemplateAction,
  deleteEventTemplateAction,
  previewEventTemplateAction,
  saveEventTemplateAction,
} from "./actions";
import { EMPTY_TEMPLATE_FORM_STATE } from "./form-state";
import { ChangePlan } from "./template-change-plan";
import { issueFor, TemplateEventFields } from "./template-form-fields";
import {
  confirmSaveAction,
  TEMPLATE_AUDIENCE_HEADLINE,
  TEMPLATE_COLOUR_HEADLINE,
  TEMPLATE_COLOUR_HELP,
  TEMPLATE_CONFIRM_BACK,
  TEMPLATE_CONFIRM_TITLE,
  TEMPLATE_CREATE_ACTION,
  TEMPLATE_DELETE_ACTION,
  TEMPLATE_DELETE_TITLE,
  TEMPLATE_DISCARD_ACTION,
  TEMPLATE_DURATION_OPTIONS,
  TEMPLATE_NAME_HEADLINE,
  TEMPLATE_NAME_HELP,
  TEMPLATE_QUESTIONS_HEADLINE,
  TEMPLATE_SAVE_ACTION,
  templateDeleteQuestion,
} from "./presentation";

// W8-02 and W8-03 — one template, and what changing it will touch. Save…
// previews (no write); the dialog re-posts to saveEventTemplateAction, which
// recomputes under its own locks.

export interface TemplateEditorProps {
  /** One component for create and edit — same screen, same rules (LAN-265). */
  templateId: string | null;
  eventTypeLabel: string;
  initial: RawEventTemplate;
  initialQuestions: RawEventQuestion[];
  groups: readonly AudienceGroup[];
  /** Decides whether Delete is offered — zero on an unused or new template. */
  eventCount: number;
}

export default function TemplateEditor({
  templateId,
  eventTypeLabel,
  initial,
  initialQuestions,
  groups,
  eventCount,
}: TemplateEditorProps) {
  const [previewState, previewAction, previewing] = useActionState(
    previewEventTemplateAction,
    EMPTY_TEMPLATE_FORM_STATE,
  );
  const [saveState, saveAction, saving] = useActionState(
    saveEventTemplateAction,
    EMPTY_TEMPLATE_FORM_STATE,
  );
  const [deleteState, deleteAction, deletingNow] = useActionState(
    deleteEventTemplateAction,
    EMPTY_TEMPLATE_FORM_STATE,
  );
  const [createState, createAction, creating] = useActionState(
    createEventTemplateAction,
    EMPTY_TEMPLATE_FORM_STATE,
  );

  // Creating skips the preview and posts straight to the write — nothing exists yet to have a blast radius.
  const creatingNew = templateId === null;

  const state = creatingNew
    ? createState
    : saveState.phase === "editing" && saveState.error === null
      ? previewState
      : saveState;

  const text = (field: keyof RawEventTemplate): string => {
    const raw = initial[field];
    return typeof raw === "string" ? raw : "";
  };

  const [selected, setSelected] = useState<AudienceGroupKey[]>(() => [
    ...((initial.audienceGroups ?? []) as AudienceGroupKey[]),
  ]);
  const [questions, setQuestions] = useState<RawEventQuestion[]>(() => [...initialQuestions]);
  const [name, setName] = useState(text("name"));
  const [colourKey, setColourKey] = useState(text("colourKey"));
  const [deleting, setDeleting] = useState(false);
  const [venue, setVenue] = useState(text("defaultVenue"));
  const [deliveryMode, setDeliveryMode] = useState(text("defaultDeliveryMode") || "unset");
  const [duration, setDuration] = useState(text("defaultDurationMinutes"));
  const [description, setDescription] = useState(text("defaultDescription"));
  const [equipment, setEquipment] = useState(text("defaultRequiredEquipment"));
  const [attendance, setAttendance] = useState(text("defaultAttendance") || "unset");

  // Compared by identity, not a boolean, so a new preview reopens the dialog without resetting a flag.
  const [dismissed, setDismissed] = useState<TemplateChangePlan | null>(null);

  const confirming =
    !creatingNew && state.phase === "confirming" && state.plan !== null && state.plan !== dismissed;
  const busy = previewing || saving || deletingNow || creating;

  // C6's off-grid case: a duration saved before the eight-option grid existed
  // becomes a truthful ninth MenuItem, only while selected.
  const offGridDuration =
    duration !== "" && !TEMPLATE_DURATION_OPTIONS.includes(Number(duration))
      ? Number(duration)
      : null;

  function toggleGroup(key: AudienceGroupKey) {
    setSelected((current) =>
      current.includes(key) ? current.filter((group) => group !== key) : [...current, key],
    );
  }

  const hiddenFields = (
    <>
      {templateId === null ? null : <input type="hidden" name="templateId" value={templateId} />}
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="colourKey" value={colourKey} />
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

      {deleteState.error ? (
        <Notice severity="error" testId="template-delete-error">
          {deleteState.error}
        </Notice>
      ) : null}

      {/* LAN-313: Enter in a question field must not submit the whole template. */}
      <Box
        component="form"
        action={creatingNew ? createAction : previewAction}
        onKeyDown={preventImplicitSubmit}
        data-testid="template-form"
      >
        {templateId === null ? null : <input type="hidden" name="templateId" value={templateId} />}

        <Stack spacing={3}>
          <Section title={TEMPLATE_NAME_HEADLINE}>
            <Field
              label="Name"
              name="name"
              data-field="name"
              // LAN-324: the type's name, not the operator's.
              autoComplete={NO_AUTOFILL}
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={Boolean(issueFor(state, "name"))}
              helperText={issueFor(state, "name") ?? TEMPLATE_NAME_HELP}
              disabled={busy}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Section>

          <Section title={TEMPLATE_COLOUR_HEADLINE}>
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                {TEMPLATE_COLOUR_PALETTE.map((swatch) => {
                  const on = colourKey === swatch.key;
                  return (
                    <Button
                      key={swatch.key}
                      type="button"
                      variant={on ? "contained" : "outlined"}
                      size="small"
                      aria-pressed={on}
                      disabled={busy}
                      onClick={() => setColourKey(swatch.key)}
                      data-testid="template-colour-swatch"
                      data-colour={swatch.key}
                      startIcon={
                        <Box
                          aria-hidden="true"
                          sx={{
                            width: 14,
                            height: 14,
                            borderRadius: 0.5,
                            bgcolor: swatch.tint,
                            border: 2,
                            borderColor: swatch.accent,
                          }}
                        />
                      }
                      sx={{ minHeight: 44 }}
                    >
                      {swatch.label}
                    </Button>
                  );
                })}
              </Stack>
              <input type="hidden" name="colourKey" value={colourKey} />
              <Typography
                variant="body2"
                color={issueFor(state, "colourKey") ? "error" : "text.secondary"}
                data-testid="template-colour-help"
              >
                {issueFor(state, "colourKey") ?? TEMPLATE_COLOUR_HELP}
              </Typography>
            </Stack>
          </Section>

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

          <TemplateEventFields
            state={state}
            busy={busy}
            deliveryMode={deliveryMode}
            onDeliveryModeChange={setDeliveryMode}
            venue={venue}
            onVenueChange={setVenue}
            duration={duration}
            onDurationChange={setDuration}
            offGridDuration={offGridDuration}
            equipment={equipment}
            onEquipmentChange={setEquipment}
            description={description}
            onDescriptionChange={setDescription}
            attendance={attendance}
            onAttendanceChange={setAttendance}
          />

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
                {creatingNew
                  ? creating
                    ? "Creating…"
                    : TEMPLATE_CREATE_ACTION
                  : previewing
                    ? "Checking…"
                    : TEMPLATE_SAVE_ACTION}
              </Button>
            }
            // LAN-265: absent, not disabled, on a used template — the service
            // refuses regardless (events_template_fkey ON DELETE RESTRICT).
            secondary={
              templateId !== null && eventCount === 0 ? (
                <Button
                  variant="text"
                  color="error"
                  disabled={busy}
                  onClick={() => setDeleting(true)}
                  data-testid="delete-template"
                  sx={{ minHeight: 44 }}
                >
                  {TEMPLATE_DELETE_ACTION}
                </Button>
              ) : undefined
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

      {/* LAN-265 — deleting a template, confirmed by name, same shape as D29's draft delete. */}
      <Dialog
        open={deleting}
        onClose={() => (busy ? undefined : setDeleting(false))}
        aria-labelledby="template-delete-title"
        maxWidth="xs"
        fullWidth
        data-testid="template-delete-confirm"
      >
        <DialogTitle id="template-delete-title">{TEMPLATE_DELETE_TITLE}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2">{templateDeleteQuestion(eventTypeLabel)}</Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleting(false)}
            disabled={busy}
            data-testid="dismiss-template-delete"
            sx={{ minHeight: 44 }}
          >
            {TEMPLATE_CONFIRM_BACK}
          </Button>
          <Box component="form" action={deleteAction}>
            <input type="hidden" name="templateId" value={templateId ?? ""} />
            <Button
              type="submit"
              variant="contained"
              color="error"
              disabled={busy}
              data-testid="confirm-delete-template"
              sx={{ minHeight: 44 }}
            >
              {TEMPLATE_DELETE_ACTION}
            </Button>
          </Box>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
