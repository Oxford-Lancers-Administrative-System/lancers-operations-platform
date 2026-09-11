import Checkbox from "@mui/material/Checkbox";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { StatusChip } from "@/components/status-chip";
import { DesktopOnly } from "@/components/row-card";
import { TableFrame } from "@/components/sortable-header";
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
import { eventHref, lastMessageLabel, personHref, type QueueSelection } from "./row-links";
import {
  CHASE_NONE,
  DEADLINE_UNSET,
  NOT_CHASEABLE,
  STATUS_LABELS,
  TABLE_CHASE,
  TABLE_DEADLINE,
  TABLE_EVENT,
  TABLE_LAST_MESSAGE,
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

/** Desktop: one continuous table, per W5-01. Selection and the chase are LAN-322's; the person and event links are LAN-329's. */
export default function FollowUpsTable({
  filters,
  rows,
  selection,
}: {
  filters: FollowUpsFilters;
  rows: readonly QueueRow[];
  selection: QueueSelection;
}) {
  const chaseable = rows.filter((row) => row.chaseable);

  return (
    <DesktopOnly>
      <TableFrame>
        <Table size="small" data-testid="follow-ups-table">
          <TableHead>
            <TableRow>
              {selection.mayChase ? (
                <TableCell padding="checkbox">
                  <Checkbox
                    size="small"
                    checked={chaseable.length > 0 && selection.selected.size === chaseable.length}
                    indeterminate={
                      selection.selected.size > 0 && selection.selected.size < chaseable.length
                    }
                    disabled={chaseable.length === 0 || selection.pending}
                    onChange={selection.toggleAll}
                    slotProps={{ input: { "aria-label": "Select every person who can be chased" } }}
                  />
                </TableCell>
              ) : null}
              <FollowUpsHeading filters={filters} column="person" label={TABLE_PERSON} />
              <FollowUpsHeading filters={filters} column="event" label={TABLE_EVENT} />
              <FollowUpsHeading filters={filters} column="when" label={TABLE_WHEN} />
              <FollowUpsHeading filters={filters} column="deadline" label={TABLE_DEADLINE} />
              <FollowUpsHeading filters={filters} column="chase" label={TABLE_CHASE} />
              <TableCell>{TABLE_LAST_MESSAGE}</TableCell>
              <FollowUpsHeading filters={filters} column="status" label={TABLE_STATUS} />
              {selection.mayChase ? <TableCell /> : null}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.invitationId} data-testid="follow-ups-row">
                {selection.mayChase ? (
                  <TableCell padding="checkbox">
                    {row.chaseable ? (
                      <Checkbox
                        size="small"
                        checked={selection.selected.has(row.invitationId)}
                        disabled={selection.pending}
                        onChange={() => selection.toggle(row.invitationId)}
                        slotProps={{ input: { "aria-label": `Select ${row.personName}` } }}
                      />
                    ) : null}
                  </TableCell>
                ) : null}
                <TableCell data-cell="person" sx={{ fontWeight: 600 }}>
                  {selection.mayOpenPerson ? (
                    <Link href={personHref(row)} underline="hover" color="inherit">
                      {row.personName}
                    </Link>
                  ) : (
                    row.personName
                  )}
                </TableCell>
                <TableCell>
                  <Link href={eventHref(row)} underline="hover" color="inherit">
                    {row.eventName}
                  </Link>
                </TableCell>
                <TableCell>
                  {row.scheduledOn ? formatLongDate(row.scheduledOn) : CHASE_NONE}
                </TableCell>
                <TableCell>
                  {row.deadline ? formatDeadline(row.deadline) : DEADLINE_UNSET}
                </TableCell>
                <TableCell>{row.chasePosition ?? CHASE_NONE}</TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {lastMessageLabel(row.lastDelivery)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <StatusChip
                    domain="delivery"
                    status={row.status}
                    label={STATUS_LABELS[row.status] ?? row.status}
                  />
                </TableCell>
                {selection.mayChase ? (
                  <TableCell>
                    {row.chaseable ? (
                      <Stack direction="row" spacing={1}>
                        <Button
                          variant="outlined"
                          size="small"
                          disabled={selection.pending}
                          onClick={() => selection.chase([row.invitationId])}
                          sx={{ minHeight: 44 }}
                        >
                          Chase
                        </Button>
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        {NOT_CHASEABLE}
                      </Typography>
                    )}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
    </DesktopOnly>
  );
}
