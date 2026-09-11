import type { AttendancePresence } from "@/lib/services/attendance-vocabulary";

// `presence` is what the server committed, never the attempted value (§ 9). Decision history: docs/ux/tickets/LAN-80-attendance.md.
export interface AttendanceSaveState {
  key: string | null;
  presence: AttendancePresence | null;
  recordedAt: string | null;
  recordedByName: string | null;
  attempted: AttendancePresence | null;
  error: string | null;
}

export const EMPTY_SAVE_STATE: AttendanceSaveState = Object.freeze({
  key: null,
  presence: null,
  recordedAt: null,
  recordedByName: null,
  attempted: null,
  error: null,
});

export interface WalkUpFormState {
  error: string | null;
  values: {
    givenName: string;
    familyName: string;
    phone: string;
    email: string;
  } | null;
}

export const EMPTY_WALK_UP_STATE: WalkUpFormState = Object.freeze({ error: null, values: null });
