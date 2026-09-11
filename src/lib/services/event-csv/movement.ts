import type { PlannedRow, RowOutcome } from "./shared";

/**
 * What moved between the plan an operator confirmed and the plan the apply
 * recomputed — LAN-310.
 *
 * The digest guard refuses an apply whose recomputed plan differs from the one
 * that was read, and it is right to: the operator agreed to something else.
 * What it could not do was say *what* had moved, so the only way out was to
 * upload the file again and compare two screens by eye. This names the rows,
 * by line, so the fresh proposal can be read against the old one.
 *
 * Rows are compared exactly as `digestOf` compares them — outcome, the event a
 * write targets, and the values it would write — so a movement is found for
 * precisely the plans the digest guard refuses, and never for one it accepts.
 */
export interface PlanMovement {
  /** The line in the file, counting the header as line 1. */
  line: number;
  name: string;
  /** The outcome the operator read, or `null` where the line is new in the fresh plan. */
  before: RowOutcome | null;
  /** The outcome now, or `null` where the fresh plan no longer has that line. */
  after: RowOutcome | null;
}

function writeKey(row: PlannedRow): string {
  if (row.write === null) return `${row.outcome}|${row.eventId ?? ""}`;
  const target = row.write.kind === "update" ? row.write.eventId : "";
  return `${row.write.kind}|${target}|${JSON.stringify(row.write.input)}`;
}

/** Every line whose outcome, or whose write, is not what it was. In file order. */
export function planMovements(
  before: readonly PlannedRow[],
  after: readonly PlannedRow[],
): PlanMovement[] {
  const wasAt = new Map(before.map((row) => [row.line, row]));
  const isAt = new Map(after.map((row) => [row.line, row]));
  const lines = [...new Set([...wasAt.keys(), ...isAt.keys()])].sort((a, b) => a - b);

  const movements: PlanMovement[] = [];
  for (const line of lines) {
    const was = wasAt.get(line);
    const is = isAt.get(line);
    if (was === undefined && is !== undefined) {
      movements.push({ line, name: is.name, before: null, after: is.outcome });
      continue;
    }
    if (is === undefined && was !== undefined) {
      movements.push({ line, name: was.name, before: was.outcome, after: null });
      continue;
    }
    if (was === undefined || is === undefined) continue;
    if (writeKey(was) === writeKey(is)) continue;
    movements.push({ line, name: is.name, before: was.outcome, after: is.outcome });
  }
  return movements;
}
