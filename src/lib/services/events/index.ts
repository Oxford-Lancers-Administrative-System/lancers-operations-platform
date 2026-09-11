/**
 * The event aggregate — drafting, editing and reading one event. LAN-76, narrowed by LAN-151;
 * `shared`/`read`/`public-tier`/`write` are LAN-300's split.
 */

export {
  derivedEventState,
  EVENT_STATUS_FILTERS,
  EVENT_STATUSES,
  EVENT_TYPES,
  validateEventDraft,
  type DerivedEventState,
  type EventDraftInput,
  type RawEventDraft,
  type TermWindow,
} from "../event-input";

export {
  describeQuestionAnswer,
  joinQuestionChoices,
  validateEventQuestions,
  type EventQuestion,
  type RawEventQuestion,
} from "../event-questions";

export { DEFAULT_EVENT_SORT, EVENT_SORT_COLUMNS } from "./shared";
export type { EventDetail, EventListEntry } from "./shared";

export {
  listCurrentSeasonEvents,
  listEventsForOperator,
  lockEventIn,
  PARTICIPATION_TABLES,
  readEvent,
  readEventIn,
  readEventQuestions,
} from "./read";
export type { EventList } from "./read";

export {
  listPublicSeasonEvents,
  listPublicSeasonEventsForFeed,
  PUBLIC_EVENT_COLUMNS,
  PUBLIC_EVENT_SORT_COLUMNS,
  readPublicEvent,
} from "./public-tier";
export type { PublicEventDetail, PublicEventList, PublicEventListEntry } from "./public-tier";

export {
  createEventDraft,
  deleteEventDraft,
  EDIT_REFUSAL_MESSAGE,
  QUESTION_REMOVAL_REFUSAL_MESSAGE,
  QUESTIONS_EDIT_REFUSAL_MESSAGE,
  updateEventDraft,
  updateEventQuestions,
} from "./write";
