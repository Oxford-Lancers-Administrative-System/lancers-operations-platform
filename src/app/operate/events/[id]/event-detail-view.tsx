import { Notice } from "@/components/notice";
import { Fact, FactGrid, FactList } from "@/components/fact";
import { Metric, MetricRow } from "@/components/metric";
import { Section } from "@/components/section";
import { PageHeader } from "@/components/page-header";
import { StatusChip } from "@/components/status-chip";
import { OutcomeSlotProvider, ArrivalNotice } from "@/components/outcome-slot";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { derivedEventState, type EventDetail, type EventQuestion } from "@/lib/services/events";
import { todayInClubZone } from "@/lib/club-time";
import {
  isRegisterAvailable,
  registerOpensAt,
  type AttendanceSummary,
} from "@/lib/services/attendance";
import type { AudienceMember } from "@/lib/services/event-approval";
import type { FrozenMessagingPlan } from "@/lib/services/messaging-schedule";
import type { AudienceGroupSummary } from "@/lib/services/audience-selection";
import type { EventChangeEntry } from "@/lib/services/event-amendment";
import type {
  OperatorParticipation,
  ParticipationFilters,
} from "@/lib/services/participation-view";
import { ParticipationFilterBar } from "../../../participation/participation-filters";
import { ParticipationTable } from "../../../participation/participation-table";
import { QuestionCounts } from "../../../participation/question-counts";
import { SHARE_LINK } from "../../../participation/presentation";
import { SharePanel } from "./share-panel";
import DeleteDraft from "./delete-draft";
import { frozenPlanForDisplay, MessagingPlanDisclosure } from "./messaging-plan";
import { ApprovedEventActions, CancelledPanel, ChangeHistoryPanel } from "./change-panels";
import RenotifyPanel from "./renotify-panel";
import { silentChangeNotice } from "./change-presentation";
import { AudienceList } from "./audience-list";
import { QuestionList } from "./question-list";
import {
  APPROVED_HEADLINE,
  APPROVED_NOTHING_SENT_YET,
  AUDIENCE_FROZEN_AT_APPROVAL,
  DELIVERY_MODE_LABELS,
  DERIVED_STATE_LABELS,
  describeAttendance,
  countDeliveryStates,
  describeDistribution,
  DUPLICATE_ACTION,
  formatDetailWhen,
  formatTermAndWeek,
  isPreApproval,
  JOINING_LINK_LABEL,
  JOINING_URL_IS_PUBLIC_WARNING,
  labelFor,
  NO_AUDIENCE_YET,
  NO_DISTRIBUTION_DETAIL,
  NO_DISTRIBUTION_HEADLINE,
  PLAN_MISSING_HEADLINE,
  PLAN_MISSING_NOTE,
  QUESTIONS_HEADLINE,
  STATUS_LABELS,
  venueLabel,
} from "../presentation";
import {
  ATTENDANCE_OPEN_DETAIL,
  describeRegisterOpensAt,
  formatShowedAgainstInvited,
  HEADLINE_INVITED_LABEL,
  HEADLINE_SAID_YES_LABEL,
  HEADLINE_SHOWED_LABEL,
  REGISTER_NOT_YET_HEADLINE,
} from "./attendance/presentation";

/**
 * The three headline numbers — REQ-headline-numbers, D62, D73 and D74. LAN-152.
 *
 * **Invited · Said yes · Showed**, at the top of the event page and large,
 * because they are the primary operational facts about an event and the build
 * rendered them nowhere. Everything else on this page is administration; this
 * is what somebody opened it to find out.
 *
 * ## Three deliberate absences
 *
 * **No percentages.** D62 asks for raw pairs. `20 / 37` is the fact; `54%` is
 * the fact with both of the numbers the club wanted removed from it.
 *
 * **No sentence explaining the dash.** `Showed` reads `— / 37` until a register
 * has been saved and `0 / 37` afterwards, and the packet is explicit that the
 * application explains neither in words: "explanatory text about washouts
 * belongs in a review artifact, not in the product". The two values carry it.
 *
 * **No judgment.** Nothing here is coloured, flagged or compared against a
 * target. A quiet Tuesday in fifth week is a fact about the term, not a
 * failing, and a screen that decided otherwise would be inventing a club
 * policy nobody has agreed.
 */
function HeadlineNumbers({ summary }: { summary: AttendanceSummary }) {
  return (
    <MetricRow columns={3} testId="headline-numbers">
      <Metric
        value={String(summary.invited)}
        label={HEADLINE_INVITED_LABEL}
        testId="headline-invited"
      />
      <Metric
        value={String(summary.saidYes)}
        label={HEADLINE_SAID_YES_LABEL}
        testId="headline-said-yes"
      />
      <Metric
        value={formatShowedAgainstInvited(summary)}
        label={HEADLINE_SHOWED_LABEL}
        testId="headline-showed"
      />
    </MetricRow>
  );
}

/**
 * The register, and whether it is open yet.
 *
 * D71 opens it on a buffer before the event starts and D72 never closes it, so
 * this panel has one question to answer and it is the clock's. Nobody is asked
 * to decide anything here, and there is nothing to confirm.
 *
 * `isRegisterAvailable` is the same function the register itself calls, with
 * `registerSaved` taken off the headline numbers this page has already read.
 * `docs/ux/standards.md` rule 7 is why it has to be the same one: this panel
 * offering **Attendance** beside a register that then says "not open yet" is
 * two screens answering one question two ways, and it is what the LAN-152
 * browser preflight found.
 */
function RegisterPanel({ event, registerSaved }: { event: EventDetail; registerSaved: boolean }) {
  const available = isRegisterAvailable(event, registerSaved);

  return (
    <Section
      title={available ? "Attendance is open" : REGISTER_NOT_YET_HEADLINE}
      testId="register-panel"
    >
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          {available
            ? ATTENDANCE_OPEN_DETAIL
            : describeRegisterOpensAt(registerOpensAt(event)?.toISOString() ?? null)}
        </Typography>

        {available ? (
          <Box>
            <Button
              variant="contained"
              href={`/operate/events/${event.id}/attendance`}
              sx={{ minHeight: 44 }}
              data-testid="open-attendance"
            >
              Attendance
            </Button>
          </Box>
        ) : null}
      </Stack>
    </Section>
  );
}

/** UX-32 — the event itself, in whatever state it is in. */
export function EventDetailView({
  event,
  mayManage,
  mayApprove,
  mayAdministerDelivery,
  justApproved,
  audience,
  audienceGroupSummary,
  questions,
  summary,
  history,
  participation,
  participationFilters,
  share,
  frozenPlan,
}: {
  event: EventDetail;
  mayManage: boolean;
  mayApprove: boolean;
  mayAdministerDelivery: boolean;
  justApproved: boolean;
  audience: AudienceMember[];
  /** D3 (round 2). `null` whenever `audience` is not about to be listed by name. */
  audienceGroupSummary: AudienceGroupSummary | null;
  questions: EventQuestion[];
  summary: AttendanceSummary | null;
  history: readonly EventChangeEntry[];
  /** `null` until approval creates invitations — invariant P1. */
  participation: OperatorParticipation | null;
  participationFilters: ParticipationFilters;
  /** `null` unless the operator opened **Share link**. */
  share: { url: string | null; blockedReason: string | null; errorRule: string | null } | null;
  /** LAN-171. Non-null exactly when the event is approved. */
  frozenPlan: FrozenMessagingPlan | null;
}) {
  const preApproval = isPreApproval(event.status);
  // W5-04's recovery path is offered exactly where it is needed: the last
  // amendment went out to nobody, and there is somebody to tell. Offering it
  // after a change that already notified would be a button whose press means
  // "send that again", which nobody asked for.
  const lastAmendment = history.find((entry) => entry.kind === "amended") ?? null;
  const changeWentOutSilently =
    event.status === "approved" &&
    lastAmendment !== null &&
    lastAmendment.notified === false &&
    event.invitationCount > 0;
  const cancellation = history.find((entry) => entry.kind === "cancelled") ?? null;
  const proposed = event.status === "draft" && audience.length > 0;
  // LAN-243. Counted from the very rows the participation table below is about
  // to draw, so the Distribution note and the Delivered chips are one reading
  // of one set of rows rather than two that can — and did — contradict.
  const deliveryCounts = countDeliveryStates(participation);
  // D30, derived and never stored. Shown beside the stored status rather than
  // instead of it: "Approved" and "Occurred" answer different questions.
  const derived = derivedEventState(event, todayInClubZone());

  return (
    <OutcomeSlotProvider>
      <Stack
        spacing={3}
        sx={{ maxWidth: 1200 }}
        data-testid="event-detail"
        data-status={event.status}
      >
        <PageHeader
          title={event.name}
          eyebrow={event.templateName}
          back={{ href: "/operate/events", label: "Back to events" }}
          subtitle={<span data-testid="event-subtitle">{formatDetailWhen(event)}</span>}
          status={
            <Stack direction="row" spacing={0.75}>
              <StatusChip
                domain="event"
                status={event.status}
                label={labelFor(STATUS_LABELS, event.status)}
              />
              {event.status === "approved" ? (
                <StatusChip
                  domain="event"
                  status={derived}
                  label={labelFor(DERIVED_STATE_LABELS, derived)}
                />
              ) : null}
            </Stack>
          }
          actions={
            mayManage && event.status !== "draft" ? (
              <Button
                variant="outlined"
                href={`/operate/events/${event.id}?share=1`}
                data-testid="share-link-button"
              >
                {SHARE_LINK}
              </Button>
            ) : undefined
          }
        />

        {share ? (
          <SharePanel
            eventId={event.id}
            url={share.url}
            blockedReason={share.blockedReason}
            errorRule={share.errorRule}
            closeHref={`/operate/events/${event.id}`}
          />
        ) : null}

        {justApproved && event.status === "approved" ? (
          <ArrivalNotice severity="success" testId="event-approved-note">
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {`${APPROVED_HEADLINE} — ${event.invitationCount} ${
                event.invitationCount === 1 ? "invitation" : "invitations"
              } created`}
            </Typography>
            <Typography variant="body2">{APPROVED_NOTHING_SENT_YET}</Typography>
          </ArrivalNotice>
        ) : null}

        {event.status === "cancelled" ? (
          <CancelledPanel reason={event.decisionReason} entry={cancellation} />
        ) : null}

        {summary ? <HeadlineNumbers summary={summary} /> : null}

        {mayApprove && changeWentOutSilently && lastAmendment ? (
          <RenotifyPanel
            eventId={event.id}
            recipients={event.invitationCount}
            notice={silentChangeNotice(lastAmendment)}
          />
        ) : null}

        {event.status === "approved" ? (
          <RegisterPanel event={event} registerSaved={summary?.registerSaved ?? false} />
        ) : null}

        <Section title="Details">
          <FactGrid>
            <Fact label="Type" value={event.templateName} />
            <Fact label="Where" value={labelFor(DELIVERY_MODE_LABELS, event.deliveryMode)} />
            <Fact
              label={venueLabel(event.deliveryMode)}
              value={event.venue ?? "Not decided yet"}
              testId="venue-fact"
            />
            <Fact
              label="Term / week"
              value={formatTermAndWeek(event.termLabel, event.weekNumber)}
            />
            <Fact label="Attendance" value={describeAttendance(event.isMandatory)} />
            {/* LAN-264. Both are free text the operator typed; a list stays a list. */}
            <Fact
              label="Required equipment"
              value={event.requiredEquipment ?? "Nothing listed"}
              multiline
              testId="equipment-fact"
            />
            {event.description ? (
              <Fact
                label="Description"
                value={event.description}
                multiline
                testId="description-fact"
              />
            ) : null}
            {/*
            LAN-284 reversed REQ-no-joining-url: this link is now published on
            the public event page and carried in the subscription feed. The note
            is the warning, and it belongs here rather than on the public page —
            the operator is the only person who can do anything about it.
          */}
            {event.joiningUrl ? (
              <Fact
                label={JOINING_LINK_LABEL}
                value={event.joiningUrl}
                note={JOINING_URL_IS_PUBLIC_WARNING}
                testId="joining-url-fact"
              />
            ) : null}
            {/*
            A cancelled event's reason is shown by `CancelledPanel`, with the
            sentence that says it is internal and reaches nobody who was
            invited. Showing it here as well would be two surfaces answering
            "why is this off?" — `docs/ux/standards.md` rule 7 — and the one
            without that sentence is the one that reads as publishable.
          */}
            {event.decisionReason && event.status !== "cancelled" ? (
              <Fact label="Reason" value={event.decisionReason} testId="decision-reason" />
            ) : null}
          </FactGrid>
        </Section>

        <Section title="Audience and distribution">
          <FactList>
            <Fact
              layout="inline"
              label="Audience"
              value={
                event.audienceCount === 0
                  ? NO_AUDIENCE_YET
                  : proposed
                    ? `${event.audienceCount} chosen, not yet approved`
                    : `${event.audienceCount} confirmed`
              }
              note={
                event.audienceCount === 0
                  ? undefined
                  : proposed
                    ? "Saved against this draft. Nothing is sent until it is approved."
                    : AUDIENCE_FROZEN_AT_APPROVAL
              }
              testId="audience-fact"
            />
            <Fact
              layout="inline"
              label="Distribution"
              value={event.invitationCount === 0 ? NO_DISTRIBUTION_HEADLINE : "Invitations created"}
              note={
                event.invitationCount === 0
                  ? NO_DISTRIBUTION_DETAIL
                  : describeDistribution(event.invitationCount, event.responseCount, deliveryCounts)
              }
              testId="distribution-fact"
            />
            {/*
            W7: the audience list "becomes the full table". It survives for the
            one state the table cannot describe — a draft whose audience is
            chosen but not yet approved, which has no invitations, no answers
            and no attendance to put in columns (invariant P1).
          */}
          </FactList>
          {audience.length > 0 && participation === null && audienceGroupSummary !== null ? (
            <AudienceList
              audience={audience}
              groupSummary={audienceGroupSummary}
              heading={proposed ? "Who this is for" : "Who was invited"}
              testId="event-audience"
            />
          ) : null}
        </Section>

        {/*
        W1's purpose extends past the review step: once approved, this is what
        was actually committed. Frozen — `REQ-schedule-not-retroactive` — so a
        later change to the club's schedule never rewrites what this page says
        already ran.
      */}
        {frozenPlan ? (
          <MessagingPlanDisclosure
            display={frozenPlanForDisplay(frozenPlan)}
            audienceSize={audience.filter((member) => member.capacity !== "recruit").length}
            recruitAudienceSize={audience.filter((member) => member.capacity === "recruit").length}
            approved
          />
        ) : event.status === "approved" ? (
          <Notice severity="warning" testId="messaging-plan-missing">
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {PLAN_MISSING_HEADLINE}
            </Typography>
            <Typography variant="body2">{PLAN_MISSING_NOTE}</Typography>
          </Notice>
        ) : null}

        {/*
        §4.13. Below the facts and above the actions, because it answers a
        question about the past and the buttons are about the future.
      */}
        {event.status !== "draft" ? <ChangeHistoryPanel entries={history} /> : null}

        {/*
        Amendment W4-A1. The questions are read here and written on the form:
        "it's ingrained in the process, so you separated that inappropriately."
        The RSVP's own first question is not repeated — this panel is about what
        this event adds, and the approval review is where the whole page is read
        in order.
      */}
        <Section title={QUESTIONS_HEADLINE} testId="event-questions">
          <Stack spacing={2}>
            {/*
            C4. There was filler here — "Nothing extra is asked. Add a
            question if this event needs one." — and Brian's reaction was
            "I hate extra text like this." The heading above already says
            what this panel is; an event with nothing extra to ask says so by
            showing nothing.
          */}
            {questions.length === 0 ? null : (
              <QuestionList
                questions={questions}
                leadWithRsvp={false}
                testId="event-question-list"
              />
            )}
          </Stack>
        </Section>

        {/*
        REQ-delete-draft, D29. On the draft's own page, low emphasis, and only
        where the operator could actually do it — an approved event is cancelled
        rather than deleted, and W6 owns that.
      */}
        {mayManage && event.status === "draft" ? (
          <DeleteDraft eventId={event.id} name={event.name} />
        ) : null}

        {/*
        REQ-participation-table — W7's centre. One row per person: who was
        asked, what they said, and whether they came, with delivery at this
        tier and one column per question.
      */}
        {participation ? (
          <Stack spacing={2}>
            {/* D68's counts, collapsed. The per-person answers are in the table. */}
            <QuestionCounts participation={participation} />
            <ParticipationFilterBar
              basePath={`/operate/events/${event.id}`}
              filters={participationFilters}
              showDelivery
            />
            <ParticipationTable
              basePath={`/operate/events/${event.id}`}
              participation={participation}
              filters={participationFilters}
            />
          </Stack>
        ) : null}

        <Stack spacing={2} sx={{ maxWidth: 420 }}>
          {mayApprove && event.status === "approved" ? (
            <ApprovedEventActions eventId={event.id} isGame={event.eventType === "game"} />
          ) : null}

          {mayAdministerDelivery && !preApproval ? (
            // LAN-78's surface, reachable only once there is something to look
            // at. The route guards itself on `delivery_administration`; this is
            // the courtesy that stops an operator finding it by guessing.
            <Button
              variant="outlined"
              href={`/operate/events/${event.id}/delivery`}
              fullWidth
              sx={{ minHeight: 44 }}
            >
              Delivery
            </Button>
          ) : null}

          {mayApprove && event.status === "draft" ? (
            <Stack spacing={1}>
              <Button
                variant="contained"
                href={`/operate/events/${event.id}?step=${audience.length > 0 ? "review" : "audience"}`}
                fullWidth
                sx={{ minHeight: 44 }}
              >
                {audience.length > 0
                  ? "Review audience and approve"
                  : "Choose audience and approve"}
              </Button>
            </Stack>
          ) : null}

          {mayManage && event.status === "draft" ? (
            <Button variant="contained" href={`/operate/events/${event.id}/edit`} fullWidth>
              Edit draft
            </Button>
          ) : null}

          {/*
          D39, as Brian settled it on 2026-08-22: duplicate opens the create
          form prefilled, and nothing is written until the operator saves. It is
          offered on every status, because the event worth copying is usually one
          that already happened.
        */}
          {mayManage ? (
            <Button
              variant="outlined"
              href={`/operate/events/new?from=${event.id}`}
              fullWidth
              sx={{ minHeight: 44 }}
              data-testid="duplicate-event"
            >
              {DUPLICATE_ACTION}
            </Button>
          ) : null}

          {mayManage ? null : (
            <Typography variant="body2" color="text.secondary" data-testid="read-only-note">
              You can see the club calendar. Creating and changing events is done by the President,
              Vice-President, Secretary and General Manager.
            </Typography>
          )}

          <Button variant="text" href="/operate/events">
            Back to events
          </Button>
        </Stack>
      </Stack>
    </OutcomeSlotProvider>
  );
}
