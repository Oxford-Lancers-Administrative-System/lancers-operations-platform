import Box from "@mui/material/Box";
import { StatusChip } from "@/components/status-chip";
import { Section } from "@/components/section";
import { Fact, FactGrid, NotRecorded } from "@/components/fact";
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
import type { ReactNode } from "react";

import type { AttendancePresence } from "@/lib/services/attendance-vocabulary";
import {
  answerGroupOf,
  applyParticipationView,
  groupByAnswer as groupedByAnswer,
  participationSortHref,
  participationSortState,
  type EventFactsBase,
  type OperatorParticipationPerson,
  type Participation,
  type ParticipationFilters,
  type ParticipationPerson,
  type ParticipationQuestion,
} from "@/lib/services/participation-view";
import { questionAppliesToCapacity } from "@/lib/services/question-applicability";

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
  NOT_DELIVERED,
  NOT_DISPATCHED_NO_CHANNEL,
  NOTHING,
  presenceLabel,
  REMINDERS_STOPPED,
  TABLE_HEADINGS,
  WHATSAPP_UNRESPONSIVE,
} from "./presentation";
import { RecordAnswerControl } from "./record-answer";

/**
 * The participation table, at whichever tier is reading — W7's centre.
 * `participation.tier` decides whether Delivery exists (D3), read from the
 * payload, not a prop — a caller cannot ask for the operator's table while
 * holding club-link data. Desktop table and phone cards render from the same
 * filtered, sorted list. Every heading is a link carrying every filter, so
 * sorting works with scripting disabled.
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
 * The Answer cell — W3, LAN-170. OWNER-LAN170-05: `RecordAnswerControl`
 * replaces the chip entirely, never stacks beside it (Brian: a chip above a
 * control "tries to fit the button there in some way"). Only for an
 * operator, only a real invitation, only where `answer` is `null`.
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
  const operatorPerson = operator ? (person as OperatorParticipationPerson) : null;
  const invitationId = operatorPerson?.invitationId ?? null;
  // LAN-376. `person.answer === null` used to be a condition of offering the
  // control at all, because the service refused an operator recording over a
  // player's own answer. Brian reversed that on 2026-09-16: the last recorded
  // answer wins whoever recorded it, so an answered row is offered the same
  // control — wearing its own answer chip, never stacked beside one.
  const offerRecording = operator && !person.isWalkUp && invitationId;

  if (offerRecording) {
    return (
      <RecordAnswerControl
        event={event}
        invitationId={invitationId}
        displayName={person.displayName}
        current={
          person.answer === null
            ? null
            : { answer: person.answer, answeredAt: operatorPerson?.answeredAt ?? null }
        }
        // LAN-339: only the questions this invitation's capacity is ever asked —
        // a recruit is asked Yes or No and nothing more, so the dialog offers an
        // operator nothing to record on their behalf either.
        questions={questions.filter((question) =>
          questionAppliesToCapacity(question.appliesToCapacities, person.capacity),
        )}
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

/** The Delivery cell's label, once W6's two exceptions (`REQ-no-channel-backstop`, `REQ-whatsapp-outage-visible`) replace an undifferentiated Failed. */
function deliveryChipLabel(person: OperatorParticipationPerson, state: string): string {
  if (person.noUsableRoute) return NOT_DISPATCHED_NO_CHANNEL;
  if (person.whatsappUnresponsive) return WHATSAPP_UNRESPONSIVE;
  // LAN-411: over Attempted, and ranked below both of the above.
  if (person.notDelivered) return NOT_DELIVERED;
  // LAN-296's exception: what was cancelled was this person's reminders, and
  // the bare word could equally have meant the invitation or the event.
  if (person.remindersStopped) return REMINDERS_STOPPED;
  return DELIVERY_LABELS[state] ?? state;
}

/**
 * Which chip style the Delivery cell draws — LAN-411.
 *
 * The state's own, as it always was, except for **Not delivered**: that reads
 * over **Attempted**, whose style is the plain informational one, and the
 * whole point of the label is that it is worth a reader's attention. The two
 * older exceptions are left exactly as they were, drawing **Failed**'s style
 * under their own words.
 */
function deliveryChipStatus(person: OperatorParticipationPerson, state: string): string {
  return person.notDelivered ? "not_delivered" : state;
}

function DeliveryCell({
  person,
  isWalkUp,
}: {
  person: OperatorParticipationPerson;
  isWalkUp: boolean;
}) {
  const state = person.delivery ?? null;
  // W157-F7: a walk-up was never invited, so "Nothing queued" doesn't apply — reads "—" like the row's other empty cells.
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
      <StatusChip
        domain="delivery"
        status={deliveryChipStatus(person, state)}
        label={deliveryChipLabel(person, state)}
      />
      {/* W4's chase position — null for an answered row, walk-up, or anybody `noUsableRoute` already explains. */}
      {person.chasePosition ? (
        <Typography variant="caption" color="text.secondary" data-testid="chase-position">
          {person.chasePosition}
        </Typography>
      ) : null}
      {/*
        LAN-296, widened by LAN-341. The club's own recorded reason for the
        cancellation, whatever it was, beneath the chip. A cancellation nothing
        recorded a reason for still reads as the bare state, because there is
        nothing to say about it.
      */}
      {person.cancelledReason ? (
        <Typography variant="caption" color="text.secondary" data-testid="cancelled-reason">
          {person.cancelledReason}
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

/**
 * One label and its value, side by side — LAN-439's phone row. The label sits
 * directly before the value (R157C-B5), in the caption size, so several facts
 * share a line and wrap only when the phone runs out of width.
 */
function InlineFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box
      sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, minWidth: 0 }}
      data-testid="fact"
      data-label={label}
    >
      <Typography component="dt" variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Box component="dd" sx={{ m: 0, minWidth: 0 }}>
        {children}
      </Box>
    </Box>
  );
}

function questionAnswer(person: ParticipationPerson, question: ParticipationQuestion): string {
  return person.answers[question.id] ?? NOTHING;
}

export function ParticipationTable({
  basePath,
  participation,
  filters,
  mayRecordAnswer = true,
  groupByAnswer = false,
  dense = false,
}: {
  /** Where the sort links point — `/operate/events/<id>` or `/e/<token>`. */
  basePath: string;
  participation: Participation;
  filters: ParticipationFilters;
  /** LAN-431: Manage on the event's template. Under View the Answer cell reads as the answer. */
  mayRecordAnswer?: boolean;
  /** LAN-439: the event page reads Yes, then No, then No response, at every width. */
  groupByAnswer?: boolean;
  /** LAN-439: compact phone rows — every fact kept, several to a line. */
  dense?: boolean;
}) {
  const operator = participation.tier === "operator";
  const recording = operator && mayRecordAnswer;
  const { questions } = participation;
  const sorted = applyParticipationView(participation.people, filters, questions);
  const people = groupByAnswer ? groupedByAnswer(sorted) : sorted;
  const total = participation.people.length;
  // `EventFactsBase`: LAN-170's recording dialog needs the event's identity (OWNER-LAN170-09), otherwise unread here.
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
            <RowCardList dense={dense}>
              {people.map((person) => (
                <Box
                  key={person.key}
                  data-testid="participation-card"
                  data-person={person.key}
                  data-answer-group={answerGroupOf(person)}
                >
                  <RowCard
                    dense={dense}
                    title={
                      <>
                        {person.displayName}
                        <DiscrepancyMark person={person} />
                      </>
                    }
                    trailing={capacityLabel(person)}
                    sublines={[
                      dense ? (
                        <Box
                          key="facts"
                          component="dl"
                          sx={{
                            m: 0,
                            display: "flex",
                            flexWrap: "wrap",
                            alignItems: "center",
                            columnGap: 1.5,
                            rowGap: 0.25,
                          }}
                        >
                          <InlineFact label={TABLE_HEADINGS.answer}>
                            <AnswerCell
                              operator={recording}
                              event={event}
                              person={person}
                              questions={questions}
                            />
                          </InlineFact>
                          <InlineFact label={TABLE_HEADINGS.attendance}>
                            <AttendanceChip presence={person.presence} />
                          </InlineFact>
                          {operator ? (
                            <InlineFact label={TABLE_HEADINGS.delivery}>
                              <DeliveryCell
                                person={person as OperatorParticipationPerson}
                                isWalkUp={person.isWalkUp}
                              />
                            </InlineFact>
                          ) : null}
                          <InlineFact label={TABLE_HEADINGS.invited}>
                            <Typography variant="body2" component="span">
                              {formatWhen(person.invitedAt)}
                            </Typography>
                          </InlineFact>
                          {person.reason ? (
                            <InlineFact label={TABLE_HEADINGS.reason}>
                              <Typography variant="body2" component="span">
                                {person.reason}
                              </Typography>
                            </InlineFact>
                          ) : null}
                          {questions.map((question) => (
                            <Box key={question.id} data-question={question.id} sx={{ minWidth: 0 }}>
                              <InlineFact label={question.prompt}>
                                {person.answers[question.id] ? (
                                  <Typography variant="body2" component="span">
                                    {person.answers[question.id]}
                                  </Typography>
                                ) : (
                                  <NotRecorded />
                                )}
                              </InlineFact>
                            </Box>
                          ))}
                        </Box>
                      ) : (
                        <FactGrid key="facts">
                          <Fact
                            label={TABLE_HEADINGS.answer}
                            value={
                              <AnswerCell
                                operator={recording}
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
                          <Fact
                            label={TABLE_HEADINGS.invited}
                            value={formatWhen(person.invitedAt)}
                          />
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
                        </FactGrid>
                      ),
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
                        data-answer-group={answerGroupOf(person)}
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
                            operator={recording}
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
