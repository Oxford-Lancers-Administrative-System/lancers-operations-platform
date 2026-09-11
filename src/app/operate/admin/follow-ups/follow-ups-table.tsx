import { StatusChip } from "@/components/status-chip";
import { DesktopOnly } from "@/components/row-card";
import { TableFrame } from "@/components/sortable-header";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { formatDeadline } from "@/app/operate/events/presentation";
import { formatLongDate } from "@/lib/services/event-vocabulary";
import { SortableColumnHeading } from "@/app/participation/participation-table";
import {
  followUpsSortHref,
  followUpsSortState,
  type FollowUpsFilters,
  type FollowUpsSortColumn,
  type QueueRow,
} from "./queue-filters";
import {
  CHASE_NONE,
  DEADLINE_UNSET,
  STATUS_LABELS,
  TABLE_CHASE,
  TABLE_DEADLINE,
  TABLE_EVENT,
  TABLE_PERSON,
  TABLE_STATUS,
  TABLE_WHEN,
} from "./presentation";

/** One sortable column heading, wired to this page's own sort/filter query keys. */
function FollowUpsHeading({
  filters,
  column,
  label,
}: {
  filters: FollowUpsFilters;
  column: FollowUpsSortColumn;
  label: string;
}) {
  const { active, direction } = followUpsSortState(filters, column);
  return (
    <SortableColumnHeading
      column={column}
      label={label}
      href={followUpsSortHref(filters, column)}
      active={active}
      direction={direction}
    />
  );
}

/** Desktop: one continuous table, per W5-01. */
export default function FollowUpsTable({
  filters,
  rows,
}: {
  filters: FollowUpsFilters;
  rows: readonly QueueRow[];
}) {
  return (
    <DesktopOnly>
      <TableFrame>
        <Table size="small" data-testid="follow-ups-table">
          <TableHead>
            <TableRow>
              <FollowUpsHeading filters={filters} column="person" label={TABLE_PERSON} />
              <FollowUpsHeading filters={filters} column="event" label={TABLE_EVENT} />
              <FollowUpsHeading filters={filters} column="when" label={TABLE_WHEN} />
              <FollowUpsHeading filters={filters} column="deadline" label={TABLE_DEADLINE} />
              <FollowUpsHeading filters={filters} column="chase" label={TABLE_CHASE} />
              <FollowUpsHeading filters={filters} column="status" label={TABLE_STATUS} />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.invitationId} data-testid="follow-ups-row">
                <TableCell sx={{ fontWeight: 600 }}>{row.personName}</TableCell>
                <TableCell>{row.eventName}</TableCell>
                <TableCell>
                  {row.scheduledOn ? formatLongDate(row.scheduledOn) : CHASE_NONE}
                </TableCell>
                <TableCell>
                  {row.deadline ? formatDeadline(row.deadline) : DEADLINE_UNSET}
                </TableCell>
                <TableCell>{row.chasePosition ?? CHASE_NONE}</TableCell>
                <TableCell>
                  <StatusChip
                    domain="delivery"
                    status={row.status}
                    label={STATUS_LABELS[row.status] ?? row.status}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
    </DesktopOnly>
  );
}
