import type { AttendanceParticipant } from "@/lib/services/attendance";

/**
 * The board's filters, applied in memory.
 *
 * In memory rather than in SQL because the list is one event's audience — tens
 * of people, already read in full to compute the counts above — and a recorder
 * switching filters mid-evening should not re-run a `full outer join` for it.
 * The counts deliberately describe the **whole** event rather than the filtered
 * view, so a filter never makes the club look like it invited fewer people.
 */
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
