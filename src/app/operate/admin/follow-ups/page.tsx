import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { isServiceError } from "@/lib/db";
import { formatDeadline } from "@/app/operate/events/presentation";
import { formatLongDate } from "@/lib/services/event-vocabulary";
import {
  countPeople,
  readFollowUpsQueue,
  type FollowUpEvent,
  type FollowUpRow,
  type FollowUpStatus,
} from "@/lib/services/follow-ups";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { gateShellPage } from "../../gate";
import AdminPageHeading from "../page-heading";
import FollowUpsFilter from "./follow-ups-filter";
import {
  CHASE_NONE,
  DEADLINE_UNSET,
  EMPTY_QUEUE,
  PAGE_HEADING,
  STATUS_COLOURS,
  STATUS_LABELS,
  subheading,
  TABLE_CHASE,
  TABLE_DEADLINE,
  TABLE_EVENT,
  TABLE_PERSON,
  TABLE_STATUS,
  TABLE_WHEN,
} from "./presentation";

/** One flat row — the table's own shape, an event repeated across its people. */
interface QueueRow extends FollowUpRow {
  readonly eventName: string;
  readonly scheduledOn: string | null;
}

function flatten(events: readonly FollowUpEvent[]): readonly QueueRow[] {
  return events.flatMap((event) =>
    event.people.map((person) => ({
      ...person,
      eventName: event.eventName,
      scheduledOn: event.scheduledOn,
    })),
  );
}

/**
 * The Follow-ups queue — W5, under Administration.
 *
 * ## One flat table, sorted soonest event first
 *
 * The approved mockup (W5-01) draws one continuous table — Person, Event,
 * When, Deadline, Where the chase has got to, Status — with the event name
 * repeated down the rows rather than a heading per event. "Grouped by event,
 * soonest first" (W5's own words) is the *sort*, not a second visual language:
 * `readFollowUpsQueue` already groups internally so a caller cannot read one
 * event's people out of order, and this page flattens that back to rows for
 * the one table W5-01 shows.
 *
 * ## Nobody compiles a list
 *
 * `T03-nonresponse-queue` is the whole of this page: `readFollowUpsQueue`
 * reads `nonresponse_queue`, a view that already exists, and shows it. There
 * is no button that builds this list and no action that refreshes it — it is
 * a reading of state, exactly as the participation table's Delivery column is.
 *
 * ## Any operator, not a further capability
 *
 * `gateShellPage` is called with no capability, matching `readFollowUpsQueue`'s
 * own floor (`requireGeneralOperator`) — the workflow names its primary actor
 * as "the President, and any operator working follow-ups", not a privileged
 * subset the way Operators and Roles are. Placement under Administration is
 * `DEC-administration-navigation`'s steer on where a low-frequency surface
 * belongs, not a narrower authority.
 */
export default async function FollowUpsPage({
  searchParams,
}: PageProps<"/operate/admin/follow-ups">) {
  const gate = await gateShellPage("/operate/admin/follow-ups");
  if ("screen" in gate) return gate.screen;

  const query = await searchParams;
  const search = typeof query.q === "string" ? query.q : "";
  const status = typeof query.status === "string" ? query.status : "";

  let events: readonly FollowUpEvent[];
  try {
    events = await readFollowUpsQueue();
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <UnavailableScreen
        title={PAGE_HEADING}
        message={error.message}
        testId="follow-ups-unavailable"
      />
    );
  }

  const rows = flatten(events);
  const needle = search.trim().toLowerCase();
  const filtered = rows.filter(
    (row) =>
      (status === "" || row.status === status) &&
      (needle === "" || row.personName.toLowerCase().includes(needle)),
  );

  return (
    <Stack spacing={3} data-testid="follow-ups-screen">
      <AdminPageHeading
        title={PAGE_HEADING}
        subtitle={subheading(countPeople(events), events.length)}
      />

      <FollowUpsFilter basePath="/operate/admin/follow-ups" search={search} status={status} />

      {filtered.length === 0 ? (
        <Alert severity="info" data-testid="follow-ups-empty">
          {rows.length === 0 ? EMPTY_QUEUE : "No one matches this search."}
        </Alert>
      ) : (
        <Paper variant="outlined">
          {/* Desktop: one continuous table, per W5-01. */}
          <TableContainer sx={{ display: { xs: "none", md: "block" }, overflowX: "auto" }}>
            <Table size="small" data-testid="follow-ups-table">
              <TableHead>
                <TableRow>
                  <TableCell>{TABLE_PERSON}</TableCell>
                  <TableCell>{TABLE_EVENT}</TableCell>
                  <TableCell>{TABLE_WHEN}</TableCell>
                  <TableCell>{TABLE_DEADLINE}</TableCell>
                  <TableCell>{TABLE_CHASE}</TableCell>
                  <TableCell>{TABLE_STATUS}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((row) => (
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
                      <StatusChip status={row.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Phone: one card per row, per § 7 — no horizontal scrolling. */}
          <Stack sx={{ display: { xs: "flex", md: "none" } }}>
            {filtered.map((row) => (
              <Box
                key={row.invitationId}
                sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}
                data-testid="follow-ups-card"
              >
                <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between" }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {row.personName}
                  </Typography>
                  <StatusChip status={row.status} />
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {row.eventName}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {row.deadline ? formatDeadline(row.deadline) : DEADLINE_UNSET}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {row.chasePosition ?? CHASE_NONE}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}

function StatusChip({ status }: { status: FollowUpStatus }) {
  return (
    <Chip
      size="small"
      color={STATUS_COLOURS[status] ?? "default"}
      label={STATUS_LABELS[status] ?? status}
    />
  );
}
