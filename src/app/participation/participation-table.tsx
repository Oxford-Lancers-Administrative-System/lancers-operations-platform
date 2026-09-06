import Box from "@mui/material/Box";
import { StatusChip } from "@/components/status-chip";
import { Section } from "@/components/section";
import { Fact, FactGrid } from "@/components/fact";
import { EmptyState } from "@/components/empty-state";
import { RowCard, RowCardList, DesktopOnly } from "@/components/row-card";
import { SortableHeader, TableFrame } from "@/components/sortable-header";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

import type { AttendancePresence } from "@/lib/services/attendance-vocabulary";
import {
  applyParticipationView,
  participationSortHref,
  participationSortState,
  type EventFactsBase,
  type OperatorParticipationPerson,
  type Participation,
  type ParticipationFilters,
  type ParticipationPerson,
  type ParticipationQuestion,
} from "@/lib/services/participation-view";

import {
  answerLabel,
  capacityLabel,
  DELIVERY_LABELS,
  DELIVERY_NOT_QUEUED,
  DISCREPANCY_LEGEND,
  DISCREPANCY_MARK,
  discrepancyLabel,
  everyoneAsked,
  NOBODY_ASKED,
  NO_MATCHING_PEOPLE,
  NOT_DISPATCHED_NO_CHANNEL,
  NOTHING,
  presenceLabel,
  TABLE_HEADINGS,
  WHATSAPP_UNRESPONSIVE,
} from "./presentation";
import { RecordAnswerControl } from "./record-answer";

/**
 * The participation table, at whichever tier is reading — W7's centre.
 *
 * ## One component, two tiers
 *
 * `participation.tier` decides whether the **Delivery** column exists, and
 * that is the only difference between the two renderings (D3). It is read from
 * the payload rather than passed as a prop, so a caller cannot ask for the
 * operator's table while holding the club-link tier's data — the club-link
 * rows have no `delivery` field for it to print.
 *
 * ## Two presentations, one payload
 *
 * The wide table scrolls inside its own container; below `md` it is replaced by
 * one card per person. Both are rendered from the same filtered, sorted list —
 * the phone is not a subset of the desktop with rows removed, which is what
 * `docs/ux/slice-ux.md` means by responsive reflow never removing required
 * information.
 *
 * ## Sorting is a link
 *
 * Every heading is an anchor carrying every current filter, so the table works
 * with scripting disabled, the back button undoes a sort, and a sorted view is
 * something an operator can send to somebody. `participationSortHref` builds
 * it; `participation-view.test.ts` proves it keeps the filters.
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
  }).format(when);
}

function AnswerChip({ person }: { person: ParticipationPerson }) {
  const label = answerLabel(person);
  if (label === NOTHING) {
    return (
      <Typography component="span" variant="body2" color="text.secondary">
        {NOTHING}
      </Typography>
    );
  }
  return <StatusChip domain="rsvp" status={person.answer ?? "none"} label={label} />;
}

/**
 * The Answer cell's whole story — W3, LAN-170.
 *
 * OWNER-LAN170-05 (correction round 3): `RecordAnswerControl` replaces the
 * chip entirely on a row it offers itself against — it never stacks beside
 * it. Brian: stacking a "No answer" chip above a control in one narrow cell
 * "tries to fit the button there in some way," and the absence of an answer
 * chip is itself the signal that there is no answer, so every cell in this
 * column holds exactly one element. A row the control is not offered against
 * — because it already carries an answer, is a walk-up, or the reader is not
 * an operator — is unaffected and still renders the chip exactly as before.
 * It renders only for an operator, only against a real invitation (never a
 * walk-up, who was never asked), and only where `answer` is `null` — a row
 * that already carries an answer never gets it, which is the whole of
 * "superseding is out of scope" enforced at the surface that offers the
 * control at all.
 */
function AnswerCell({
  operator,
  event,
  person,
  questions,
}: {
  operator: boolean;
  event: Pick<EventFactsBase, "id" | "name" | "scheduledOn" | "startsAt" | "endsAt">;
  person: ParticipationPerson;
  questions: readonly ParticipationQuestion[];
}) {
  const invitationId = operator
    ? ((person as OperatorParticipationPerson).invitationId ?? null)
    : null;
  const offerRecording = operator && person.answer === null && !person.isWalkUp && invitationId;

  if (offerRecording) {
    return (
      <RecordAnswerControl
        event={event}
        invitationId={invitationId}
        displayName={person.displayName}
        questions={questions}
      />
    );
  }

  return <AnswerChip person={person} />;
}

function AttendanceChip({ presence }: { presence: AttendancePresence | null }) {
  if (presence === null) {
    return (
      <Typography component="span" variant="body2" color="text.secondary">
        {presenceLabel(null)}
      </Typography>
    );
  }
  return <StatusChip domain="attendance" status={presence} label={presenceLabel(presence)} />;
}

/**
 * The Delivery cell's own label and colour, once W6's two named exceptions to
 * the plain five-state vocabulary are applied — `REQ-no-channel-backstop` and
 * `REQ-whatsapp-outage-visible`. Both replace what would otherwise read as an
 * undifferentiated **Failed** chip; neither changes `person.delivery` itself,
 * which stays the provider-neutral state `docs/ux/standards.md` rule 7 shares
 * with the delivery screen.
 */
function deliveryChipLabel(person: OperatorParticipationPerson, state: string): string {
  if (person.noUsableRoute) return NOT_DISPATCHED_NO_CHANNEL;
  if (person.whatsappUnresponsive) return WHATSAPP_UNRESPONSIVE;
  return DELIVERY_LABELS[state] ?? state;
}

function DeliveryCell({
  person,
  isWalkUp,
}: {
  person: OperatorParticipationPerson;
  isWalkUp: boolean;
}) {
  const state = person.delivery ?? null;
  // W157-F7. "Nothing queued" is a statement about delivering an invitation,
  // and a walk-up was never invited — there is no invitation whose delivery
  // could be queued or not. Every other empty cell in a walk-up's row reads
  // "—", and the approved mockup gives this one "—" too.
  if (isWalkUp) {
    return (
      <Typography component="span" variant="body2" color="text.secondary">
        {NOTHING}
      </Typography>
    );
  }
  if (state === null) {
    return (
      <Typography component="span" variant="body2" color="text.secondary">
        {DELIVERY_NOT_QUEUED}
      </Typography>
    );
  }
  return (
    <Stack spacing={0.25} sx={{ alignItems: "flex-start" }}>
      <StatusChip domain="delivery" status={state} label={deliveryChipLabel(person, state)} />
      {/*
        W4's chase position — the rung already sent and the next one due, or
        Chase stopped / Escalated to the President. `null` for an answered row,
        a walk-up, or anybody `noUsableRoute` already explains.
      */}
      {person.chasePosition ? (
        <Typography variant="caption" color="text.secondary" data-testid="chase-position">
          {person.chasePosition}
        </Typography>
      ) : null}
    </Stack>
  );
}

/** The `≠` beside a name, carrying what the two records actually say. */
function DiscrepancyMark({ person }: { person: ParticipationPerson }) {
  const label = discrepancyLabel(person.discrepancy);
  if (label === null) return null;
  return (
    <Box
      component="span"
      title={label}
      aria-label={label}
      data-discrepancy={person.discrepancy}
      sx={{ ml: 0.75, color: "warning.dark", fontWeight: 700 }}
    >
      {DISCREPANCY_MARK}
    </Box>
  );
}

// Kept as an export for the follow-ups queue; the kit owns the markup.
export { SortableHeader as SortableColumnHeading } from "@/components/sortable-header";

function SortableHeading({
  basePath,
  filters,
  column,
  label,
}: {
  basePath: string;
  filters: ParticipationFilters;
  column: string;
  label: string;
}) {
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
}

function questionAnswer(person: ParticipationPerson, question: ParticipationQuestion): string {
  return person.answers[question.id] ?? NOTHING;
}

export function ParticipationTable({
  basePath,
  participation,
  filters,
}: {
  /** Where the sort links point — `/operate/events/<id>` or `/e/<token>`. */
  basePath: string;
  participation: Participation;
  filters: ParticipationFilters;
}) {
  const operator = participation.tier === "operator";
  const { questions } = participation;
  const people = applyParticipationView(participation.people, filters, questions);
  const total = participation.people.length;
  // Common to both tiers' event-facts shape (`EventFactsBase`) — LAN-170's
  // recording dialog needs the event's identity (OWNER-LAN170-09: `id`, and
  // now `name`/`scheduledOn`/`startsAt`/`endsAt` for its subtitle) and the
  // table otherwise never reads any of it.
  const event = participation.event;

  return (
    <Box data-testid="participation-table" data-tier={participation.tier}>
      <Section title={everyoneAsked(total)} titleTestId="participation-total">
        <Typography variant="body2" color="text.secondary">
          {DISCREPANCY_LEGEND}
        </Typography>

        {total === 0 ? (
          <EmptyState title={NOBODY_ASKED} testId="participation-empty" />
        ) : people.length === 0 ? (
          <EmptyState title={NO_MATCHING_PEOPLE} testId="participation-no-matches" />
        ) : (
          <>
            <RowCardList>
              {people.map((person) => (
                <Box key={person.key} data-testid="participation-card" data-person={person.key}>
                  <RowCard
                    title={
                      <>
                        {person.displayName}
                        <DiscrepancyMark person={person} />
                      </>
                    }
                    trailing={capacityLabel(person)}
                    sublines={[
                      <FactGrid key="facts">
                        <Fact
                          label={TABLE_HEADINGS.answer}
                          value={
                            <AnswerCell
                              operator={operator}
                              event={event}
                              person={person}
                              questions={questions}
                            />
                          }
                        />
                        <Fact
                          label={TABLE_HEADINGS.attendance}
                          value={<AttendanceChip presence={person.presence} />}
                        />
                        {operator ? (
                          <Fact
                            label={TABLE_HEADINGS.delivery}
                            value={
                              <DeliveryCell
                                person={person as OperatorParticipationPerson}
                                isWalkUp={person.isWalkUp}
                              />
                            }
                          />
                        ) : null}
                        <Fact label={TABLE_HEADINGS.invited} value={formatWhen(person.invitedAt)} />
                        {person.reason ? (
                          <Fact label={TABLE_HEADINGS.reason} value={person.reason} />
                        ) : null}
                        {questions.map((question) => (
                          <Box key={question.id} data-question={question.id}>
                            <Fact
                              label={question.prompt}
                              value={person.answers[question.id] ?? null}
                            />
                          </Box>
                        ))}
                      </FactGrid>,
                    ]}
                  />
                </Box>
              ))}
            </RowCardList>

            {/* Desktop: the full table, scrolling inside its own container. */}
            <DesktopOnly>
              <TableFrame>
                <Table size="small" sx={{ minWidth: operator ? 1080 : 940 }}>
                  <TableHead>
                    <TableRow>
                      <SortableHeading
                        basePath={basePath}
                        filters={filters}
                        column="name"
                        label={TABLE_HEADINGS.name}
                      />
                      <SortableHeading
                        basePath={basePath}
                        filters={filters}
                        column="capacity"
                        label={TABLE_HEADINGS.capacity}
                      />
                      <SortableHeading
                        basePath={basePath}
                        filters={filters}
                        column="invited"
                        label={TABLE_HEADINGS.invited}
                      />
                      {operator ? (
                        <SortableHeading
                          basePath={basePath}
                          filters={filters}
                          column="delivery"
                          label={TABLE_HEADINGS.delivery}
                        />
                      ) : null}
                      <SortableHeading
                        basePath={basePath}
                        filters={filters}
                        column="answer"
                        label={TABLE_HEADINGS.answer}
                      />
                      <SortableHeading
                        basePath={basePath}
                        filters={filters}
                        column="reason"
                        label={TABLE_HEADINGS.reason}
                      />
                      <SortableHeading
                        basePath={basePath}
                        filters={filters}
                        column="attendance"
                        label={TABLE_HEADINGS.attendance}
                      />
                      {questions.map((question) => (
                        <SortableHeading
                          key={question.id}
                          basePath={basePath}
                          filters={filters}
                          column={`q:${question.id}`}
                          label={question.prompt}
                        />
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {people.map((person) => (
                      <TableRow
                        key={person.key}
                        data-testid="participation-row"
                        data-person={person.key}
                      >
                        <TableCell>
                          <Typography variant="body2" component="span" sx={{ fontWeight: 700 }}>
                            {person.displayName}
                          </Typography>
                          <DiscrepancyMark person={person} />
                        </TableCell>
                        <TableCell>{capacityLabel(person)}</TableCell>
                        <TableCell>{formatWhen(person.invitedAt)}</TableCell>
                        {operator ? (
                          <TableCell data-testid="delivery-cell">
                            <DeliveryCell
                              person={person as OperatorParticipationPerson}
                              isWalkUp={person.isWalkUp}
                            />
                          </TableCell>
                        ) : null}
                        <TableCell>
                          <AnswerCell
                            operator={operator}
                            event={event}
                            person={person}
                            questions={questions}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            {person.reason ?? NOTHING}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <AttendanceChip presence={person.presence} />
                        </TableCell>
                        {questions.map((question) => (
                          <TableCell key={question.id} data-question={question.id}>
                            {questionAnswer(person, question)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableFrame>
            </DesktopOnly>
          </>
        )}
      </Section>
    </Box>
  );
}
