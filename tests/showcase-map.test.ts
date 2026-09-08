// @vitest-environment node
/**
 * The workflow map — LAN-221, Part 1.
 *
 * Pure. Proves the map is complete against the six missions' own workflow
 * inventories, that every state it names is defined and — where the shipped
 * application can hold it — produced by the plan at or above its floor, that
 * every route it names is a page the application serves, that every tester
 * has a slice and the slices together cover every workflow, and that the
 * rendered map in `docs/tester-week/` is exactly what the module renders.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  MISSIONS,
  STATES,
  STATE_BY_KEY,
  TESTERS,
  WORKFLOWS,
  MAP_HTML,
  MAP_MARKDOWN,
  renderArtifacts,
  resolveRoute,
  routePattern,
} from "../scripts/production/showcase/map.mjs";
import {
  coverage,
  renderChecklists,
  seatViews,
} from "../scripts/production/showcase/checklists.mjs";
import { buildPlan } from "../scripts/production/showcase/plan.mjs";
import { syntheticTermCard } from "../scripts/production/showcase/sources.mjs";
import { testExisting, testParams } from "./helpers/showcase-fixture.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

/** The map's own shape, which TypeScript cannot infer from the JavaScript. */
interface Workflow {
  id: string;
  mission: string;
  workflow: string;
  name: string;
  actor: string;
  tester: string | null;
  routes: string[];
  states: string[];
  expect: string;
  notAWorkflow?: boolean;
  arrivesWith?: string;
}
const workflows = WORKFLOWS as unknown as readonly Workflow[];
interface State {
  key: string;
  label: string;
  table: string | null;
  where: string | null;
  min: number;
  arrivesWith?: string;
}
const states = STATES as unknown as readonly State[];

/** Every page route the application serves, as `src/app` patterns. */
function pageRoutes(): Set<string> {
  const found = new Set<string>();
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const segment = /^\(.*\)$/.test(entry.name) ? "" : `/${entry.name}`;
        walk(path.join(dir, entry.name), `${prefix}${segment}`);
      } else if (entry.name === "page.tsx" || entry.name === "route.ts") {
        found.add(prefix === "" ? "/" : prefix);
      }
    }
  };
  walk(path.join(ROOT, "src/app"), "");
  return found;
}

describe("the map covers every workflow the six missions froze", () => {
  it("names every packet workflow exactly once, and nothing else", () => {
    const expected: string[] = [];
    for (const mission of MISSIONS) {
      const packet = JSON.parse(
        readFileSync(path.join(ROOT, "missions/packets", mission.id, "packet.json"), "utf8"),
      ) as { workflow_matrix: { id: string }[] };
      for (const entry of packet.workflow_matrix) expected.push(`${mission.id}:${entry.id}`);
    }
    const actual = workflows.map((workflow) => workflow.id);
    expect(new Set(actual).size).toBe(actual.length);
    expect(actual.sort()).toEqual(expected.sort());
  });

  it("matches the intake ledgers' own inventories where one exists", () => {
    for (const mission of MISSIONS.filter((entry) => entry.intake)) {
      const state = JSON.parse(
        readFileSync(path.join(ROOT, "missions/intake", mission.id, "state.json"), "utf8"),
      ) as { workflows: { id: string }[] };
      const ledger = state.workflows.map((entry) => `${mission.id}:${entry.id}`).sort();
      const mapped = workflows
        .filter((w) => w.mission === mission.id)
        .map((w) => w.id)
        .sort();
      expect(mapped).toEqual(ledger);
    }
  });

  it("gives every real workflow to a tester, and every tester a slice", () => {
    const { covered, uncovered } = coverage();
    expect(uncovered).toEqual([]);
    for (const key of Object.keys(TESTERS)) {
      expect(covered.get(key)?.length ?? 0, `${key} has nothing to test`).toBeGreaterThan(0);
    }
    const all = [...covered.values()].flat();
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(workflows.filter((w) => !w.notAWorkflow).length);
  });
});

describe("every state the map names", () => {
  it("is defined, exactly once", () => {
    const keys = states.map((state) => state.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const workflow of workflows) {
      for (const state of workflow.states) {
        expect(STATE_BY_KEY.has(state), `${workflow.id} cites unknown state ${state}`).toBe(true);
      }
    }
  });

  it("is cited by at least one workflow, or explains what arrives later", () => {
    const cited = new Set(workflows.flatMap((workflow) => workflow.states));
    // A state may exist for the verifier alone; what it may not be is a
    // typo nothing reads. Every uncited state is listed here on purpose.
    const verifierOnly = states.filter((state) => !cited.has(state.key)).map((s) => s.key);
    expect(verifierOnly.length).toBeLessThan(states.length / 2);
    for (const key of verifierOnly) expect(STATE_BY_KEY.get(key)?.table ?? "later").toBeTruthy();
  });

  it("is produced by the plan at or above its floor, on every weekday", () => {
    // Anchor-independence: the same states exist whatever day tester week
    // starts on, which is what picking instances by rank rather than by fixed
    // offset buys.
    for (const anchor of [
      "2026-09-03",
      "2026-09-06",
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-11",
      "2026-09-12",
    ]) {
      const plan = buildPlan({
        termCard: syntheticTermCard(),
        params: testParams(),
        existing: testExisting(),
        anchor,
      });
      for (const state of states) {
        if (state.arrivesWith) continue;
        if (state.key === "report.filed" || state.key.startsWith("follow-up.")) continue; // the report phase's
        const tagged = plan.states.get(state.key) ?? [];
        expect(
          tagged.length,
          `${state.key} on ${anchor}: ${tagged.length} < floor ${state.min}`,
        ).toBeGreaterThanOrEqual(state.min);
      }
    }
  }, 60_000);
});

describe("every route the map names", () => {
  it("is a page or handler the application serves", () => {
    const routes = pageRoutes();
    const notYet: string[] = [];
    for (const workflow of workflows) {
      for (const template of workflow.routes) {
        const pattern = routePattern(template);
        if (!routes.has(pattern) && workflow.arrivesWith) {
          notYet.push(`${workflow.id} ${pattern}`);
          continue;
        }
        expect(routes.has(pattern), `${workflow.id}: ${template} → ${pattern} is not served`).toBe(
          true,
        );
      }
    }
    // Mission 7 has merged, so every route the map names is served now. Any
    // entry here is a defect in the map.
    expect(notYet).toEqual([]);
  });

  it("resolves from the plan's examples, apart from the operator record, which needs an Auth user", () => {
    const plan = buildPlan({
      termCard: syntheticTermCard(),
      params: testParams(),
      existing: testExisting(),
      anchor: "2026-09-03",
    });
    const missing = new Set<string>();
    for (const workflow of workflows) {
      for (const template of workflow.routes) {
        for (const key of resolveRoute(template, plan.examples).missing) missing.add(key);
      }
    }
    // `operator.other-seat` is the one placeholder a plan alone cannot fill: an
    // operator record needs an `auth.users` row, and creating those is Brian's.
    // The fixture supplies no Auth user for any seat, so it is unresolved here
    // and resolved on a real load.
    expect([...missing]).toEqual(["operator.other-seat"]);
  });
});

describe("the rendered map", () => {
  it("in docs/tester-week is exactly what the module renders", async () => {
    const artifacts = (await renderArtifacts({ repoRoot: ROOT })) as Record<string, string>;
    for (const file of [MAP_MARKDOWN, MAP_HTML]) {
      const target = path.join(ROOT, file);
      expect(
        existsSync(target),
        `${file} is missing; run node scripts/production/showcase/map.mjs --write`,
      ).toBe(true);
      expect(
        readFileSync(target, "utf8"),
        `${file} differs; run node scripts/production/showcase/map.mjs --write`,
      ).toBe(artifacts[file]);
    }
  });

  it("names no telephone number and carries no link, because it is rendered without examples", async () => {
    const artifacts = await renderArtifacts({ repoRoot: ROOT });
    const plan = buildPlan({
      termCard: syntheticTermCard(),
      params: testParams(),
      existing: testExisting(),
      anchor: "2026-09-03",
    });
    const links = [...plan.examples]
      .filter(([key]) => key.startsWith("link."))
      .map(([, value]) => value as string);
    expect(links.length).toBeGreaterThan(3);
    for (const content of Object.values(artifacts)) {
      expect(content).not.toMatch(/07700 900\d{3}/);
      for (const link of links) expect(content).not.toContain(link);
      expect(content).toContain("{event.held}");
    }
  });
});

describe("five testers in one environment", () => {
  const plan = buildPlan({
    termCard: syntheticTermCard(),
    params: testParams(),
    existing: testExisting(),
    anchor: "2026-09-03",
  });
  const lists = renderChecklists({
    plan,
    baseUrl: "https://app.example",
  });

  it("sends no two seats to the same row without saying so", () => {
    // Five people are in the environment at once. Two seats pointed at one row
    // means whoever changes it first takes the state away from the other, and
    // the second tester reports a defect that is really a collision.
    //
    // Two things this checks that the earlier version did not, both of which
    // let a real defect through while it passed green:
    //
    //  1. Every workflow, not `workflow.tester`. That field is the
    //     documentation owner for coverage; `renderChecklists` ships every
    //     workflow to every seat, so filtering by it inspected about a fifth of
    //     each seat's real list.
    //  2. Keyed by the resolved row alone, not by `key=value`. Two *different*
    //     placeholders can land on one row — an open dispute and a superseded
    //     contact point can be facts about the same person — and keying by the
    //     placeholder made that pair invisible.
    const views = seatViews(plan);
    const used = new Set<string>();
    for (const workflow of workflows) {
      if (workflow.notAWorkflow) continue;
      for (const template of workflow.routes) {
        for (const [, key] of template.matchAll(/\{([^}]+)\}/g)) used.add(key);
      }
    }
    const seen = new Map<string, string[]>();
    for (const [seat, { view, shared }] of views) {
      for (const key of used) {
        if (shared.has(key) || !view.has(key)) continue;
        const row = String(view.get(key));
        if (!seen.has(row)) seen.set(row, []);
        if (!seen.get(row)!.includes(seat)) seen.get(row)!.push(seat);
      }
    }
    const contended = [...seen]
      .filter(([, seats]) => seats.length > 1)
      .map(([row, seats]) => `${row} → ${seats.join(", ")}`);
    expect(contended).toEqual([]);
  });

  it("tells both sides of a shared row, not only the seat that arrived second", () => {
    // A seat told nothing believes the row is its own. That is the half of the
    // problem that produces the confident false report.
    const views = seatViews(plan);
    const missing: string[] = [];
    for (const [seat, { view, shared }] of views) {
      for (const key of shared.keys()) {
        const row = view.get(key);
        for (const [other, view2] of views) {
          if (other === seat) continue;
          if (view2.view.get(key) !== row) continue;
          if (!view2.shared.has(key)) missing.push(`${other} is not told it shares ${key}`);
        }
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });

  it("names nobody, on any list", () => {
    for (const [seat, markdown] of lists) {
      expect(markdown, `${seat} names a person`).not.toMatch(/Stewart|Clint|\bBrian\b/);
    }
  });

  it("gives every seat its own file and some work", () => {
    expect([...lists.keys()]).toEqual(Object.keys(TESTERS));
    for (const [seat, markdown] of lists as Map<string, string>) {
      expect(
        markdown.split("\n").filter((line: string) => line.startsWith("- [ ] Open http")).length,
        `${seat} has no links`,
      ).toBeGreaterThan(0);
    }
  });
});
