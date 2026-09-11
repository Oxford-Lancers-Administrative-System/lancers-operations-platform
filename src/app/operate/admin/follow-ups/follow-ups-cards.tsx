import { StatusChip } from "@/components/status-chip";
import { RowCard, RowCardList } from "@/components/row-card";
import { Fact, FactGrid } from "@/components/fact";
import { formatDeadline } from "@/app/operate/events/presentation";
import { formatLongDate } from "@/lib/services/event-vocabulary";
import type { QueueRow } from "./queue-filters";
import {
  DEADLINE_UNSET,
  STATUS_LABELS,
  TABLE_CHASE,
  TABLE_DEADLINE,
  TABLE_WHEN,
} from "./presentation";

/** Phone: one card per row, per `docs/ux/standards.md` rule 7 — no horizontal scrolling. */
export default function FollowUpsCards({ rows }: { rows: readonly QueueRow[] }) {
  return (
    <RowCardList>
      {rows.map((row) => (
        <RowCard
          key={row.invitationId}
          testId="follow-ups-card"
          title={row.personName}
          chips={
            <StatusChip
              domain="delivery"
              status={row.status}
              label={STATUS_LABELS[row.status] ?? row.status}
            />
          }
          sublines={[
            row.eventName,
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
            </FactGrid>,
          ]}
        />
      ))}
    </RowCardList>
  );
}
