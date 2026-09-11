/** Attendance's public surface — locked Requirement 7, invariants P5, P6, P8. LAN-80. */

/**
 * Re-exported from `../attendance-vocabulary`, which is pure and is what the
 * client components import — a client component importing these names from
 * this module would drag `pg` into the browser bundle, and the build refuses
 * it.
 */
export {
  isAttendancePresence,
  summariseAttendance,
  type AttendanceParticipant,
  type AttendancePresence,
  type AttendanceSummary,
} from "../attendance-vocabulary";

export { eventStartInstant, isRegisterAvailable, registerOpensAt } from "../attendance-window";

export type { AttendanceBoard } from "./read";
export { readAttendanceBoard, readEventAttendanceSummary } from "./read";

export {
  ATTENDANCE_CLOSED_MESSAGE,
  ATTENDANCE_TOO_EARLY_MESSAGE,
  PARTICIPANT_NOT_FOUND_MESSAGE,
  WALK_UP_GIVEN_NAME_REQUIRED,
  WALK_UP_FAMILY_NAME_REQUIRED,
  WALK_UP_PHONE_REQUIRED,
  recordAttendance,
  recordWalkUpAttendance,
  removeAttendance,
} from "./write";
