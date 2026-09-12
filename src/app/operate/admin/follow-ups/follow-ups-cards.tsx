import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { StatusChip } from "@/components/status-chip";
import { RowCard, RowCardList } from "@/components/row-card";
import { Fact, FactGrid } from "@/components/fact";
import { formatDeadline } from "@/app/operate/events/presentation";
import { formatLongDate } from "@/lib/services/event-vocabulary";
import type { QueueRow } from "./queue-filters";
import {
  eventHref,
  lastMessageLabel,
  personHref,
  selectRowLabel,
  type QueueSelection,
} from "./row-links";
import {
  DEADLINE_UNSET,
  NOT_CHASEABLE,
  STATUS_LABELS,
  TABLE_CHASE,
  TABLE_DEADLINE,
  TABLE_LAST_MESSAGE,
  TABLE_WHEN,
} from "./presentation";

/**
 * Phone: one card per row, per `docs/ux/standards.md` rule 7 — no horizontal
 * scrolling. LAN-329 and LAN-322: the card carries the same two links and the
 * same chase the desktop table does. Recruitment and chasing are both run from
 * a phone, so a control the table offers is never dropped here.
 */
export default function FollowUpsCards({
  rows,
  selection,
}: {
  rows: readonly QueueRow[];
  selection: QueueSelection;
}) {
  return (
    <RowCardList>
      {rows.map((row) => (
        <RowCard
          key={row.invitationId}
          testId="follow-ups-card"
          title={
            selection.mayOpenPerson ? (
              <Link href={personHref(row)} underline="hover">
                {row.personName}
              </Link>
            ) : (
              row.personName
            )
          }
          trailing={
            selection.mayChase && row.chaseable ? (
              <Checkbox
                size="small"
                checked={selection.selected.has(row.invitationId)}
                disabled={selection.pending}
                onChange={() => selection.toggle(row.invitationId)}
                slotProps={{ input: { "aria-label": selectRowLabel(row) } }}
              />
            ) : undefined
          }
          chips={
            <StatusChip
              domain="delivery"
              status={row.status}
              label={STATUS_LABELS[row.status] ?? row.status}
            />
          }
          sublines={[
            <Link key="event" href={eventHref(row)} underline="hover">
              {row.eventName}
            </Link>,
            <FactGrid key="facts" columns={2}>
              <Fact
                label={TABLE_WHEN}
                value={row.scheduledOn ? formatLongDate(row.scheduledOn) : null}
              />
              <Fact
                label={TABLE_DEADLINE}
                value={row.deadline ? formatDeadline(row.deadline) : DEADLINE_UNSET}
              />
              <Fact label={TABLE_CHASE} value={row.chasePosition} />
              <Fact label={TABLE_LAST_MESSAGE} value={lastMessageLabel(row.lastDelivery)} />
            </FactGrid>,
          ]}
          actions={
            selection.mayChase ? (
              row.chaseable ? (
                <Button
                  variant="outlined"
                  disabled={selection.pending}
                  onClick={() => selection.chase([row.invitationId])}
                  sx={{ minHeight: 44 }}
                >
                  Chase
                </Button>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {NOT_CHASEABLE}
                </Typography>
              )
            ) : undefined
          }
        />
      ))}
    </RowCardList>
  );
}
