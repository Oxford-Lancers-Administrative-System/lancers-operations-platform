/**
 * The whole-club message queue's codes — LAN-468.
 *
 * Pure, with no `server-only`, so the page's filter (a client component) and
 * the read service share one list of what a status, a channel, a kind and a
 * window can be. The labels live with the page (`presentation.ts`); the SQL
 * that derives each code lives in `message-queue.ts`.
 */
import { addClubDays } from "@/lib/club-time";

/**
 * A row's state. The first seven are `DELIVERY_STATE_EXPRESSION`'s own
 * vocabulary, unchanged. The last two are facts that expression cannot see
 * because it is only ever asked about one event:
 *
 * - `not_sent`: queued against an event that has already started or is no
 *   longer approved, so `DUE_JOB_PREDICATE` will never select it.
 * - `withheld`: no message may go, because the recruit has no season consent —
 *   either the invitation was written with `message_withheld_reason`, or the
 *   send was refused at claim time with `NO_CONSENT_REASON`.
 */
const MESSAGE_STATES = Object.freeze([
  "queued",
  "attempted",
  "delivered",
  "retryable",
  "failed",
  "held",
  "cancelled",
  "not_sent",
  "withheld",
] as const);
export type MessageState = (typeof MESSAGE_STATES)[number];

/** What the Status filter offers. `failed` covers `retryable` too, as the event's Failed tile does. */
export const STATUS_FILTERS = Object.freeze([
  "queued",
  "attempted",
  "delivered",
  "failed",
  "held",
  "cancelled",
  "not_sent",
  "withheld",
] as const);
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export function statesForFilter(filter: StatusFilter): readonly MessageState[] {
  return filter === "failed" ? ["failed", "retryable"] : [filter];
}

export const CHANNEL_FILTERS = Object.freeze(["whatsapp", "email"] as const);
export type ChannelFilter = (typeof CHANNEL_FILTERS)[number];

/**
 * What a message is. Derived from `job_type`, the invitation's capacity (a
 * recruit's reminder is LAN-203's follow-up), and — for `job_type = 'other'` —
 * the idempotency-key prefix every dispatcher already routes on.
 */
const MESSAGE_KINDS = Object.freeze([
  "invitation",
  "reminder",
  "recruit_followup",
  "escalation",
  "change_notice",
  "cancellation",
  "question_change",
  "recruit_welcome",
  "recruit_details_reminder",
  "recruit_interest_ask",
  "recruit_interest_reminder",
  "onboarding_welcome",
  "onboarding_chase",
  "onboarding_nudge",
  "onboarding_escalation",
  // LAN-465. The attendance sheet, an hour before an approved event.
  "attendance_sheet",
  // LAN-459. The details request to an operator the club has only a phone number for.
  "operator_details",
  "other",
] as const);
export type MessageKind = (typeof MESSAGE_KINDS)[number];

/** The Kind filter's groups. A filter per kind would be seventeen options for one select. */
export const KIND_FAMILIES = Object.freeze({
  invitation: ["invitation"],
  reminder: ["reminder", "recruit_followup"],
  escalation: ["escalation", "onboarding_escalation"],
  notice: ["change_notice", "cancellation", "question_change"],
  recruitment: [
    "recruit_welcome",
    "recruit_details_reminder",
    "recruit_interest_ask",
    "recruit_interest_reminder",
  ],
  onboarding: ["onboarding_welcome", "onboarding_chase", "onboarding_nudge", "operator_details"],
  attendance: ["attendance_sheet"],
} as const satisfies Record<string, readonly MessageKind[]>);
export type KindFamily = keyof typeof KIND_FAMILIES;
export const KIND_FAMILY_KEYS = Object.freeze(Object.keys(KIND_FAMILIES) as KindFamily[]);

/** Whole club days, so a window reads the same at 09:00 as at 21:00. */
export const WINDOWS = Object.freeze(["today", "yesterday", "last7", "next7"] as const);
export type QueueWindow = (typeof WINDOWS)[number];
export const DEFAULT_WINDOW: QueueWindow = "today";

/** `[fromDay, toDay)` in the club's zone, as `YYYY-MM-DD`. */
export interface WindowDays {
  readonly fromDay: string;
  readonly toDay: string;
}

function shift(day: string, count: number): string {
  const shifted = addClubDays(day, count);
  if (shifted === null) throw new Error(`Not a club day: ${day}`);
  return shifted;
}

export function windowDays(window: QueueWindow, today: string): WindowDays {
  switch (window) {
    case "today":
      return { fromDay: today, toDay: shift(today, 1) };
    case "yesterday":
      return { fromDay: shift(today, -1), toDay: today };
    case "last7":
      return { fromDay: shift(today, -6), toDay: shift(today, 1) };
    case "next7":
      return { fromDay: today, toDay: shift(today, 8) };
  }
}

/** The only window read soonest-first: it is the part of the queue still to come. */
export function windowReadsForward(window: QueueWindow): boolean {
  return window === "next7";
}

/** Rows per page. A bound, not a preference: the service refuses to read more. */
export const PAGE_SIZE = 50;

export function parseChoice<T extends string>(value: unknown, choices: readonly T[]): T | null {
  return typeof value === "string" && (choices as readonly string[]).includes(value)
    ? (value as T)
    : null;
}
