import Link from "next/link";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TableSortLabel from "@mui/material/TableSortLabel";
import Typography from "@mui/material/Typography";

import type { AttendancePresence } from "@/lib/services/attendance-vocabulary";
import {
  applyParticipationView,
  participationSortHref,
  participationSortState,
  type OperatorParticipationPerson,
  type Participation,
  type ParticipationFilters,
  type ParticipationPerson,
  type ParticipationQuestion,
} from "@/lib/services/participation-view";

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
  NOBODY_ASKED,
  NO_MATCHING_PEOPLE,
  NOTHING,
  presenceLabel,
  SORTABLE_NOTE,
  TABLE_HEADINGS,
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

const PRESENCE_COLOURS: Readonly<
  Record<AttendancePresence, "default" | "success" | "warning" | "error">
> = Object.freeze({
  present: "success",
  late: "warning",
  excused: "default",
  absent: "error",
});

function AnswerChip({ person }: { person: ParticipationPerson }) {
  const label = answerLabel(person);
  if (label === NOTHING) {
    return (
      <Typography component="span" variant="body2" color="text.secondary">
        {NOTHING}
      </Typography>
    );
  }
  return (
    <Chip
      size="small"
      label={label}
      color={label === ANSWER_YES ? "success" : label === ANSWER_NO ? "error" : "default"}
      variant={label === ANSWER_YES || label === ANSWER_NO ? "filled" : "outlined"}
    />
  );
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
  eventId,
  person,
  questions,
}: {
  operator: boolean;
  eventId: string;
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
        eventId={eventId}
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
  return <Chip size="small" label={presenceLabel(presence)} color={PRESENCE_COLOURS[presence]} />;
}

function DeliveryCell({ state, isWalkUp }: { state: string | null; isWalkUp: boolean }) {
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
  const label = DELIVERY_LABELS[state] ?? state;
  return (
    <Chip
      size="small"
      label={label}
      color={state === "delivered" ? "success" : state === "failed" ? "error" : "default"}
    />
  );
}

/**
 * R157C-B5. A label in front of a mobile-card value, so a bare "Nothing
 * queued" or "Not recorded" says which fact it is answering.
 *
 * The desktop table gets this for free from its column headers; the card has
 * no headers, so each value that is not already self-evident from its
 * position (name, capacity, the dated "Invitation sent" line) carries its
 * `TABLE_HEADINGS` string instead — the same word the desktop column uses,
 * never a second vocabulary invented for the card. Follows the events list's
 * "Invited 47 · Said yes 33 · Showed — / 47" pattern
 * (`src/app/operate/events/operator-list.tsx`): a small secondary-coloured
 * label immediately before the value.
 */
function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
      <Typography component="span" variant="caption" color="text.secondary">
        {label}
      </Typography>
      {children}
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
    <TableCell sortDirection={active ? direction : false}>
      <Link
        href={participationSortHref(basePath, filters, column)}
        data-sort={column}
        style={{ color: "inherit", textDecoration: "none" }}
        // R157C-B1. Sorting re-orders the rows already on screen; it must not
        // bounce the reader to the top of a table they are part-way down.
        // `scroll={false}` is Next.js's own scroll-restoration control for
        // `<Link>`, and the href above still carries every filter, so the URL
        // stays the source of truth for the view.
        scroll={false}
      >
        {/* `component="span"`: TableSortLabel renders a button by default, and a
            button inside an anchor is invalid HTML that browsers repair
            unpredictably. */}
        <TableSortLabel active={active} direction={direction} component="span">
          {label}
        </TableSortLabel>
      </Link>
    </TableCell>
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
  // Common to both tiers' event-facts shape (`EventFactsBase.id`) — LAN-170's
  // recording dialog needs it and the table otherwise never reads it.
  const eventId = participation.event.id;

  return (
    <Paper variant="outlined" data-testid="participation-table" data-tier={participation.tier}>
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
        <Typography variant="overline" data-testid="participation-total">
          {everyoneAsked(total)}
        </Typography>
        {/*
          W157-F6. "Sortable on every column" is desktop-only copy: below `md`
          this component renders one card per person, with no columns and no
          sort control, and the sentence described a capability the phone does
          not have. The discrepancy legend is not hidden with it — the `≠` is
          beside the name on the card too, so the legend still explains
          something the reader can see.

          **R157C-A5, two corrections to that.**

          The paragraph above claimed the legend survives because the `≠` is on
          the card too. True of the *mark*, which `DiscrepancyMark` renders on
          every row at every tier and every width — and not true of the
          *legend*, which was gated `operator ? … : null`. So a coach opening
          `/e/<token>` on a phone met `≠` beside a player's name with nothing on
          the page saying what it meant. The legend now renders at both tiers,
          because the thing it defines does.

          That is conformance rather than widening: the ticket contract names
          the discrepancy marker as a property of the table and names exactly
          one tier difference, the delivery column.

          And the wrapper no longer renders empty. At club tier below `md` the
          hidden span held the only content and the legend was `null`, leaving
          an empty `<p>` still taking its slot in a spaced `Stack`. There is now
          always content, so there is no empty case left to guard.
        */}
        <Typography variant="body2" color="text.secondary">
          <Box
            component="span"
            data-testid="sortable-note"
            sx={{ display: { xs: "none", md: "inline" } }}
          >
            {SORTABLE_NOTE}
            {" · "}
          </Box>
          {DISCREPANCY_LEGEND}
        </Typography>
      </Stack>

      {total === 0 ? (
        <Typography sx={{ p: 2 }} color="text.secondary" data-testid="participation-empty">
          {NOBODY_ASKED}
        </Typography>
      ) : people.length === 0 ? (
        <Typography sx={{ p: 2 }} color="text.secondary" data-testid="participation-no-matches">
          {NO_MATCHING_PEOPLE}
        </Typography>
      ) : (
        <>
          {/*
            Phone: one card per person.

            No `divider` prop. MUI v9's `Stack` divider **throws during server
            rendering** — "Element type is invalid … got: undefined" — and the
            page then recovers on the client, so it looks fine in a browser and
            returns 500 to anything that reads the status. `next build` compiled
            it and every jsdom test rendered it; only loading the real page
            caught it. The separators are borders on the cards instead.
          */}
          <Stack sx={{ display: { xs: "flex", md: "none" } }}>
            {people.map((person) => (
              <Box
                key={person.key}
                data-testid="participation-card"
                data-person={person.key}
                sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: "divider" }}
              >
                <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between" }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {person.displayName}
                    <DiscrepancyMark person={person} />
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {capacityLabel(person)}
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={1.25} sx={{ mt: 0.5, flexWrap: "wrap", gap: 0.75 }}>
                  <LabeledField label={TABLE_HEADINGS.answer}>
                    <AnswerCell
                      operator={operator}
                      eventId={eventId}
                      person={person}
                      questions={questions}
                    />
                  </LabeledField>
                  <LabeledField label={TABLE_HEADINGS.attendance}>
                    <AttendanceChip presence={person.presence} />
                  </LabeledField>
                  {operator ? (
                    <LabeledField label={TABLE_HEADINGS.delivery}>
                      <DeliveryCell
                        state={(person as OperatorParticipationPerson).delivery ?? null}
                        isWalkUp={person.isWalkUp}
                      />
                    </LabeledField>
                  ) : null}
                </Stack>
                {person.reason ? (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {person.reason}
                  </Typography>
                ) : null}
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {TABLE_HEADINGS.invited}: {formatWhen(person.invitedAt)}
                </Typography>
                {questions.map((question) => (
                  <Typography
                    key={question.id}
                    variant="body2"
                    color="text.secondary"
                    data-question={question.id}
                  >
                    {question.prompt} {questionAnswer(person, question)}
                  </Typography>
                ))}
              </Box>
            ))}
          </Stack>

          {/* Desktop: the full table, scrolling inside its own container. */}
          <Box sx={{ display: { xs: "none", md: "block" }, overflowX: "auto" }}>
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
                          state={(person as OperatorParticipationPerson).delivery ?? null}
                          isWalkUp={person.isWalkUp}
                        />
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <AnswerCell
                        operator={operator}
                        eventId={eventId}
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
          </Box>
        </>
      )}
    </Paper>
  );
}
