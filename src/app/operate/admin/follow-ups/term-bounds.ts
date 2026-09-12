import { readEventYear } from "@/app/calendar/year";
import { readCurrentSeason } from "@/lib/services/seasons";

/**
 * "This term"'s boundary, read like Events/Calendar do (`@/app/calendar/year`,
 * docs/ux/standards.md rule 7); degrades to no boundary rather than failing
 * the page.
 *
 * Its own module rather than `./queue-filters.ts`'s, since LAN-322: the queue's
 * selection and chase are client state, so the table and the cards are client
 * components now, and they import that file for the sort links. This one reads
 * the database, and a client bundle must never reach it.
 */
export async function currentTermBounds(
  today: string,
): Promise<{ startsOn: string | null; endsOn: string | null }> {
  try {
    const season = await readCurrentSeason();
    const year = await readEventYear([], {
      today,
      seasonStartsOn: season.startsOn,
      seasonEndsOn: season.endsOn,
    });
    return {
      startsOn: year?.currentSegmentStartsOn ?? null,
      endsOn: year?.currentSegmentEndsOn ?? null,
    };
  } catch {
    return { startsOn: null, endsOn: null };
  }
}
