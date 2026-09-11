import { formatCsv } from "../csv";
import { STATUS_LABELS, labelFor } from "../event-vocabulary";
import { COMPARED_COLUMNS, valueOf } from "./compare";
import { EXPORT_COLUMNS, type ImportableEvent, type PlannedRow } from "./shared";

// The plan's fingerprint, and the season export — LAN-155. FNV-1a, not cryptographic — nothing here
// is a secret; this only catches the season moving between confirmation and apply.
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

export interface ExportableEvent extends ImportableEvent {
  termWeek: string; // the caller's to compute
}

// Cancelled events are included — leaving one out would make it look like something to re-add.
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

export function exportFileName(seasonLabel: string | null): string {
  const season = (seasonLabel ?? "").replace(/[^0-9a-zA-Z-]+/g, "-").replace(/^-+|-+$/g, "");
  return season === "" ? "lancers-events-template.csv" : `lancers-events-${season}.csv`;
}
