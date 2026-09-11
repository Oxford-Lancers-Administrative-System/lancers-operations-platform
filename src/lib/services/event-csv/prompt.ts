import { formatCsv } from "../csv";
import { EXPORT_COLUMNS, TYPE_TOKEN_LIST } from "./shared";

/** The copyable prompt an operator runs the term card through — LAN-155. */

/**
 * Bumped whenever `IMPORT_PROMPT` changes. Shown beside the block so an operator
 * who kept a copy can tell whether theirs is the current one.
 */
export const IMPORT_PROMPT_VERSION = 1;

/**
 * The static, versioned block an operator copies into a general-purpose AI tool
 * alongside the club's own calendar.
 *
 * The worked example below is asserted by `./event-csv.test.ts` to parse into
 * two clean New rows. That assertion is not decoration: this text is the one
 * part of the workflow that runs where nobody can see it fail.
 */
export const IMPORT_PROMPT = `Convert our club calendar into the Oxford Lancers import format.

Return ONLY a CSV file with this exact header row and no other text:

id,name,type,date,start,end,online,venue,description,required_equipment,mandatory

Rules
- id: leave EMPTY for every event. The system assigns identifiers.
- type: exactly one of ${TYPE_TOKEN_LIST}.
- date: YYYY-MM-DD.
- start / end: HH:MM, 24-hour, in five-minute steps. All times are UK local time.
- online: yes or no. Use yes for anything on Teams, Zoom or similar.
- venue: the street address when in person; the meeting destination when online.
- description: anything that does not fit another column.
- required_equipment: kit players must bring. Leave empty if none.
- mandatory: yes if attendance is expected, otherwise no.
- The opponent goes in the name, e.g. "vs Brackenridge Bulls". There is no opponent column.

Example
id,name,type,date,start,end,online,venue,description,required_equipment,mandatory
,Practice — michaelmas week 1,Practice,2026-10-14,20:00,22:00,no,Iffley Road Astro,Full contact.,Gumshield,yes
,Chalk — michaelmas week 1,Chalk,2026-10-13,18:00,19:00,yes,Microsoft Teams,Install review.,,no

Now here is our calendar:`;

/**
 * The worked example on its own, so the test that proves it imports cleanly
 * reads it from the prompt rather than from a copy that can drift.
 */
export function workedExampleCsv(): string {
  const lines = IMPORT_PROMPT.split("\n");
  const start = lines.indexOf("Example");
  const header = lines[start + 1];
  const rows = lines.slice(start + 2, start + 4);
  return [header, ...rows].join("\r\n") + "\r\n";
}

/** The empty season's download: the header row and nothing else. */
export function importTemplateCsv(): string {
  return formatCsv([EXPORT_COLUMNS]);
}
