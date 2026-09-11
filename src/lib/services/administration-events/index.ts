/** The administration event vocabulary and envelope — LAN-130. */

export {
  ADMINISTRATION_EVENT_FAMILIES,
  ADMINISTRATION_ACTIONS,
  ADMINISTRATION_EVENTS,
  ROLE_RELATED_ADMINISTRATION_ACTIONS,
  isAdministrationAction,
  administrationEvent,
} from "./vocabulary";
export type {
  AdministrationEventFamily,
  AdministrationAction,
  AdministrationEventDefinition,
} from "./vocabulary";

export {
  ADMINISTRATION_CONTEXT_KEY,
  ADMINISTRATION_ENVELOPE_VERSION,
  NO_CHANGE_RULE,
  isUuid,
  prepareAdministrationEvent,
} from "./envelope";
export type { AdministrationOperatingYear, AdministrationEventRecord } from "./envelope";
