import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import {
  applyParticipationView,
  participationSortHref,
  participationSortState,
  type OperatorParticipation,
  type OperatorParticipationPerson,
  type ParticipationFilters,
} from "@/lib/services/participation-view";
import { DesktopOnly, RowCard, RowCardList } from "@/components/row-card";
import { SortableHeader, TableFrame } from "@/components/sortable-header";
import { StatusChip } from "@/components/status-chip";
import {
  answerLabel,
  ANSWER_NO,
  ANSWER_YES,
  capacityLabel,
  DELIVERY_LABELS,
  DELIVERY_NOT_QUEUED,
  DISCREPANCY_LEGEND,
  DISCREPANCY_MARK,
  discrepancyLabel,
  everyoneAsked,
  NO_MATCHING_PEOPLE,
  NOBODY_ASKED,
  NOT_DISPATCHED_NO_CHANNEL,
  NOTHING,
  presenceLabel,
  SORTABLE_NOTE,
  TABLE_HEADINGS,
  WHATSAPP_UNRESPONSIVE,
} from "@/app/participation/presentation";

/**
 * The participation table on the kit — LAN-225 S3.
 *
 * The same rows, columns, sort links and filters as
 * `src/app/participation/participation-table.tsx` (the view logic is imported,
 * not copied), with three presentation changes: `StatusChip` reads the one
 * vocabulary for answer, attendance and delivery (A4); `SortableHeader` is
 * the shared heading; and the phone half is `RowCard` (E4). The record-answer
 * control is drawn as the empty answer it replaces, not wired.
 */
function formatWhen(value: string | null): string {
  if (value === null) return NOTHING;
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return NOTHING;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  })
    .format(when)
    .replace("Sept", "Sep");
}

function AnswerChip({ person }: { person: OperatorParticipationPerson }) {
  const label = answerLabel(person);
  if (label === NOTHING) {
    return (
      <Typography component="span" variant="body2" color="text.secondary">
        {NOTHING}
      </Typography>
    );
  }
  const status = label === ANSWER_YES ? "yes" : label === ANSWER_NO ? "no" : "none";
  return <StatusChip domain="rsvp" status={status} label={label} />;
}

function AttendanceChip({ person }: { person: OperatorParticipationPerson }) {
  if (person.presence === null) {
    return (
      <Typography component="span" variant="body2" color="text.secondary">
        {presenceLabel(null)}
      </Typography>
    );
  }
  return (
    <StatusChip
      domain="attendance"
      status={person.presence}
      label={presenceLabel(person.presence)}
    />
  );
}

function DeliveryCell({ person }: { person: OperatorParticipationPerson }) {
  if (person.isWalkUp) {
    return (
      <Typography component="span" variant="body2" color="text.secondary">
        {NOTHING}
      </Typography>
    );
  }
  const state = person.delivery ?? null;
  if (state === null) {
    return (
      <Typography component="span" variant="body2" color="text.secondary">
        {DELIVERY_NOT_QUEUED}
      </Typography>
    );
  }
  const status = person.noUsableRoute
    ? "no_channel"
    : person.whatsappUnresponsive
      ? "whatsapp_unresponsive"
      : state;
  const label = person.noUsableRoute
    ? NOT_DISPATCHED_NO_CHANNEL
    : person.whatsappUnresponsive
      ? WHATSAPP_UNRESPONSIVE
      : (DELIVERY_LABELS[state] ?? state);
  return (
    <Stack spacing={0.25} sx={{ alignItems: "flex-start" }}>
      <StatusChip domain="delivery" status={status} label={label} />
      {person.chasePosition ? (
        <Typography variant="caption" color="text.secondary">
          {person.chasePosition}
        </Typography>
      ) : null}
    </Stack>
  );
}

function Mark({ person }: { person: OperatorParticipationPerson }) {
  const label = discrepancyLabel(person.discrepancy);
  if (label === null) return null;
  return (
    <Typography
      component="span"
      title={label}
      aria-label={label}
      sx={{ ml: 0.75, color: "warning.main", fontWeight: 700 }}
    >
      {DISCREPANCY_MARK}
    </Typography>
  );
}

export default function ParticipationPreview({
  participation,
  filters,
}: {
  participation: OperatorParticipation;
  filters: ParticipationFilters;
}) {
  const basePath = "/design-preview/event";
  const { questions } = participation;
  const people = applyParticipationView(
    participation.people,
    filters,
    questions,
  ) as OperatorParticipationPerson[];
  const total = participation.people.length;
  const heading = (column: string, label: string) => {
    const { active, direction } = participationSortState(filters, column);
    return (
      <SortableHeader
        column={column}
        label={label}
        href={participationSortHref(basePath, filters, column)}
        active={active}
        direction={direction}
      />
    );
  };

  return (
    <TableFrame testId="participation-preview">
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: 1,
          borderColor: "divider",
          justifyContent: "space-between",
        }}
      >
        <Typography variant="overline">{everyoneAsked(total)}</Typography>
        <Typography variant="body2" color="text.secondary">
          <Typography
            component="span"
            variant="body2"
            sx={{ display: { xs: "none", md: "inline" } }}
          >
            {SORTABLE_NOTE}
            {" · "}
          </Typography>
          {DISCREPANCY_LEGEND}
        </Typography>
      </Stack>

      {total === 0 ? (
        <Typography sx={{ p: 2 }} color="text.secondary">
          {NOBODY_ASKED}
        </Typography>
      ) : people.length === 0 ? (
        <Typography sx={{ p: 2 }} color="text.secondary">
          {NO_MATCHING_PEOPLE}
        </Typography>
      ) : (
        <>
          <Stack spacing={0} sx={{ display: { xs: "flex", md: "none" }, p: 1.5 }}>
            <RowCardList>
              {people.map((person) => (
                <RowCard
                  key={person.key}
                  title={person.displayName}
                  trailing={capacityLabel(person)}
                  chips={
                    <>
                      <AnswerChip person={person} />
                      <AttendanceChip person={person} />
                      <DeliveryCell person={person} />
                    </>
                  }
                  sublines={[
                    person.reason ?? null,
                    `${TABLE_HEADINGS.invited}: ${formatWhen(person.invitedAt)}`,
                    ...questions.map(
                      (question) => `${question.prompt} ${person.answers[question.id] ?? NOTHING}`,
                    ),
                  ].filter((line): line is string => line !== null)}
                />
              ))}
            </RowCardList>
          </Stack>

          <DesktopOnly>
            <Table size="small" sx={{ minWidth: 1080 }}>
              <TableHead>
                <TableRow>
                  {heading("name", TABLE_HEADINGS.name)}
                  {heading("capacity", TABLE_HEADINGS.capacity)}
                  {heading("invited", TABLE_HEADINGS.invited)}
                  {heading("delivery", TABLE_HEADINGS.delivery)}
                  {heading("answer", TABLE_HEADINGS.answer)}
                  {heading("reason", TABLE_HEADINGS.reason)}
                  {heading("attendance", TABLE_HEADINGS.attendance)}
                  {questions.map((question) => (
                    <TableCell key={question.id}>{question.prompt}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {people.map((person) => (
                  <TableRow key={person.key} hover>
                    <TableCell>
                      <Typography variant="body2" component="span" sx={{ fontWeight: 600 }}>
                        {person.displayName}
                      </Typography>
                      <Mark person={person} />
                    </TableCell>
                    <TableCell>{capacityLabel(person)}</TableCell>
                    <TableCell>{formatWhen(person.invitedAt)}</TableCell>
                    <TableCell>
                      <DeliveryCell person={person} />
                    </TableCell>
                    <TableCell>
                      <AnswerChip person={person} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {person.reason ?? NOTHING}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <AttendanceChip person={person} />
                    </TableCell>
                    {questions.map((question) => (
                      <TableCell key={question.id}>
                        {person.answers[question.id] ?? NOTHING}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DesktopOnly>
        </>
      )}
    </TableFrame>
  );
}
