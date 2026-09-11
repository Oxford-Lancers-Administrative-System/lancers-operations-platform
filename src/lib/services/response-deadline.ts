import "server-only";

/** The club's RSVP response deadline — LAN-77, amended by LAN-169; a named view onto `public.messaging_schedules` (ADR 0036 superseded ADR 0021). Decision history: docs/adr/0036-messaging-schedule-configuration.md. */

interface ResponseDeadlineRule {
  readonly daysBefore: number;
}

export interface ResolvedResponseDeadline {
  readonly at: Date;
  readonly configuredAt: Date;
  readonly clamped: boolean;
  readonly rule: ResponseDeadlineRule;
}
