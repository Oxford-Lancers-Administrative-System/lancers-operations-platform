import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
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
import type { MessageQueueRow } from "@/lib/services/message-queue";
import {
  CHANNEL_LABELS,
  COLUMN_CHANNEL,
  COLUMN_FOR,
  COLUMN_KIND,
  COLUMN_STATUS,
  COLUMN_TO,
  COLUMN_WHEN,
  KIND_LABELS,
  NEXT_PAGE,
  NO_CHANNEL,
  NO_PERSON,
  NOT_DELIVERED,
  nextAttemptLabel,
  PREVIOUS_PAGE,
  sendsAtLabel,
  STATE_LABELS,
} from "./presentation";
import Button from "@mui/material/Button";

/** The chip's code and word: the delivery screen's two exceptions first, then the state. */
function chipFor(row: MessageQueueRow): { status: string; label: string } {
  if (row.noUsableRoute) return { status: "no_channel", label: NO_CHANNEL };
  if (row.notDelivered) return { status: "not_delivered", label: NOT_DELIVERED };
  return { status: row.state, label: STATE_LABELS[row.state] ?? row.state };
}

/** The line under the time: what holds a queued row, a retry's next attempt, or why a reminder was dropped. */
function timingNote(row: MessageQueueRow): string | null {
  if (row.waiting) return row.waiting;
  if (row.droppedReason) return row.droppedReason;
  if (row.nextAttemptAt)
    return nextAttemptLabel(formatAttemptTime(row.nextAttemptAt), row.attemptCount);
  if (row.sendsAt && row.sendsAt.getTime() - row.at.getTime() > 60_000) {
    return sendsAtLabel(formatAttemptTime(row.sendsAt));
  }
  return null;
}

function channelLabel(row: MessageQueueRow): string {
  return row.channel ? (CHANNEL_LABELS[row.channel] ?? row.channel) : NO_PERSON;
}

function Person({ row, mayOpenPerson }: { row: MessageQueueRow; mayOpenPerson: boolean }) {
  const name = row.personName ?? NO_PERSON;
  return mayOpenPerson && row.personId ? (
    <Link href={`/operate/people/${row.personId}`} underline="hover">
      {name}
    </Link>
  ) : (
    <>{name}</>
  );
}

function Belongs({ row }: { row: MessageQueueRow }) {
  if (!row.eventName) return <>{NO_PERSON}</>;
  return row.mayOpenEvent && row.eventId ? (
    <Link href={`/operate/events/${row.eventId}`} underline="hover">
      {row.eventName}
    </Link>
  ) : (
    <>{row.eventName}</>
  );
}

export function MessagesTable({
  rows,
  mayOpenPerson,
}: {
  rows: readonly MessageQueueRow[];
  mayOpenPerson: boolean;
}) {
  return (
    <DesktopOnly>
      <TableFrame>
        <Table size="small" data-testid="messages-table">
          <TableHead>
            <TableRow>
              <TableCell>{COLUMN_WHEN}</TableCell>
              <TableCell>{COLUMN_TO}</TableCell>
              <TableCell>{COLUMN_KIND}</TableCell>
              <TableCell>{COLUMN_CHANNEL}</TableCell>
              <TableCell>{COLUMN_FOR}</TableCell>
              <TableCell>{COLUMN_STATUS}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const chip = chipFor(row);
              const note = timingNote(row);
              return (
                <TableRow key={row.id} data-testid="messages-row">
                  <TableCell sx={{ whiteSpace: "nowrap" }}>
                    {formatAttemptTime(row.at)}
                    {note ? (
                      <Typography variant="body2" color="text.secondary">
                        {note}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>
                    <Person row={row} mayOpenPerson={mayOpenPerson} />
                  </TableCell>
                  <TableCell>{KIND_LABELS[row.kind]}</TableCell>
                  <TableCell>{channelLabel(row)}</TableCell>
                  <TableCell>
                    <Belongs row={row} />
                  </TableCell>
                  <TableCell>
                    <StatusChip domain="delivery" status={chip.status} label={chip.label} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableFrame>
    </DesktopOnly>
  );
}

/** Phone: one dense card per message, as the roster's long lists read (LAN-439). */
export function MessagesCards({
  rows,
  mayOpenPerson,
}: {
  rows: readonly MessageQueueRow[];
  mayOpenPerson: boolean;
}) {
  return (
    <RowCardList dense testId="messages-cards">
      {rows.map((row) => {
        const chip = chipFor(row);
        const note = timingNote(row);
        return (
          <RowCard
            key={row.id}
            dense
            testId="messages-card"
            title={<Person row={row} mayOpenPerson={mayOpenPerson} />}
            trailing={formatAttemptTime(row.at)}
            chips={<StatusChip domain="delivery" status={chip.status} label={chip.label} />}
            sublines={[
              `${KIND_LABELS[row.kind]} · ${channelLabel(row)}`,
              ...(row.eventName ? [<Belongs key="for" row={row} />] : []),
              ...(note ? [note] : []),
            ]}
          />
        );
      })}
    </RowCardList>
  );
}

export function MessagesPager({
  range,
  previousHref,
  nextHref,
}: {
  range: string;
  previousHref: string | null;
  nextHref: string | null;
}) {
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: "center", justifyContent: "space-between" }}
      data-testid="messages-pager"
    >
      <Typography variant="body2" color="text.secondary">
        {range}
      </Typography>
      <Stack direction="row" spacing={1}>
        <Button
          variant="outlined"
          size="small"
          href={previousHref ?? undefined}
          disabled={previousHref === null}
          sx={{ minHeight: 44 }}
        >
          {PREVIOUS_PAGE}
        </Button>
        <Button
          variant="outlined"
          size="small"
          href={nextHref ?? undefined}
          disabled={nextHref === null}
          sx={{ minHeight: 44 }}
        >
          {NEXT_PAGE}
        </Button>
      </Stack>
    </Stack>
  );
}
