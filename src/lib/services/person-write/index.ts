// The write path for an existing person's record — LAN-183/LAN-185. See
// `contact.ts`, `fields.ts`, `emergency-contact.ts` and `aliases.ts`.

export { personVersion } from "./shared";

export { supersedeContactPoint } from "./contact";
export type { PersonFieldUpdate } from "./fields";
export { updatePersonField } from "./fields";
export type { EmergencyContactFieldUpdate } from "./emergency-contact";
export { updateEmergencyContactField } from "./emergency-contact";
export { addPersonAlias, removePersonAlias, setDisplayNamePersonAlias } from "./aliases";
