import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { assertCiLocalExecution } from "../scripts/lib/ci-local-execution.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

function frontMatter(file: string) {
  const raw = read(file);
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw);
  if (!match) throw new Error(`${file} has no frontmatter`);
  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (pair) fields[pair[1]] = pair[2].trim();
  }
  return { fields, body: match[2] };
}

const skillFiles = {
  "start-issue": ".claude/skills/start-issue/SKILL.md",
  "finish-issue": ".claude/skills/finish-issue/SKILL.md",
  "mission-intake": ".claude/skills/mission-intake/SKILL.md",
  "run-mission": ".claude/skills/run-mission/SKILL.md",
  "finish-mission": ".claude/skills/finish-mission/SKILL.md",
} as const;

const agentFiles = {
  "implementation-worker": ".claude/agents/implementation-worker.md",
  "code-reviewer": ".claude/agents/code-reviewer.md",
  scout: ".claude/agents/scout.md",
} as const;

const instructionCaps: Record<string, number> = {
  "AGENTS.md": 250,
  "CLAUDE.md": 41,
  ".claude/skills/run-mission/SKILL.md": 300,
  ".claude/skills/start-issue/SKILL.md": 250,
  ".claude/skills/finish-issue/SKILL.md": 200,
  ".claude/skills/finish-mission/SKILL.md": 103,
  ".claude/skills/mission-intake/SKILL.md": 250,
  ".claude/agents/code-reviewer.md": 150,
  ".claude/agents/implementation-worker.md": 129,
  ".claude/agents/scout.md": 19,
};

describe("lean instruction surface", () => {
  it("keeps every core file below its permanent cap", () => {
    for (const [file, cap] of Object.entries(instructionCaps)) {
      const lines = read(file).trimEnd().split(/\r?\n/).length;
      expect(lines, file).toBeLessThanOrEqual(cap);
    }
  });

  it("defines the lifecycle once and gives every role an intent", () => {
    const all = Object.values({ ...skillFiles, ...agentFiles }).map(read);
    expect(all.filter((source) => /planned\s*→\s*approved/.test(source))).toEqual([]);
    expect((read("AGENTS.md").match(/planned\s*→\s*approved/g) ?? []).length).toBe(1);
    for (const file of Object.values(agentFiles)) expect(read(file)).toMatch(/^## Intent$/m);
    for (const file of Object.values(skillFiles)) expect(read(file)).toMatch(/^## Intent/m);
  });
});

describe("approved workflows and roles", () => {
  it("has exactly five user-invoked skills and three approved agents", () => {
    const skillNames = readdirSync(path.join(root, ".claude", "skills"))
      .filter((entry) => existsSync(path.join(root, ".claude", "skills", entry, "SKILL.md")))
      .sort();
    expect(skillNames).toEqual(Object.keys(skillFiles).sort());
    expect(readdirSync(path.join(root, ".claude", "agents")).sort()).toEqual(
      Object.values(agentFiles)
        .map((file) => path.basename(file))
        .sort(),
    );
    for (const [name, file] of Object.entries(skillFiles)) {
      const parsed = frontMatter(file);
      expect(parsed.fields.name).toBe(name);
      expect(parsed.fields["disable-model-invocation"]).toBe("true");
    }
  });

  it("applies the model ceilings and flat-delegation tool caps", () => {
    const worker = frontMatter(agentFiles["implementation-worker"]);
    const reviewer = frontMatter(agentFiles["code-reviewer"]);
    const scout = frontMatter(agentFiles.scout);
    expect({
      worker: worker.fields.model,
      reviewer: reviewer.fields.model,
      scout: scout.fields.model,
    }).toEqual({ worker: "sonnet", reviewer: "sonnet", scout: "haiku" });
    expect(worker.fields.disallowedTools?.split(/,\s*/)).toEqual(["Agent", "Workflow"]);
    for (const parsed of [reviewer, scout]) {
      expect(parsed.fields.disallowedTools?.split(/,\s*/)).toEqual([
        "Write",
        "Edit",
        "NotebookEdit",
        "Agent",
        "Workflow",
      ]);
    }
  });

  it("keeps mockup conformance structural and leaves styling to the application", () => {
    const reviewer = read(agentFiles["code-reviewer"]);
    expect(reviewer).toMatch(/compare sections and order, row facts and order/);
    expect(reviewer).toMatch(/application—not the mockup—governs button variants/);
    expect(reviewer).toMatch(/structural\s+or copy departure blocks/);
  });
});

describe("protected authority", () => {
  const settings = JSON.parse(read(".claude/settings.json"));
  const deny: string[] = settings.permissions.deny;

  it("disables bypass and denies direct merge, deploy, hosted database, settings, and force routes", () => {
    expect(settings.permissions.disableBypassPermissionsMode).toBe("disable");
    expect(deny).toContain("Bash(gh pr merge *)");
    expect(deny).toEqual(
      expect.arrayContaining([
        "Bash(gh pr ready *)",
        "Bash(git push * main)",
        "Bash(git push --force*)",
        "Bash(gh workflow run *)",
        "Bash(gcloud run *)",
        "Bash(supabase link *)",
        "Bash(supabase db push *)",
        "Bash(gh repo edit *)",
        "Bash(gh ruleset *)",
        "Bash(gh api *)",
        "Edit(./.claude/**)",
      ]),
    );
  });

  it("allows only the narrow GitHub reads and mission-label ask", () => {
    expect(settings.permissions.allow).toEqual(
      expect.arrayContaining([
        "Bash(gh pr edit * --add-label *)",
        "Bash(gh pr checks *)",
        "Bash(gh pr diff *)",
        "Bash(gh pr view *)",
        "Bash(gh run view *)",
      ]),
    );
  });
});

describe("local-only execution gates", () => {
  const pkg = JSON.parse(read("package.json"));

  it("ships the guarded coordinator and CI-only entrypoints", () => {
    for (const command of [
      "dev:slot",
      "db:acquire",
      "db:heartbeat",
      "db:review-ready",
      "db:release",
      "db:cleanup-stale",
      "db:status",
      "db:seed:ci",
      "db:seed-user:ci",
      "test:ci",
      "test:gate:ci",
    ]) {
      expect(pkg.scripts[command], command).toBeTruthy();
    }
    expect(pkg.scripts.test).toBe("vitest run --project unit --project database");
    expect(read(".gitignore").split(/\r?\n/)).toEqual(
      expect.arrayContaining([".lancers-runtime/"]),
    );
  });

  it("refuses CI local-stack commands outside a positively identified runner", () => {
    const runner = {
      CI: "true",
      GITHUB_ACTIONS: "true",
      GITHUB_WORKSPACE: root,
      RUNNER_TEMP: "/tmp",
    };
    expect(() => assertCiLocalExecution({ env: {}, cwd: root })).toThrow();
    expect(() =>
      assertCiLocalExecution({
        env: { ...runner, GITHUB_WORKSPACE: path.dirname(root) },
        cwd: root,
      }),
    ).toThrow();
    expect(() =>
      assertCiLocalExecution({ env: { ...runner, RUNNER_TEMP: "relative" }, cwd: root }),
    ).toThrow();
    expect(() => assertCiLocalExecution({ env: runner, cwd: root })).not.toThrow();
  });

  it("validates browser evidence before recording review-ready", () => {
    const coordinator = read("scripts/local-supabase-coordinator.mjs");
    expect(coordinator.indexOf("requireVisualReviewReadiness")).toBeGreaterThan(-1);
    expect(coordinator.indexOf("requireVisualReviewReadiness")).toBeLessThan(
      coordinator.lastIndexOf('state: "review-ready"'),
    );
  });
});
