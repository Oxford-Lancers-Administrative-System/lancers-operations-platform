/**
 * The shared plan-building context — LAN-221.
 *
 * Every plan module receives one of these and calls `add` for each row it
 * wants written. The context keeps the rows in insertion order, the provenance
 * record for the manifest, the **state tags** the verifier counts, and the
 * **example identifiers** the checklists resolve their links against.
 *
 * Nothing here opens a connection or reads the environment; the context is a
 * pure accumulator, and `buildPlan` stays a pure function of its inputs.
 */

import { id, token, tokenHash } from "../ids.mjs";
import { normaliseLabel } from "../db.mjs";

/** Adds `days` to an ISO date, in UTC, and returns an ISO date. */
export function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Adds `hours` to an ISO timestamp and returns an ISO timestamp. */
export function addHours(isoTimestamp, hours) {
  return new Date(new Date(isoTimestamp).getTime() + hours * 3600000).toISOString();
}

/** Adds `minutes` to an ISO timestamp and returns an ISO timestamp. */
export function addMinutes(isoTimestamp, minutes) {
  return new Date(new Date(isoTimestamp).getTime() + minutes * 60000).toISOString();
}

/** 0 = Sunday … 6 = Saturday, in UTC. */
export function weekdayOf(iso) {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/**
 * A non-deliverable stand-in for a real student's mobile number.
 *
 * Ofcom reserves 07700 900000–900999 for drama; nothing in it can be dialled or
 * messaged. `docs/pilot-data-runbook.md` permits exactly this range and no
 * other, and the local seed uses it for the same reason.
 */
export function dramaPhone(index, shape = "spaced") {
  const digits = String(index).padStart(3, "0");
  switch (shape) {
    case "spaced":
      return `07700 900${digits}`;
    case "plain":
      return `07700900${digits}`;
    case "international":
      return `+44 7700 900${digits}`;
    case "no-leading-zero":
      return `7700 900${digits}`;
    case "one-short":
      return `07700 90${digits}`;
    case "trailing-space":
      return `07700 900${digits} `;
    case "north-american":
      // The North American fiction range, for the one student whose number is
      // not a UK one at all.
      return `+1 555 01${digits.slice(1)}`;
    default:
      throw new Error(`Unknown phone shape ${shape}`);
  }
}

/** Only RFC 2606 reserved domains, per `docs/pilot-data-runbook.md`. */
export function exampleEmail(local, kind = "college") {
  return kind === "college" ? `${local}@college.ox.ac.example` : `${local}@mail.example`;
}

export function createContext({ params, existing, anchor, labels }) {
  const rows = [];
  const provenance = [];
  /** state key → ordered list of row identifiers that carry it. */
  const states = new Map();
  /** example key → row identifier (or plaintext, for a token). */
  const examples = new Map();
  /** table → identifiers, for verify and rollback. */
  const byTable = new Map();

  const tag = (state, rowId) => {
    if (!states.has(state)) states.set(state, []);
    const list = states.get(state);
    if (!list.includes(rowId)) list.push(rowId);
  };

  const add = (table, columns, classification, source, stateKeys = [], exampleKey = null) => {
    if (!columns.id) throw new Error(`Refusing to plan a ${table} row without an id.`);
    rows.push({ table, columns });
    provenance.push({
      table,
      id: columns.id,
      classification,
      ...source,
      ...(stateKeys.length > 0 ? { states: stateKeys } : {}),
    });
    if (!byTable.has(table)) byTable.set(table, []);
    byTable.get(table).push(columns.id);
    for (const state of stateKeys) tag(state, columns.id);
    if (exampleKey) example(exampleKey, columns.id);
    return columns.id;
  };

  /**
   * Adopts an existing reference row, or plans a new one. A row carrying the
   * identifier this loader would have generated is this loader's from an
   * earlier run — not somebody else's to leave alone — so it is added rather
   * than adopted, and rollback still owns it.
   */
  const adopt = (existingId, table, columns, classification, source) => {
    if (existingId && existingId === columns.id) {
      return add(table, columns, classification, source);
    }
    if (existingId) {
      provenance.push({
        table,
        id: existingId,
        classification,
        ...source,
        note: "adopted — already present, not created by this loader",
      });
      return existingId;
    }
    return add(table, columns, classification, source);
  };

  /** First one wins: an example is "the" row for a state, and the first row is as good as any. */
  const example = (key, value) => {
    if (!examples.has(key)) examples.set(key, value);
    return examples.get(key);
  };

  const secret = params.tokenSecret;

  return {
    params,
    existing,
    anchor,
    labels,
    rows,
    provenance,
    states,
    examples,
    byTable,
    add,
    adopt,
    tag,
    example,
    id,
    /** A deterministic plaintext token for `table`/parts, and its digest. */
    mintToken: (table, ...parts) => {
      const plaintext = token(secret, table, ...parts);
      return { plaintext, hash: tokenHash(plaintext) };
    },
    day: (offset) => addDays(anchor, offset),
    at: (offset, hhmm) => `${addDays(anchor, offset)}T${hhmm}:00Z`,
    normaliseLabel,
  };
}
