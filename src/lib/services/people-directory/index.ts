// The People list, missing-data queue, and the rest of the person record —
// LAN-184. See `shared.ts`, `list-people.ts`, `missing-queue.ts`,
// `roles-seasons.ts`, `merge.ts` and `history.ts`.

export type { MissingQueue, PeopleList, PeopleScope, PersonListEntry } from "./shared";
export { DEFAULT_MISSING_SORT, DEFAULT_PEOPLE_SORT } from "./shared";
export { listPeople } from "./list-people";
export { listMissingDataQueue } from "./missing-queue";
export type { PersonRoleAssignment, PersonSeasonRecord } from "./roles-seasons";
export { listPersonRoleAssignments, listPersonSeasons } from "./roles-seasons";

export { listMergedPredecessors, resolveMergeSurvivor } from "./merge";
export type { PersonHistoryEntry } from "./history";
export { readPersonHistory } from "./history";
