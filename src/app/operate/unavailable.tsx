import { Refusal } from "@/components/refusal";
import type { ReactNode } from "react";

/**
 * What a screen shows when the service refused to hand it anything.
 *
 * Eight call sites across seven files had written this out identically — the
 * roster, the events list, the coach's event list on that same page, an event,
 * the calendar, the register, the delivery board and the create-event form —
 * differing only in the heading and the test id, and on the create-event form
 * not even carrying one. `events/[id]/edit` had already pulled its own version
 * out into a local `Refusal`, which is the same conclusion reached once and not
 * shared.
 *
 * Sharing it matters more than the line count. This is the screen an operator
 * sees on the worst day, and the parts that are easy to get subtly wrong are
 * the ones that were being retyped: the heading is an `h1` because it is the
 * only heading on the page at that moment and a page whose sole heading is an
 * `h6` is unreachable by heading navigation; the alert is a `warning` rather
 * than an `error` because the club's data being briefly unavailable is not the
 * operator's fault and must not read as one; and `maxWidth: 720` keeps a long
 * database message to a readable measure instead of one line across a desktop.
 *
 * `message` is the service's own sentence. It is passed through rather than
 * replaced with a generic one because `ServiceError` messages are written for
 * the operator and never carry a row, a host or a connection string —
 * `src/lib/db/errors.ts` is where that guarantee lives.
 */
export function UnavailableScreen({
  title,
  message,
  testId,
  children,
}: {
  title: string;
  message: string;
  testId?: string;
  children?: ReactNode;
}) {
  return <Refusal title={title} message={message} testId={testId} action={children} />;
}
