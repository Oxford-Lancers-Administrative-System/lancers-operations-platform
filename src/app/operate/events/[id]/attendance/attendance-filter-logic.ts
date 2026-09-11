import type { AttendanceParticipant } from "@/lib/services/attendance";

// The board's filters, applied in memory (the list is one event's audience,
// already read in full). Decision history: docs/ux/tickets/LAN-80-attendance.md.
export function filterParticipants(
  participants: AttendanceParticipant[],
  filters: { search: string; rsvp: string; attendance: string },
): AttendanceParticipant[] {
  const needle = filters.search.trim().toLowerCase();

  return participants.filter((participant) => {
    if (needle !== "" && !participant.displayName.toLowerCase().includes(needle)) return false;

    if (filters.rsvp === "yes" && participant.rsvp !== "yes") return false;
    if (filters.rsvp === "no" && participant.rsvp !== "no") return false;
    if (filters.rsvp === "none" && participant.rsvp !== null) return false;

    if (filters.attendance === "unmarked" && participant.presence !== null) return false;
    if (
      filters.attendance !== "" &&
      filters.attendance !== "unmarked" &&
      participant.presence !== filters.attendance
    ) {
      return false;
    }

    return true;
  });
}
