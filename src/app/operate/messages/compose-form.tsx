"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ActionBar } from "@/components/action-bar";
import { ChoiceField, DateField, Field, TimeField } from "@/components/field";
import { Notice } from "@/components/notice";
import { Section } from "@/components/section";
import { AudienceChooser, useAudienceChoice } from "@/app/operate/events/audience-chooser";
import {
  resolveSelection,
  type AudienceCandidate,
  type AudienceCapacity,
} from "@/lib/services/audience-selection";
import {
  attachmentsFit,
  BODY_MAX_LENGTH,
  DRAFT_PROBLEM_MESSAGES,
  draftProblems,
  formatMegabytes,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  SUBJECT_MAX_LENGTH,
  UPLOAD_CHUNK_BYTES,
} from "@/lib/services/club-message-input";
import type { Unreachable } from "@/lib/services/club-messages";
import { sendClubMessageAction, type SendMessageState } from "./actions";
import {
  ATTACH_FILES,
  BODY_LABEL,
  MESSAGES_PATH,
  NOT_REACHABLE_HEADING,
  RECIPIENTS_HEADING,
  REMOVE_FILE,
  SCHEDULE,
  SEND_AT_DATE,
  SEND_AT_TIME,
  SEND_NOW,
  STEP_AUDIENCE,
  STEP_EMAIL,
  STEP_SEND,
  SUBJECT_LABEL,
  UNREACHABLE_LABELS,
  UPLOAD_FAILED,
  UPLOADING,
  maxAttachmentSize,
  peopleCount,
  sendButtonLabel,
} from "./presentation";
import { RecipientsSection } from "./recipients-section";

const ATTACHMENTS_API = "/api/messages/attachments";

/** One file on the form: on its way up, held by the server, or refused. */
interface PendingFile {
  readonly localId: string;
  readonly name: string;
  readonly size: number;
  uploadId: string | null;
  received: number;
  status: "uploading" | "done" | "failed";
  error: string | null;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === "string") return body.message;
  } catch {
    // fall through
  }
  return UPLOAD_FAILED;
}

/**
 * **New message** — LAN-514. Three steps on one page: the audience (the event
 * builder's own chooser), the email (subject, body, files), and when it goes,
 * with everybody it will reach listed — and who it cannot — before it is sent.
 * Files go up as soon as they are chosen, in chunks, so the send itself posts
 * only their ids.
 */
export function ComposeForm({
  candidates,
  counts,
  unreachable,
}: {
  candidates: AudienceCandidate[];
  counts: Record<AudienceCapacity, number>;
  /** Per person id, who cannot be emailed and why. */
  unreachable: Readonly<Record<string, Unreachable>>;
}) {
  const choice = useAudienceChoice([], []);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [when, setWhen] = useState<"now" | "schedule">("now");
  const [sendDay, setSendDay] = useState("");
  const [sendTime, setSendTime] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  const nextLocalId = useRef(0);
  const [state, formAction, pending] = useActionState<SendMessageState, FormData>(
    sendClubMessageAction,
    { error: null },
  );

  const keys = useMemo(() => [...choice.selected], [choice.selected]);
  const resolution = useMemo(() => resolveSelection(candidates, keys), [candidates, keys]);
  const members = resolution.ok ? resolution.members : [];
  const reachable = members.filter((member) => !unreachable[member.personId]);
  const notReachable = members.filter((member) => unreachable[member.personId]);

  const held = files.filter((file) => file.status !== "failed");
  const uploading = files.some((file) => file.status === "uploading");

  const update = (localId: string, patch: Partial<PendingFile>) =>
    setFiles((current) =>
      current.map((file) => (file.localId === localId ? { ...file, ...patch } : file)),
    );

  async function upload(file: File, localId: string) {
    const started = await fetch(ATTACHMENTS_API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type,
        byteSize: file.size,
      }),
    });
    if (!started.ok) {
      update(localId, { status: "failed", error: await readError(started) });
      return;
    }
    const { id } = (await started.json()) as { id: string };
    update(localId, { uploadId: id });
    for (let offset = 0; offset < file.size; offset += UPLOAD_CHUNK_BYTES) {
      const chunk = await file.slice(offset, offset + UPLOAD_CHUNK_BYTES).arrayBuffer();
      const sent = await fetch(`${ATTACHMENTS_API}/${id}?offset=${offset}`, {
        method: "PUT",
        headers: { "content-type": "application/octet-stream" },
        body: chunk,
      });
      if (!sent.ok) {
        update(localId, { status: "failed", error: await readError(sent) });
        return;
      }
      update(localId, { received: Math.min(file.size, offset + chunk.byteLength) });
    }
    update(localId, { status: "done", received: file.size });
  }

  function choose(list: FileList | null) {
    setFileError(null);
    const chosen = [...(list ?? [])];
    if (chosen.length === 0) return;
    const sizes = [...held.map((file) => file.size), ...chosen.map((file) => file.size)];
    if (sizes.length > MAX_ATTACHMENTS) {
      setFileError(DRAFT_PROBLEM_MESSAGES.too_many_attachments);
      return;
    }
    if (!attachmentsFit(sizes)) {
      setFileError(DRAFT_PROBLEM_MESSAGES.attachments_too_large);
      return;
    }
    for (const file of chosen) {
      nextLocalId.current += 1;
      const localId = `file-${nextLocalId.current}`;
      setFiles((current) => [
        ...current,
        {
          localId,
          name: file.name,
          size: file.size,
          uploadId: null,
          received: 0,
          status: "uploading",
          error: null,
        },
      ]);
      void upload(file, localId).catch(() =>
        update(localId, { status: "failed", error: UPLOAD_FAILED }),
      );
    }
  }

  function remove(file: PendingFile) {
    setFiles((current) => current.filter((entry) => entry.localId !== file.localId));
    if (file.uploadId) {
      void fetch(`${ATTACHMENTS_API}/${file.uploadId}`, { method: "DELETE" }).catch(
        () => undefined,
      );
    }
  }

  const problems = draftProblems(
    {
      subject,
      body,
      attachmentSizes: held.map((file) => file.size),
      scheduledFor: null,
    },
    new Date(),
  );
  const scheduleMissing = when === "schedule" && (sendDay === "" || sendTime === "");
  const blocked =
    pending ||
    uploading ||
    files.some((file) => file.status === "failed") ||
    reachable.length === 0 ||
    problems.length > 0 ||
    scheduleMissing;
  const note =
    reachable.length === 0
      ? "Choose who this message is for."
      : problems.length > 0
        ? DRAFT_PROBLEM_MESSAGES[problems[0]]
        : uploading
          ? UPLOADING
          : scheduleMissing
            ? "Choose a date and a time."
            : undefined;

  return (
    <Box component="form" action={formAction} data-testid="compose-form">
      <Stack spacing={3}>
        <Section title={`1. ${STEP_AUDIENCE}`} testId="compose-audience">
          <AudienceChooser
            eventType="training"
            candidates={candidates}
            counts={counts}
            choice={choice}
            rowNote={(person) =>
              unreachable[person.personId] ? (
                <Typography variant="body2" color="warning.main" data-testid="row-unreachable">
                  {`${NOT_REACHABLE_HEADING} · ${UNREACHABLE_LABELS[unreachable[person.personId]]}`}
                </Typography>
              ) : null
            }
          />
        </Section>

        <Section title={`2. ${STEP_EMAIL}`} testId="compose-email">
          <Stack spacing={2}>
            <Field
              label={SUBJECT_LABEL}
              name="subject"
              value={subject}
              required
              onChange={(event) => setSubject(event.target.value)}
              slotProps={{
                htmlInput: { maxLength: SUBJECT_MAX_LENGTH, "data-testid": "compose-subject" },
              }}
            />
            <Field
              label={BODY_LABEL}
              name="body"
              value={body}
              required
              multiline
              minRows={8}
              onChange={(event) => setBody(event.target.value)}
              // LAN-514, Brian's walk on 31 October: the message and its files in one box.
              // The files sit inside the field's own outline, under the text.
              data-testid="compose-message-box"
              sx={{
                "& .MuiInputBase-root": { flexWrap: "wrap", alignItems: "flex-start" },
              }}
              slotProps={{
                htmlInput: { maxLength: BODY_MAX_LENGTH, "data-testid": "compose-body" },
                input: {
                  endAdornment: (
                    <Stack
                      spacing={1}
                      data-testid="compose-attachments"
                      sx={{ width: "100%", pt: 2 }}
                    >
                      <Stack
                        direction="row"
                        spacing={2}
                        sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}
                      >
                        <Button
                          variant="outlined"
                          onClick={() => picker.current?.click()}
                          disabled={held.length >= MAX_ATTACHMENTS}
                          data-testid="compose-attach"
                          sx={{ minHeight: 44 }}
                        >
                          {ATTACH_FILES}
                        </Button>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          data-testid="compose-size"
                        >
                          {maxAttachmentSize(MAX_ATTACHMENT_BYTES)}
                        </Typography>
                        <input
                          ref={picker}
                          type="file"
                          multiple
                          hidden
                          data-testid="compose-file-input"
                          onChange={(event) => {
                            choose(event.target.files);
                            event.target.value = "";
                          }}
                        />
                      </Stack>
                      {fileError ? (
                        <Notice severity="error" testId="compose-file-error">
                          {fileError}
                        </Notice>
                      ) : null}
                      {files.map((file) => (
                        <Stack
                          key={file.localId}
                          direction="row"
                          spacing={1}
                          sx={{
                            alignItems: "center",
                            borderBottom: 1,
                            borderColor: "divider",
                            py: 1,
                          }}
                          data-testid="compose-file"
                          data-status={file.status}
                        >
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 600, overflowWrap: "anywhere" }}
                            >
                              {file.name}
                            </Typography>
                            <Typography
                              variant="body2"
                              color={file.status === "failed" ? "error" : "text.secondary"}
                            >
                              {file.status === "failed"
                                ? (file.error ?? UPLOAD_FAILED)
                                : formatMegabytes(file.size)}
                            </Typography>
                            {file.status === "uploading" ? (
                              <LinearProgress
                                variant="determinate"
                                value={file.size === 0 ? 0 : (file.received / file.size) * 100}
                                aria-label={`${UPLOADING} ${file.name}`}
                              />
                            ) : null}
                          </Box>
                          <Button size="small" onClick={() => remove(file)} sx={{ minHeight: 44 }}>
                            {REMOVE_FILE}
                          </Button>
                        </Stack>
                      ))}
                    </Stack>
                  ),
                },
              }}
            />
          </Stack>
        </Section>

        <Section title={`3. ${STEP_SEND}`} testId="compose-send">
          <Stack spacing={2}>
            <ChoiceField
              label={STEP_SEND}
              name="when"
              value={when}
              row
              onChange={(next) => setWhen(next === "schedule" ? "schedule" : "now")}
              options={[
                { value: "now", label: SEND_NOW },
                { value: "schedule", label: SCHEDULE },
              ]}
            />
            {when === "schedule" ? (
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ maxWidth: 520 }}>
                <DateField
                  label={SEND_AT_DATE}
                  name="sendDay"
                  value={sendDay}
                  onChange={setSendDay}
                  minDate={new Date()}
                />
                <TimeField
                  label={SEND_AT_TIME}
                  name="sendTime"
                  value={sendTime}
                  onChange={setSendTime}
                />
              </Stack>
            ) : null}

            <Box data-testid="compose-preview">
              <RecipientsSection
                title={`${RECIPIENTS_HEADING} · ${peopleCount(reachable.length)}`}
                description={
                  notReachable.length > 0
                    ? `${NOT_REACHABLE_HEADING} · ${peopleCount(notReachable.length)}`
                    : undefined
                }
                testId="compose-recipients-section"
              >
                <Typography variant="body2" color="text.secondary" data-testid="compose-recipients">
                  {reachable.map((member) => member.displayName).join(", ")}
                </Typography>
                {notReachable.length > 0 ? (
                  <Box sx={{ mt: 1.5 }} data-testid="compose-unreachable">
                    <Typography variant="subtitle2" component="h4" color="warning.main">
                      {`${NOT_REACHABLE_HEADING} · ${peopleCount(notReachable.length)}`}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {notReachable
                        .map(
                          (member) =>
                            `${member.displayName} (${UNREACHABLE_LABELS[unreachable[member.personId]]})`,
                        )
                        .join(", ")}
                    </Typography>
                  </Box>
                ) : null}
              </RecipientsSection>
            </Box>

            {state.error ? (
              <Notice severity="error" testId="compose-error">
                {state.error}
              </Notice>
            ) : null}

            {keys.map((key) => (
              <input key={key} type="hidden" name="audienceKey" value={key} />
            ))}
            {[...choice.pressedGroups].map((group) => (
              <input key={group} type="hidden" name="audienceGroup" value={group} />
            ))}
            {held
              .filter((file) => file.uploadId !== null)
              .map((file) => (
                <input
                  key={file.localId}
                  type="hidden"
                  name="attachmentId"
                  value={file.uploadId ?? ""}
                />
              ))}

            <ActionBar
              note={note}
              primary={
                <Button
                  type="submit"
                  variant="contained"
                  disabled={blocked}
                  data-testid="compose-submit"
                >
                  {pending ? "Sending…" : sendButtonLabel(reachable.length, when === "schedule")}
                </Button>
              }
              cancel={
                <Button variant="outlined" href={MESSAGES_PATH} disabled={pending}>
                  Cancel
                </Button>
              }
            />
          </Stack>
        </Section>
      </Stack>
    </Box>
  );
}
