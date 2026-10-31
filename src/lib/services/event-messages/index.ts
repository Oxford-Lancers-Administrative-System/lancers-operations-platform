/**
 * Event messages — LAN-508, the game day brief.
 *
 * An event carries zero or more messages, each sent a whole number of hours
 * before it starts, by WhatsApp, email or both, to everyone invited or to
 * those whose answer is Yes when it goes. The brief is the coach's own
 * Markdown (`src/lib/event-brief/`), drawn as a 900px PNG for WhatsApp's
 * image header and set in the club shell for email.
 *
 * `./store` reads and writes the messages (events and templates), `./declare`
 * turns a due message, or a confirmed resend, into one send and its jobs, and
 * `dispatchEventMessageJob` in `../messaging-scheduler.ts` sends each job.
 */

export {
  EVENT_MESSAGE_KEY_PREFIX,
  eventMessageJobKey,
  sendIdFromJobKey,
  type StoredEventMessage,
} from "./shared";

export { declareDueEventMessagesIn } from "./declare";

export {
  EVENT_MESSAGE_RESEND_REQUIRED_RULE,
  readEventMessages,
  replaceTemplateEventMessages,
  saveApprovedEventMessages,
} from "./store";
