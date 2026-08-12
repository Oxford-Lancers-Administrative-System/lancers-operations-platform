// @vitest-environment node
/**
 * The fast lane's eligibility computation (LAN-102, ADR 0017).
 *
 * A lane that merges to `main` without a human reading the diff is only as safe
 * as the rule that decides what may enter it. These assertions are that rule's
 * missing failure: nothing else in the repository breaks if `src/**` quietly
 * stops being excluded, if an unclassifiable path starts defaulting to
 * eligible, or if the classifier gains a parameter through which a pull request
 * could assert its own eligibility.
 *
 * Every expectation below is written out by hand — concrete paths, concrete
 * verdicts. None of it is derived from `.github/fast-lane-rules.json`, because
 * a check whose two sides come from the same source is satisfied by
 * construction and proves nothing.
 *
 * Matrix rows 1, 2, 3, 4, 5, 6, 8 and 13.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  classify,
  classifyPath,
  globToRegExp,
  loadRules,
  parseNameStatus,
} from "../scripts/fast-lane/classify.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const rules = loadRules();

/** One modified file, as git reports it. */
const modified = (...paths: string[]) => paths.map((p) => ({ status: "M", path: p }));

// ---------------------------------------------------------------------------
// Row 1 — eligibility is derived from the diff, and from nothing else
// ---------------------------------------------------------------------------

describe("row 1 — eligibility comes from the diff", () => {
  it("classifies a genuinely eligible batch as eligible", () => {
    const result = classify(
      { files: modified("docs/pilot-data-runbook.md", "docs/local-development.md") },
      rules,
    );
    expect(result.eligible).toBe(true);
    expect(result.classes).toEqual(["documentation"]);
    expect(result.reasons).toEqual([]);
  });

  it("takes no argument through which a pull request could claim eligibility", () => {
    // `classify(diff, rules)` and nothing more. A third parameter carrying a
    // label, a title or a self-assessment is the shape of defect this design
    // exists to prevent, so its absence is asserted rather than assumed.
    expect(classify.length).toBe(2);
    expect(classifyPath.length).toBe(2);
  });

  it("ignores every claim attached to the diff", () => {
    const ineligible = {
      files: modified("docs/local-development.md", "src/app/page.tsx"),
      // Everything an agent could assert about its own work, all at once.
      label: "fast-lane",
      title: "docs: tidy the development guide",
      classification: "documentation",
      eligible: true,
      fastLane: true,
      trailer: "Fast-Lane: yes",
    };
    expect(classify(ineligible, rules).eligible).toBe(false);
  });

  it("refuses an empty diff rather than merging nothing", () => {
    const result = classify({ files: [] }, rules);
    expect(result.eligible).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/empty/i);
  });

  it("refuses the whole batch when a single path is ineligible", () => {
    const result = classify(
      { files: modified("docs/deployment.md", "README.md", "supabase/migrations/0001_init.sql") },
      rules,
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons.join(" ")).toContain("supabase/migrations/0001_init.sql");
  });
});

// ---------------------------------------------------------------------------
// Row 2 — application and production code can never fast-lane
// ---------------------------------------------------------------------------

describe("row 2 — application and production code is never eligible", () => {
  const NEVER_ELIGIBLE = [
    "src/app/page.tsx",
    "src/app/api/health/route.ts",
    "src/lib/supabase/server.ts",
    "src/lib/auth/session.ts",
    "src/lib/db/client.ts",
    "src/proxy.ts",
    "src/theme.ts",
    "supabase/migrations/20260101000000_add_table.sql",
    "supabase/config.toml",
    "supabase/seed.sql",
    "scripts/seed-local.mjs",
    "scripts/lib/local-db.mjs",
    "scripts/check-rls-migrations.mjs",
    "scripts/gcp-bootstrap.sh",
    "scripts/pilot/lan-93/setup.sql",
    "package.json",
    "package-lock.json",
    "Dockerfile",
    ".env.example",
    "next.config.ts",
    "vitest.config.ts",
    ".prettierignore",
    ".gitignore",
    "public/favicon.ico",
    "docs/architecture.md",
    "docs/architecture/data-model.md",
  ];

  it.each(NEVER_ELIGIBLE)("refuses %s by an explicit rule, not by accident", (file) => {
    const result = classifyPath(file, rules);
    expect(result.eligible).toBe(false);
    expect(classify({ files: modified(file) }, rules).eligible).toBe(false);
    // "excluded" means a rule named this path and said no. "unclassified" means
    // it fell off the end and the fail-closed default caught it. Both refuse
    // today, but only the first survives someone widening a class include — so
    // deleting `src/**` from the excluded set must fail here rather than pass
    // because the default happened to cover for it.
    expect(result.verdict, `${file} is refused only by the fail-closed default`).toBe("excluded");
    expect(result.reason).toBeTruthy();
  });

  it("refuses a one-line change and a comment-only change alike", () => {
    // Diff size is not the criterion. A single changed line under src/ is the
    // same verdict as a rewrite.
    const oneLine = {
      files: modified("src/theme.ts"),
      patch: [
        "diff --git a/src/theme.ts b/src/theme.ts",
        "@@ -1 +1 @@",
        "-// a comment",
        "+// a slightly different comment",
      ].join("\n"),
    };
    expect(classify(oneLine, rules).eligible).toBe(false);
  });

  it("refuses a test colocated under src/, where it cannot be told from the code", () => {
    expect(classifyPath("src/lib/supabase/env.test.ts", rules).eligible).toBe(false);
  });

  it("still allows the pilot READMEs that sit beside the excluded SQL", () => {
    expect(classifyPath("scripts/pilot/README.md", rules)).toMatchObject({
      eligible: true,
      class: "documentation",
    });
    expect(classifyPath("scripts/pilot/lan-93/README.md", rules).eligible).toBe(true);
    expect(classifyPath("scripts/pilot/lan-93/cleanup.sql", rules).eligible).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Row 3 — the protected governance rules cannot modify themselves
// ---------------------------------------------------------------------------

describe("row 3 — the lane cannot widen itself", () => {
  const GOVERNANCE = [
    ".github/fast-lane-rules.json",
    ".github/workflows/fast-lane-merge.yml",
    ".github/PULL_REQUEST_TEMPLATE.md",
    "scripts/fast-lane/classify.mjs",
    "scripts/fast-lane/gate.mjs",
    "scripts/fast-lane/cli.mjs",
    "tests/fast-lane-classification.test.ts",
    "tests/fast-lane-gate.test.ts",
    "tests/fast-lane-governance.test.ts",
    "tests/agent-harness.test.ts",
    "docs/fast-lane.md",
    "docs/adr/0017-batched-fast-lane.md",
    "docs/adr/0013-supervised-agent-development.md",
    "docs/adr/0015-graded-review-levels.md",
    "AGENTS.md",
    "CLAUDE.md",
    ".claude/settings.json",
    ".claude/agents/issue-implementer.md",
    ".claude/agents/code-reviewer.md",
    ".claude/skills/supervise-batch/SKILL.md",
  ];

  it.each(GOVERNANCE)("refuses %s as a protected governance rule", (file) => {
    expect(classifyPath(file, rules).verdict).toBe("protected");
  });

  it("refuses a rules edit even when it is buried in a genuine documentation batch", () => {
    const result = classify(
      {
        files: modified(
          "docs/pilot-data-runbook.md",
          "docs/local-development.md",
          ".github/fast-lane-rules.json",
        ),
      },
      rules,
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons.join(" ")).toContain(".github/fast-lane-rules.json");
  });

  it("covers every file that implements the lane, enumerated from disk", () => {
    // Derived from the filesystem rather than from the rules, so that adding a
    // seventh implementation file without protecting it fails here.
    const tracked = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);

    const implementation = tracked.filter(
      (file) =>
        file.startsWith("scripts/fast-lane/") ||
        file.startsWith(".github/") ||
        file.startsWith(".claude/") ||
        file.startsWith("docs/adr/") ||
        file.startsWith("tests/fast-lane-") ||
        file === "tests/agent-harness.test.ts" ||
        file === "docs/fast-lane.md" ||
        file === "AGENTS.md" ||
        file === "CLAUDE.md",
    );

    expect(implementation.length).toBeGreaterThan(15);
    for (const file of implementation) {
      expect(classifyPath(file, rules).verdict, `${file} must be protected`).toBe("protected");
    }
  });
});

// ---------------------------------------------------------------------------
// Row 4 — workflows, including this lane's own, are ineligible
// ---------------------------------------------------------------------------

describe("row 4 — no workflow travels through the lane", () => {
  it.each([
    ".github/workflows/ci.yml",
    ".github/workflows/deploy.yml",
    ".github/workflows/fast-lane-merge.yml",
    ".github/workflows/something-new.yml",
    ".github/dependabot.yml",
  ])("refuses %s", (file) => {
    expect(classifyPath(file, rules).eligible).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Row 5 — anything unclassifiable fails closed
// ---------------------------------------------------------------------------

describe("row 5 — absence of a rule is never permission", () => {
  it.each([
    "unknown-top-level-file.txt",
    "brand-new-directory/thing.ts",
    "brand-new-directory/notes.md",
    "docs/diagram.png",
    "tests/fixture.bin",
    "tests/README.md",
    ".well-known/security.txt",
    "Makefile",
  ])("classifies %s as unclassified, not eligible", (file) => {
    const result = classifyPath(file, rules);
    expect(result.eligible).toBe(false);
    expect(result.verdict).toBe("unclassified");
  });

  it("refuses a deletion, whatever it deletes", () => {
    const result = classify({ files: [{ status: "D", path: "docs/local-development.md" }] }, rules);
    expect(result.eligible).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/status "D"/);
  });

  it("refuses a rename, and judges both names", () => {
    const renamed = classify(
      {
        files: [{ status: "R", path: "docs/renamed.md", previousPath: "docs/original.md" }],
      },
      rules,
    );
    expect(renamed.eligible).toBe(false);
    expect(renamed.reasons.join(" ")).toMatch(/status "R"/);

    // And a rename that carries an ineligible name on either side is refused
    // for that reason too, so neither side can smuggle a path through.
    const smuggled = classify(
      { files: [{ status: "R", path: "docs/notes.md", previousPath: "src/notes.ts" }] },
      rules,
    );
    expect(smuggled.reasons.join(" ")).toContain("src/notes.ts");
  });

  it("parses git's name-status output, including renames, without losing a path", () => {
    const parsed = parseNameStatus(
      ["M\tdocs/a.md", "A\ttests/b.test.ts", "R096\tdocs/old.md\tdocs/new.md", "D\tdocs/c.md"].join(
        "\n",
      ),
    );
    expect(parsed).toEqual([
      { status: "M", path: "docs/a.md" },
      { status: "A", path: "tests/b.test.ts" },
      { status: "R", path: "docs/new.md", previousPath: "docs/old.md" },
      { status: "D", path: "docs/c.md" },
    ]);
  });

  it("does not let a glob leak across a path separator", () => {
    // `docs/*.md` must not match `docs/adr/README.md`; `**` must.
    expect(globToRegExp("docs/*.md").test("docs/adr/README.md")).toBe(false);
    expect(globToRegExp("docs/**/*.md").test("docs/adr/README.md")).toBe(true);
    expect(globToRegExp("docs/**/*.md").test("docs/README.md")).toBe(true);
    expect(globToRegExp("scripts/**").test("scripts/pilot/lan-93/setup.sql")).toBe(true);
    expect(globToRegExp("tests/fast-lane-*.test.ts").test("tests/fast-lane-gate.test.ts")).toBe(
      true,
    );
    expect(globToRegExp("tests/fast-lane-*.test.ts").test("tests/agent-harness.test.ts")).toBe(
      false,
    );
    // A pattern must not match a longer path that merely starts with it.
    expect(globToRegExp("package.json").test("package.json.bak")).toBe(false);
    expect(globToRegExp("AGENTS.md").test("docs/AGENTS.md")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Row 6 — mixed work must be split, never partially merged
// ---------------------------------------------------------------------------

describe("row 6 — mixed work is refused, not partially merged", () => {
  it("refuses eligible work the moment one ineligible file joins it", () => {
    const eligible = classify(
      { files: modified("docs/deployment.md", "docs/migration-runbook.md") },
      rules,
    );
    expect(eligible.eligible).toBe(true);

    const mixed = classify(
      {
        files: modified(
          "docs/deployment.md",
          "docs/migration-runbook.md",
          "src/lib/supabase/server.ts",
        ),
      },
      rules,
    );
    expect(mixed.eligible).toBe(false);
    // The eligible files are still reported as eligible individually — the
    // batch is refused as a whole, which is the point.
    expect(mixed.files.filter((f) => f.eligible).map((f) => f.file)).toEqual([
      "docs/deployment.md",
      "docs/migration-runbook.md",
    ]);
  });

  it("refuses a batch mixing documentation with a test that weakens coverage", () => {
    const patch = [
      "diff --git a/tests/schema-invariants.test.ts b/tests/schema-invariants.test.ts",
      "@@ -1,3 +1,1 @@",
      "-    expect(rows).toHaveLength(3);",
      "-    expect(rows[0].code).toBe('x');",
      "+    // covered elsewhere",
    ].join("\n");
    const result = classify(
      {
        files: modified("docs/deployment.md", "tests/schema-invariants.test.ts"),
        patch,
      },
      rules,
    );
    expect(result.eligible).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Row 8 — coverage may be added or strengthened, never removed or weakened
// ---------------------------------------------------------------------------

describe("row 8 — test changes may not weaken coverage", () => {
  const testPatch = (...body: string[]) =>
    [
      "diff --git a/tests/schema-invariants.test.ts b/tests/schema-invariants.test.ts",
      "@@ -1,1 +1,2 @@",
      ...body,
    ].join("\n");

  const classifyTest = (patch: string) =>
    classify({ files: modified("tests/schema-invariants.test.ts"), patch }, rules);

  it("accepts added coverage", () => {
    const result = classifyTest(
      testPatch(
        "+  it('rejects a null code', () => {",
        "+    expect(insert()).rejects.toThrow();",
        "+  });",
      ),
    );
    expect(result.eligible).toBe(true);
    expect(result.classes).toEqual(["test"]);
  });

  it("accepts a strengthened assertion", () => {
    const result = classifyTest(
      testPatch(
        "-    expect(rows.length).toBeGreaterThan(0);",
        "+    expect(rows).toHaveLength(4);",
        "+    expect(rows[0].code).toBe('PRES');",
      ),
    );
    expect(result.eligible).toBe(true);
  });

  it("refuses a net-negative test change", () => {
    const result = classifyTest(testPatch("-  const a = 1;", "-  const b = 2;", "+  const a = 1;"));
    expect(result.eligible).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/net-negative/i);
  });

  it("refuses a removed assertion even when the line count grows", () => {
    const result = classifyTest(
      testPatch(
        "-    expect(rows).toHaveLength(4);",
        "+    // the length assertion was flaky",
        "+    // and has been removed for now",
        "+    // see the issue",
      ),
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/remove more `expect\(` assertions/i);
  });

  it.each([
    "it.skip(",
    "test.skip(",
    "describe.skip(",
    "it.only(",
    "describe.only(",
    "it.todo(",
    "xit(",
    "xdescribe(",
    ".skipIf(",
    "expect.soft(",
  ])("refuses a test change that introduces %s", (token) => {
    const result = classifyTest(
      testPatch(`+  ${token}'something', () => {`, "+    expect(1).toBe(1);", "+  });"),
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons.join(" ")).toContain(token);
  });

  it("refuses a deleted test file", () => {
    const result = classify(
      { files: [{ status: "D", path: "tests/schema-invariants.test.ts" }] },
      rules,
    );
    expect(result.eligible).toBe(false);
  });

  /**
   * The three escapes an independent reviewer found in the first version of
   * this guard, each of which classified as eligible. They are kept as named
   * cases because the shape they share — a count that nets out across a
   * boundary — is what any future edit to `applyTestGuards` is most likely to
   * reintroduce.
   */
  const crossFilePayment = (addedCount: number, removedCount: number) => ({
    files: [
      { status: "A", path: "tests/added.test.ts" },
      { status: "M", path: "tests/gutted.test.ts" },
    ],
    patch: [
      "diff --git a/tests/added.test.ts b/tests/added.test.ts",
      `@@ -0,0 +1,${addedCount} @@`,
      ...Array.from({ length: addedCount }, () => "+  expect(1).toBe(1);"),
      "diff --git a/tests/gutted.test.ts b/tests/gutted.test.ts",
      `@@ -1,${removedCount} +1,0 @@`,
      ...Array.from({ length: removedCount }, () => "-  expect(realInvariant()).toBe(true);"),
    ].join("\n"),
  });

  it("refuses one added assertion paying for ten removed", () => {
    const result = classify(crossFilePayment(1, 10), rules);
    expect(result.eligible).toBe(false);
  });

  it("refuses ten trivial assertions paying for ten real ones removed elsewhere", () => {
    // The batch nets to zero on both lines and assertion count. Comparing
    // per file is what catches it; batch-wide netting merged it unreviewed.
    const result = classify(crossFilePayment(10, 10), rules);
    expect(result.eligible).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/tests\/gutted\.test\.ts/);
  });

  it("refuses real assertions replaced in place by tautologies", () => {
    // Same file, same line count, same `expect(` count. Only the meaning
    // changed, so an assertion about a bare literal cannot count as coverage.
    const result = classifyTest(
      testPatch(
        "-    expect(rows).toHaveLength(4);",
        "-    expect(rows[0].id).toBe(expectedId);",
        "+    expect(true).toBe(true);",
        "+    expect(1).toBe(1);",
      ),
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/assert something/i);
  });

  it("counts a removed line whose content begins with a SQL comment", () => {
    // `parsePatch` used to skip any line starting `---`, which swallowed
    // content lines beginning `--`. A column-zero `--` is what SQL inside a
    // template literal produces, and this repository's tests are full of it.
    const result = classifyTest(
      testPatch(
        "--- ensure the guard fires",
        "--- and the row is refused",
        "--- and nothing is written",
        "+  const sql = `select 1`;",
      ),
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/net-negative/i);
  });
});

// ---------------------------------------------------------------------------
// Whole-repository sweep — nothing already committed is eligible by accident
// ---------------------------------------------------------------------------

describe("the eligible set, measured against the repository as it actually is", () => {
  const tracked = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);

  it("finds no eligible file anywhere it should not", () => {
    const wronglyEligible = tracked.filter((file) => {
      if (!classifyPath(file, rules).eligible) return false;
      return (
        file.startsWith("src/") ||
        file.startsWith("supabase/") ||
        file.startsWith(".github/") ||
        file.startsWith(".claude/") ||
        file.startsWith("public/") ||
        file.startsWith("docs/adr/") ||
        file.startsWith("docs/architecture") ||
        (file.startsWith("scripts/") && !file.endsWith(".md")) ||
        // Every root-level file except the one README the lane deliberately allows.
        (!file.includes("/") && file !== "README.md")
      );
    });
    expect(wronglyEligible).toEqual([]);
  });

  it("does classify the documentation and test files the lane exists for", () => {
    // The other direction: a rule set that refuses everything is safe and
    // useless. These are files on `main` today.
    for (const file of [
      "docs/pilot-data-runbook.md",
      "docs/local-development.md",
      "docs/deployment.md",
      "docs/migration-runbook.md",
      "scripts/pilot/lan-93/README.md",
      "tests/schema-invariants.test.ts",
      "tests/pilot-data-contract.test.ts",
      "tests/helpers/domain-fixture.ts",
    ]) {
      expect(tracked, `${file} should exist on main`).toContain(file);
      expect(classifyPath(file, rules), `${file} should be eligible`).toMatchObject({
        eligible: true,
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Row 13 — proportionate verification is fixed per class, not chosen
// ---------------------------------------------------------------------------

describe("row 13 — verification per class is checked in, not chosen", () => {
  it("states a non-empty local command list for every eligible class", () => {
    for (const className of Object.keys(rules.classes)) {
      const verification = rules.verification[className];
      expect(verification, `${className} has no verification rule`).toBeDefined();
      expect(verification.local.length, `${className} runs nothing locally`).toBeGreaterThan(0);
      for (const command of verification.local) {
        expect(command).toMatch(/^npm run /);
      }
    }
  });

  it("requires the checks that a change of each class can actually break", () => {
    // Documentation is Prettier-formatted and asserted on by several suites.
    expect(rules.verification.documentation.local).toContain("npm run format:check");
    expect(rules.verification.documentation.local).toContain("npm run test");
    // A test change is TypeScript.
    for (const command of [
      "npm run format:check",
      "npm run lint",
      "npm run typecheck",
      "npm run test",
    ]) {
      expect(rules.verification.test.local).toContain(command);
    }
  });

  it("names commands that exist in package.json", () => {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    for (const className of Object.keys(rules.verification)) {
      if (className.startsWith("_")) continue;
      for (const command of rules.verification[className].local) {
        expect(pkg.scripts, `${command} is not a real command`).toHaveProperty(
          command.replace("npm run ", ""),
        );
      }
    }
  });
});
