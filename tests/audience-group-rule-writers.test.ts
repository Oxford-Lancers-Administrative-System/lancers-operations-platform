// @vitest-environment node
/**
 * Every door into a derived audience group goes through the one chokepoint —
 * LAN-392.
 *
 * An audience is derived from eight facts: a season membership's status, an
 * effective-dated coaching or committee seat, a BPS selection, a recruitment
 * prospect's status, and — since LAN-414 put the roster board's own assignments
 * in the picker — a coaching group, a position group, a warmup small group and
 * a special-teams slot. Anything that writes one of them can move a person into
 * or out of an audience group, and if it does that without calling
 * `applyAudienceGroupRuleIn` the rule silently stops working for that door —
 * which is a defect nobody notices until an event goes out short.
 *
 * So this enumerates them from the source rather than from a list somebody
 * maintains: it finds every service module containing an `insert into` or
 * `update` against one of those four tables, and requires each to be either a
 * caller or a named, reasoned exception. A new door fails this test on the day
 * it is written, and the failure names the file.
 *
 * ## What it deliberately does not cover
 *
 * Raw SQL on its own connection — `scripts/production/**`, `scripts/pilot/**`
 * and the development seeds — can never call a TypeScript function, so
 * asserting over them would either fail forever or give false assurance. They
 * are out of scope by construction, and this comment is where that is written
 * down rather than discovered.
 *
 * There are no database triggers on any of these tables (`create trigger`
 * returns nothing in this repository, and `20260917090000`'s header records
 * that ADR 0008 and ADR 0012 rejected them by name), which is the whole reason
 * a TypeScript-only chokepoint is a complete answer at all.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SERVICES = path.join(process.cwd(), "src", "lib", "services");

/**
 * The chokepoint as a **call**, not as a bare name — finding R-1 of PR 207's
 * first review.
 *
 * Matching `applyAudienceGroupRuleIn` on its own counted a module as covered
 * on the strength of its import line alone. So a door that once called the
 * rule and had the call deleted — a refactor, a reverted experiment, a bad
 * merge — kept passing this file for as long as the now-unused import survived
 * beside it, which is exactly the shape of accident this test exists to catch.
 * The open bracket is what makes a match mean the rule actually runs.
 */
const CHOKEPOINT_NAME = "applyAudienceGroupRuleIn";
const CHOKEPOINT = `${CHOKEPOINT_NAME}(`;

/**
 * The tables an audience is derived from — see `listAudienceCatalogueIn`.
 *
 * The first four decide a General group. The last four are LAN-414's
 * assignment sub-groups, and they are named here rather than left to the
 * General four precisely because B-1 of PR 207's review found them wired into
 * the picker but not into the rule: the blind spot in this list was what let
 * four new doors ship without a chokepoint call and still pass this file.
 */
const GROUP_DECIDING_TABLES = [
  "season_memberships",
  "role_assignments",
  "bps_selections",
  "recruitment_prospects",
  "coach_group_assignments",
  "membership_position_groups",
  "warmup_group_assignments",
  "special_teams_assignments",
] as const;

/**
 * Modules that write one of the four and deliberately do not call the rule.
 *
 * Every entry is a decision, not an oversight, and the reason is the entry.
 */
const DELIBERATE_EXCEPTIONS: Readonly<Record<string, string>> = Object.freeze({
  // Ends a seat and nothing else. An exit is the rule's retraction case, and the
  // retraction only ever removes a rule-added row whose message has not gone —
  // which `replaceRoleHolder` already drives for the outgoing holder. A seat
  // simply ending needs no add, and LAN-341's rule is that somebody who already
  // holds an invitation keeps it.
  "operator-administration/end.ts": "Removal only; LAN-341 keeps existing invitations.",

  // Re-points rows between two people rather than changing anybody's standing.
  // Whether a merge should carry the survivor into the events the absorbed
  // record's groups reach is a question Brian has not been asked; until he is,
  // it does nothing rather than guessing.
  "person-merge/write.ts": "Re-points rows; not a standing change. Open question for Brian.",

  // The shared seat insert (`insertRoleAssignmentIn`). It is a helper, not a
  // door: all three of its callers — assign, replace and invite — call the rule
  // themselves, after the seat exists, which is the only point at which the
  // rule could read it.
  "operator-invitations/cycles.ts": "The shared seat insert; its three callers call the rule.",

  // LAN-360's erasure scrubs free text — names, notes, contact values. It leaves
  // `status`, `is_selected` and every effective date exactly as they were, so it
  // moves nobody between groups.
  "person-erasure/anonymise.ts": "Scrubs free text; leaves every group-deciding column alone.",

  // `identified` → `engaged`. Both are inside the Recruits group, so this is a
  // status change that changes no group.
  "recruitment-questionnaire.ts": "identified → engaged; both are already Recruits.",
});

function serviceFiles(dir: string, prefix = ""): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...serviceFiles(full, `${prefix}${entry}/`));
      continue;
    }
    if (!entry.endsWith(".ts") || entry.endsWith(".test.ts")) continue;
    found.push(`${prefix}${entry}`);
  }
  return found;
}

/** Does this source write one of the four tables, as opposed to only reading it? */
function writesAGroupDecidingTable(source: string): string[] {
  const written: string[] = [];
  for (const table of GROUP_DECIDING_TABLES) {
    const insert = new RegExp(`insert\\s+into\\s+public\\.${table}\\b`, "i");
    // `update public.<table> ... set` — the `set` may be several lines later.
    const update = new RegExp(`update\\s+public\\.${table}\\b[\\s\\S]{0,400}?\\bset\\b`, "i");
    if (insert.test(source) || update.test(source)) written.push(table);
  }
  return written;
}

describe("the audience group rule's chokepoint", () => {
  const files = serviceFiles(SERVICES);

  it("finds the service modules at all, so a pass is not an empty cohort", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("is called by every service module that writes a group-deciding table", () => {
    const missing: string[] = [];
    const covered: string[] = [];

    for (const file of files) {
      const source = readFileSync(path.join(SERVICES, file), "utf8");
      const tables = writesAGroupDecidingTable(source);
      if (tables.length === 0) continue;
      if (source.includes(CHOKEPOINT)) {
        covered.push(file);
        continue;
      }
      if (file in DELIBERATE_EXCEPTIONS) continue;
      missing.push(`${file} writes ${tables.join(", ")} and never calls ${CHOKEPOINT_NAME}`);
    }

    // The failure message is the point: it names the file and what it writes,
    // so whoever wrote the new door knows what to do about it.
    expect(missing).toEqual([]);
    // And a pass produced by finding nothing is not a pass.
    expect(covered.length).toBeGreaterThanOrEqual(6);
  });

  it("keeps the exception list honest — every entry still writes one of the four", () => {
    // `roster-import.ts` is the one door that opts out at its call site rather
    // than by never calling: it reuses `enterReturningPlayer`, which does call
    // the rule, and passes `applyAudienceGroupRule: false` (Brian's decision 8).
    const importer = readFileSync(path.join(SERVICES, "roster-import.ts"), "utf8");
    expect(importer).toContain("applyAudienceGroupRule: false");

    for (const file of Object.keys(DELIBERATE_EXCEPTIONS)) {
      const source = readFileSync(path.join(SERVICES, file), "utf8");
      expect(
        writesAGroupDecidingTable(source).length,
        `${file} is listed as a deliberate exception but no longer writes a group-deciding table — remove it`,
      ).toBeGreaterThan(0);
      expect(
        source.includes(CHOKEPOINT),
        `${file} is listed as a deliberate exception but now calls the chokepoint — remove it`,
      ).toBe(false);
    }
  });

  it("covers every door the issue names", () => {
    const doors = [
      "recruitment-add.ts", // a recruit typed in by an operator
      "recruitment-signup.ts", // the public QR and token doors
      "recruitment-prospect/status.ts", // a recruit's status changing
      "recruitment-prospect/flip.ts", // recruit → onboarding
      "attendance/write.ts", // the walk-up form
      "membership/write-status.ts", // a membership status changing
      "roster/write.ts", // the returner intake
      "roster-board/write-misc.ts", // the BPS flag, the coaching group and both sides' position groups
      "roster-board/write-warmup.ts", // LAN-414: the warmup small group cell
      "roster-board/write-special-teams.ts", // LAN-414: any slot in a special-teams squad
      "operator-administration/assign.ts", // a coaching or committee seat
      "operator-administration/replace.ts", // a handover
      "operator-invitations/invite.ts", // a seat given while creating a login
    ];
    for (const door of doors) {
      const source = readFileSync(path.join(SERVICES, door), "utf8");
      expect(source.includes(CHOKEPOINT), `${door} no longer calls ${CHOKEPOINT_NAME}`).toBe(true);
    }
  });
});
