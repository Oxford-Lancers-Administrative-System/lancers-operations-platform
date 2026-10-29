import Link from "@mui/material/Link";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { DesktopOnly, RowCard, RowCardList } from "@/components/row-card";
import { TableFrame } from "@/components/sortable-header";
import { StatusChip } from "@/components/status-chip";
import { formatAttemptTime } from "@/app/operate/events/[id]/delivery/presentation";
import { audienceOptionFor } from "@/lib/services/audience-selection";
import type { ClubMessageSummary } from "@/lib/services/club-messages";
import {
  COLUMN_AUDIENCE,
  COLUMN_PEOPLE,
  COLUMN_SENT_BY,
  COLUMN_STATUS,
  COLUMN_SUBJECT,
  COLUMN_WHEN,
  HAND_PICKED,
  MESSAGES_PATH,
  PROGRESS_CHIP_STATUS,
  PROGRESS_LABELS,
  peopleCount,
} from "./presentation";

/** The groups a message was sent to, by the builder's own labels; hand-picked people otherwise. */
export function audienceLabel(groups: readonly string[]): string {
  const labels = groups
    .map((token) => audienceOptionFor("training", token)?.label ?? null)
    .filter((label): label is string => label !== null);
  return labels.length > 0 ? labels.join(", ") : HAND_PICKED;
}

function Progress({ message }: { message: ClubMessageSummary }) {
  return (
    <StatusChip
      domain="delivery"
      status={PROGRESS_CHIP_STATUS[message.progress]}
      label={PROGRESS_LABELS[message.progress]}
    />
  );
}

function Subject({ message }: { message: ClubMessageSummary }) {
  return (
    <Link href={`${MESSAGES_PATH}/${message.id}`} underline="hover" sx={{ fontWeight: 600 }}>
      {message.subject}
    </Link>
  );
}

export function MessageTable({ messages }: { messages: readonly ClubMessageSummary[] }) {
  return (
    <DesktopOnly>
      <TableFrame>
        <Table size="small" data-testid="club-messages-table">
          <TableHead>
            <TableRow>
              <TableCell>{COLUMN_WHEN}</TableCell>
              <TableCell>{COLUMN_SUBJECT}</TableCell>
              <TableCell>{COLUMN_AUDIENCE}</TableCell>
              <TableCell align="right">{COLUMN_PEOPLE}</TableCell>
              <TableCell>{COLUMN_SENT_BY}</TableCell>
              <TableCell>{COLUMN_STATUS}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {messages.map((message) => (
              <TableRow key={message.id} data-testid="club-message-row">
                <TableCell sx={{ whiteSpace: "nowrap" }}>
                  {formatAttemptTime(new Date(message.scheduledFor))}
                </TableCell>
                <TableCell>
                  <Subject message={message} />
                  {message.attachmentCount > 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      {`${message.attachmentCount} ${message.attachmentCount === 1 ? "file" : "files"}`}
                    </Typography>
                  ) : null}
                </TableCell>
                <TableCell>{audienceLabel(message.audienceGroups)}</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                  {message.recipientCount}
                </TableCell>
                <TableCell>{message.sentBy}</TableCell>
                <TableCell>
                  <Progress message={message} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
    </DesktopOnly>
  );
}

/** Phone: one card per message, the queue's dense idiom. */
export function MessageCards({ messages }: { messages: readonly ClubMessageSummary[] }) {
  return (
    <RowCardList dense testId="club-messages-cards">
      {messages.map((message) => (
        <RowCard
          key={message.id}
          dense
          testId="club-message-card"
          href={`${MESSAGES_PATH}/${message.id}`}
          title={message.subject}
          trailing={formatAttemptTime(new Date(message.scheduledFor))}
          chips={<Progress message={message} />}
          sublines={[
            `${audienceLabel(message.audienceGroups)} · ${peopleCount(message.recipientCount)}`,
            message.sentBy,
          ]}
        />
      ))}
    </RowCardList>
  );
}
