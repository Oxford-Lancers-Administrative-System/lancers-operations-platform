"use client";

import { useRef } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import SvgIcon from "@mui/material/SvgIcon";
import { Field, NO_AUTOFILL, SelectField } from "@/components/field";
import { FieldGroup, Section } from "@/components/section";
import { applyBriefFormat, type BriefFormat } from "@/lib/event-brief/markdown";
import {
  DEFAULT_EVENT_MESSAGE_HOURS,
  EVENT_MESSAGES_HEADLINE,
  EVENT_MESSAGE_CHANNEL_HELP,
  EVENT_MESSAGE_CHANNEL_LABELS,
  EVENT_MESSAGE_CHANNELS,
  EVENT_MESSAGE_HOURS_HELP,
  EVENT_MESSAGE_RECIPIENT_HELP,
  EVENT_MESSAGE_RECIPIENT_LABELS,
  EVENT_MESSAGE_RECIPIENTS,
  MAX_EVENT_MESSAGE_HOURS,
  MIN_EVENT_MESSAGE_HOURS,
  eventMessageSendAt,
  formatEventMessageWhen,
  type EventMessageChannel,
  type EventMessageIssue,
  type EventMessageRecipients,
  type RawEventMessage,
} from "@/lib/services/event-messages-input";
import { BriefFormatGuide } from "./brief-format-guide";
import { BriefPreview } from "./brief-preview";

/**
 * Event messages on the event form — LAN-508, W1-01 and W1-02. Built like the
 * question editor: one stacked card per message, editable in place, Add under
 * the list, no filler when there are none. Each card: Hours before (its helper
 * is the computed send time), Channel, Recipients, the toolbar,
 * the Markdown box at full card width, and the Preview disclosure below it.
 * Under each of the three controls one short line says what it means
 * (LAN-515); an issue or the send time, when there is one, sits above it.
 *
 * The same editor serves the draft form, the edit page of an approved event
 * and the template editor (which has no date, so no helper). A message that
 * has already gone cannot be removed, so its card has no Remove. The hidden
 * inputs are the payload (`event-message-form.ts`).
 */

/** The toolbar: Title, Heading, Bold, Bullet, Highlight, Itinerary line (W1-01, round 2). */
const TOOLBAR: readonly { format: BriefFormat; label: string; path: string }[] = [
  { format: "title", label: "Title", path: "M9 4v3h5v12h3V7h5V4zm-6 8h3v7h3v-7h3V9H3z" },
  { format: "heading", label: "Heading", path: "M5 4v3h5.5v12h3V7H19V4z" },
  {
    format: "bold",
    label: "Bold",
    path: "M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42M10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5",
  },
  {
    format: "bullet",
    label: "Bullet",
    path: "M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5m0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5m0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5M7 19h14v-2H7zm0-6h14v-2H7zm0-8v2h14V5z",
  },
  {
    format: "highlight",
    label: "Highlight",
    path: "M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z",
  },
  {
    format: "itinerary",
    label: "Itinerary line",
    path: "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2M12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8m.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z",
  },
];

/** The field's own helper text as lines: the issue or send time when present, then the explanation (LAN-515). */
function helperLines(first: string | undefined, help: string) {
  return (
    <>
      {first ? (
        <Box component="span" sx={{ display: "block" }}>
          {first}
        </Box>
      ) : null}
      <Box component="span" sx={{ display: "block" }} data-testid="event-message-help">
        {help}
      </Box>
    </>
  );
}

function blankEventMessage(): RawEventMessage {
  return {
    id: "",
    hoursBefore: String(DEFAULT_EVENT_MESSAGE_HOURS),
    channel: "both",
    recipients: "everyone",
    body: "",
    fromTemplate: "false",
  };
}

export interface EventMessageEditorProps {
  messages: RawEventMessage[];
  onChange: (messages: RawEventMessage[]) => void;
  issues: readonly EventMessageIssue[];
  disabled?: boolean;
  /** The event's start, for each card's send-time helper; `null` before a date and time exist. */
  eventStart?: Date | null;
  /** Stored ids of messages that have already gone, which cannot be removed. */
  sentIds?: ReadonlySet<string>;
}

export default function EventMessageEditor({
  messages,
  onChange,
  issues,
  disabled = false,
  eventStart = null,
  sentIds,
}: EventMessageEditorProps) {
  function update(index: number, patch: Partial<RawEventMessage>) {
    onChange(
      messages.map((message, at) =>
        at === index
          ? // Edited, so it is the operator's now and a type change leaves it alone.
            { ...message, ...patch, fromTemplate: "false" }
          : message,
      ),
    );
  }

  return (
    <Section title={EVENT_MESSAGES_HEADLINE} testId="event-message-editor">
      <input type="hidden" name="eventMessagesPresent" value="1" />
      <Stack spacing={2}>
        {messages.length > 0 ? (
          <Stack component="ol" spacing={2} sx={{ listStyle: "none", p: 0, m: 0 }}>
            {messages.map((message, index) => (
              <Box component="li" key={index} data-testid="event-message-card" data-index={index}>
                <EventMessageCard
                  index={index}
                  message={message}
                  issues={issues.filter((issue) => issue.index === index)}
                  disabled={disabled}
                  eventStart={eventStart}
                  removable={!(message.id && sentIds?.has(message.id))}
                  onUpdate={(patch) => update(index, patch)}
                  onRemove={() => onChange(messages.filter((_, at) => at !== index))}
                />
              </Box>
            ))}
          </Stack>
        ) : null}

        <Box>
          <Button
            variant="outlined"
            disabled={disabled}
            onClick={() => onChange([...messages, blankEventMessage()])}
            data-testid="add-event-message"
            sx={{ minHeight: 44 }}
          >
            Add event message
          </Button>
        </Box>
      </Stack>
    </Section>
  );
}

function EventMessageCard({
  index,
  message,
  issues,
  disabled,
  eventStart,
  removable,
  onUpdate,
  onRemove,
}: {
  index: number;
  message: RawEventMessage;
  issues: readonly EventMessageIssue[];
  disabled: boolean;
  eventStart: Date | null;
  removable: boolean;
  onUpdate: (patch: Partial<RawEventMessage>) => void;
  onRemove: () => void;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  const issueFor = (field: EventMessageIssue["field"]) =>
    issues.find((issue) => issue.field === field)?.message;

  const hoursText = message.hoursBefore ?? "";
  const hours = /^\d+$/.test(hoursText) ? Number(hoursText) : null;
  const sendAt =
    eventStart !== null &&
    hours !== null &&
    hours >= MIN_EVENT_MESSAGE_HOURS &&
    hours <= MAX_EVENT_MESSAGE_HOURS
      ? formatEventMessageWhen(eventMessageSendAt(eventStart, hours))
      : undefined;

  function format(kind: BriefFormat) {
    const area = box.current;
    const value = message.body ?? "";
    const edit = applyBriefFormat(
      value,
      area?.selectionStart ?? value.length,
      area?.selectionEnd ?? value.length,
      kind,
    );
    onUpdate({ body: edit.value });
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(edit.selectionStart, edit.selectionEnd);
    });
  }

  const channel = message.channel || "both";
  const recipients = message.recipients || "everyone";

  return (
    <FieldGroup title={`Event message ${index + 1}`}>
      <Stack spacing={2}>
        <Stack direction="row" sx={{ alignItems: "center" }}>
          <Box sx={{ flexGrow: 1 }} />
          {removable ? (
            <Button
              size="small"
              color="error"
              disabled={disabled}
              onClick={onRemove}
              data-testid="remove-event-message"
              sx={{ minHeight: 44 }}
            >
              Remove
            </Button>
          ) : null}
        </Stack>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <Field
            label="Hours before"
            type="number"
            autoComplete={NO_AUTOFILL}
            value={hoursText}
            onChange={(event) => onUpdate({ hoursBefore: event.target.value })}
            error={Boolean(issueFor("hoursBefore"))}
            helperText={helperLines(issueFor("hoursBefore") ?? sendAt, EVENT_MESSAGE_HOURS_HELP)}
            disabled={disabled}
            slotProps={{
              inputLabel: { shrink: true },
              htmlInput: { min: MIN_EVENT_MESSAGE_HOURS, max: MAX_EVENT_MESSAGE_HOURS, step: 1 },
            }}
            data-testid="event-message-hours"
          />
          <SelectField
            label="Channel"
            value={channel}
            onChange={(event) => onUpdate({ channel: event.target.value })}
            error={Boolean(issueFor("channel"))}
            helperText={helperLines(
              issueFor("channel"),
              EVENT_MESSAGE_CHANNEL_HELP[channel as EventMessageChannel] ??
                EVENT_MESSAGE_CHANNEL_HELP.both,
            )}
            disabled={disabled}
            options={EVENT_MESSAGE_CHANNELS.map((value) => ({
              value,
              label: EVENT_MESSAGE_CHANNEL_LABELS[value],
            }))}
          />
          <SelectField
            label="Recipients"
            value={recipients}
            onChange={(event) => onUpdate({ recipients: event.target.value })}
            error={Boolean(issueFor("recipients"))}
            helperText={helperLines(
              issueFor("recipients"),
              EVENT_MESSAGE_RECIPIENT_HELP[recipients as EventMessageRecipients] ??
                EVENT_MESSAGE_RECIPIENT_HELP.everyone,
            )}
            disabled={disabled}
            options={EVENT_MESSAGE_RECIPIENTS.map((value) => ({
              value,
              label: EVENT_MESSAGE_RECIPIENT_LABELS[value],
            }))}
          />
        </Stack>

        <Stack spacing={0.5} sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} data-testid="event-message-toolbar">
            {TOOLBAR.map((tool) => (
              <IconButton
                key={tool.format}
                size="small"
                aria-label={tool.label}
                title={tool.label}
                disabled={disabled}
                onClick={() => format(tool.format)}
                data-testid={`brief-${tool.format}`}
              >
                <SvgIcon fontSize="small">
                  <path d={tool.path} />
                </SvgIcon>
              </IconButton>
            ))}
            <BriefFormatGuide disabled={disabled} />
          </Stack>
          <Field
            label="Message"
            multiline
            minRows={6}
            value={message.body ?? ""}
            onChange={(event) => onUpdate({ body: event.target.value })}
            error={Boolean(issueFor("body"))}
            helperText={issueFor("body")}
            disabled={disabled}
            inputRef={box}
            slotProps={{ inputLabel: { shrink: true } }}
            data-testid="event-message-body"
          />
        </Stack>

        <BriefPreview body={message.body ?? ""} testId="event-message-preview" />
      </Stack>

      <input type="hidden" name="eventMessageId" value={message.id ?? ""} />
      <input type="hidden" name="eventMessageHoursBefore" value={hoursText} />
      <input type="hidden" name="eventMessageChannel" value={channel} />
      <input type="hidden" name="eventMessageRecipients" value={recipients} />
      <input type="hidden" name="eventMessageBody" value={message.body ?? ""} />
      <input
        type="hidden"
        name="eventMessageFromTemplate"
        value={message.fromTemplate === "true" ? "true" : "false"}
      />
    </FieldGroup>
  );
}
