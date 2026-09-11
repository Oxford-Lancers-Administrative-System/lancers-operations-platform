import { formatCsv } from "../csv";
import { STATUS_LABELS, labelFor } from "../event-vocabulary";
import { COMPARED_COLUMNS, valueOf } from "./compare";
import { EXPORT_COLUMNS, type ImportableEvent, type PlannedRow } from "./shared";

/** The plan's fingerprint, and the season export — LAN-155. */

/**
 * A fingerprint of exactly the writes a plan proposes.
 *
 * FNV-1a, twice, over a canonical rendering — not a cryptographic hash, and it
 * does not need to be. Nothing here is a secret and nothing is defended against
 * a forger: the operator's own browser holds the file, and what this catches is
 * the season moving between the confirmation and the apply. An attacker who
 * could choose the digest could only make their own import refuse.
 */
export function digestOf(rows: readonly PlannedRow[]): string {
  const canonical = rows
    .map((row) => {
      if (row.write === null) return `${row.line}|${row.outcome}|${row.eventId ?? ""}`;
      const target = row.write.kind === "update" ? row.write.eventId : "";
      return `${row.line}|${row.write.kind}|${target}|${JSON.stringify(row.write.input)}`;
    })
    .join("\n");

  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let index = 0; index < canonical.length; index += 1) {
    const code = canonical.charCodeAt(index);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b + code, 0x85ebca6b) >>> 0;
  }
  return `${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
}

/** One event, as the export writes it. `termWeek` is the caller's to compute. */
export interface ExportableEvent extends ImportableEvent {
  termWeek: string;
}

/**
 * Every event in the season, in the import's columns plus the two read-only
 * ones. **Cancelled events are included** — leaving one out would make it
 * invisible in the file and look like something to re-add.
 */
export function formatSeasonExport(events: readonly ExportableEvent[]): string {
  return formatCsv([
    EXPORT_COLUMNS,
    ...events.map((event) => [
      event.id,
      ...COMPARED_COLUMNS.map((column) => valueOf(event, column)),
      labelFor(STATUS_LABELS, event.status),
      event.termWeek,
    ]),
  ]);
}

/** The download's filename, for both the empty template and a populated season. */
export function exportFileName(seasonLabel: string | null): string {
  const season = (seasonLabel ?? "").replace(/[^0-9a-zA-Z-]+/g, "-").replace(/^-+|-+$/g, "");
  return season === "" ? "lancers-events-template.csv" : `lancers-events-${season}.csv`;
}
