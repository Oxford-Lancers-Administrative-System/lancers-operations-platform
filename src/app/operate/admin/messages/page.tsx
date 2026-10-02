import Stack from "@mui/material/Stack";
import { EmptyState } from "@/components/empty-state";
import { Metric, MetricRow } from "@/components/metric";
import { Notice } from "@/components/notice";
import { operatorHoldsGrant } from "@/lib/auth/guards";
import { addClubDays, formatClubDay } from "@/lib/club-time";
import { isServiceError } from "@/lib/db";
import { readMessageQueue, type MessageQueue } from "@/lib/services/message-queue";
import { formatAttemptTime } from "@/app/operate/events/[id]/delivery/presentation";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { gateShellPage } from "../../gate";
import AdminPageHeading from "../page-heading";
import MessagesFilter from "./messages-filter";
import { MessagesCards, MessagesPager, MessagesTable } from "./messages-list";
import {
  dueNowCaption,
  EMPTY_WINDOW,
  heldNotice,
  LIGHTS_OUT_NOTICE,
  MESSAGES_PATH,
  METRIC_ATTEMPTED,
  nextDueCaption,
  METRIC_DELIVERED_TODAY,
  METRIC_FAILED_TODAY,
  METRIC_QUEUED,
  PAGE_HEADING,
  rangeLabel,
  WINDOW_LABELS,
  yesterdayCaption,
} from "./presentation";
import { messagesHref, parseMessagesQuery } from "./query";

/** "2 Oct 2026" or "26 Sep 2026 – 2 Oct 2026": the window's days, inclusive. */
function windowSubtitle(queue: MessageQueue): string {
  const last = addClubDays(queue.toDay, -1) ?? queue.toDay;
  const days =
    last === queue.fromDay
      ? formatClubDay(queue.fromDay)
      : `${formatClubDay(queue.fromDay)} – ${formatClubDay(last)}`;
  return `${WINDOW_LABELS[queue.window]} · ${days}`;
}

/**
 * **Messages** — LAN-468, a proposal. Every message the club has sent, is
 * sending and has queued, across events, recruitment and onboarding, in one
 * running list. Read-only. `delivery_administration`, the capability that
 * already reads messaging safety for the whole club.
 */
export default async function MessagesPage({ searchParams }: PageProps<"/operate/admin/messages">) {
  const gate = await gateShellPage(MESSAGES_PATH, "delivery_administration");
  if ("screen" in gate) return gate.screen;

  const query = parseMessagesQuery(await searchParams);

  let queue: MessageQueue;
  try {
    queue = await readMessageQueue(query);
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <UnavailableScreen
        title={PAGE_HEADING}
        message={error.message}
        testId="messages-unavailable"
      />
    );
  }

  const { summary } = queue;
  const mayOpenPerson = operatorHoldsGrant(
    gate.operator,
    { kind: "roster", key: "person" },
    "view",
  );
  const lastPage = Math.max(1, Math.ceil(queue.total / queue.pageSize));

  return (
    <Stack spacing={3} data-testid="messages-screen">
      <AdminPageHeading title={PAGE_HEADING} subtitle={windowSubtitle(queue)} />

      <MetricRow columns={4} testId="messages-summary">
        <Metric
          value={summary.queued}
          label={METRIC_QUEUED}
          caption={
            summary.dueNow > 0
              ? dueNowCaption(summary.dueNow)
              : summary.nextDueAt
                ? nextDueCaption(formatAttemptTime(summary.nextDueAt))
                : undefined
          }
          testId="messages-queued"
        />
        <Metric value={summary.attempted} label={METRIC_ATTEMPTED} testId="messages-attempted" />
        <Metric
          value={summary.deliveredToday}
          label={METRIC_DELIVERED_TODAY}
          caption={yesterdayCaption(summary.deliveredYesterday)}
          testId="messages-delivered"
        />
        <Metric
          value={summary.failedToday}
          label={METRIC_FAILED_TODAY}
          caption={yesterdayCaption(summary.failedYesterday)}
          testId="messages-failed"
        />
      </MetricRow>

      {summary.lightsOut ? (
        <Notice severity="info" testId="messages-lights-out">
          {LIGHTS_OUT_NOTICE}
        </Notice>
      ) : null}
      {summary.held > 0 ? (
        <Notice severity="warning" testId="messages-held">
          {heldNotice(summary.held)}
        </Notice>
      ) : null}

      <MessagesFilter query={query} />

      {queue.rows.length === 0 ? (
        <EmptyState
          testId="messages-empty"
          title={EMPTY_WINDOW}
          action={
            query.status || query.channel || query.kind || query.page > 1
              ? { href: MESSAGES_PATH, label: "Clear filters" }
              : undefined
          }
        />
      ) : (
        <Stack spacing={2}>
          <MessagesTable rows={queue.rows} mayOpenPerson={mayOpenPerson} />
          <MessagesCards rows={queue.rows} mayOpenPerson={mayOpenPerson} />
          <MessagesPager
            range={rangeLabel(queue.page, queue.pageSize, queue.rows.length, queue.total)}
            previousHref={
              queue.page > 1
                ? messagesHref(MESSAGES_PATH, { ...query, page: queue.page - 1 })
                : null
            }
            nextHref={
              queue.page < lastPage
                ? messagesHref(MESSAGES_PATH, { ...query, page: queue.page + 1 })
                : null
            }
          />
        </Stack>
      )}
    </Stack>
  );
}
