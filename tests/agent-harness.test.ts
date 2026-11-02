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
  const allow: string[] = settings.permissions.allow;
  const deny: string[] = settings.permissions.deny;

  it("disables bypass and denies deploy, hosted database, settings, force and delete routes", () => {
    expect(settings.permissions.disableBypassPermissionsMode).toBe("disable");
    expect(deny).toContain("Bash(gh pr merge *)");
    expect(deny).toEqual(
      expect.arrayContaining([
        "Bash(git push --force*)",
        "Bash(git push -f *)",
        "Bash(git push --delete *)",
        "Bash(git push * +*)",
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

  // LAN-523, deliberately. A branch reaches main in one push and the agent that
  // did the work takes it, so the exact `HEAD:main` form is allowed. Nothing
  // that would shadow it may stay in the deny list, because deny wins.
  it("allows exactly the push of HEAD to main and of side branches, and nothing broader", () => {
    expect(allow).toContain("Bash(git push origin HEAD:main)");
    for (const prefix of ["feat", "fix", "docs", "chore"]) {
      expect(allow, prefix).toContain(`Bash(git push origin ${prefix}/*)`);
    }
    expect(allow.filter((entry) => entry.startsWith("Bash(git push"))).not.toContain(
      "Bash(git push origin *)",
    );
    expect(deny).not.toContain("Bash(git push *:main)");
    // Landing still cannot name the local main branch or the long ref form.
    expect(deny).toEqual(
      expect.arrayContaining([
        "Bash(git push * main)",
        "Bash(git push *refs/heads/main*)",
        "Bash(git push *:refs/heads/main*)",
      ]),
    );
    // No allow entry is shadowed by a deny entry of the same prefix.
    const wildcard = (pattern: string) =>
      new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
    for (const entry of allow.filter((value) => value.startsWith("Bash(git push"))) {
      const command = entry.slice("Bash(".length, -1);
      for (const denied of deny.filter((value) => value.startsWith("Bash(git push"))) {
        expect(
          wildcard(denied.slice("Bash(".length, -1)).test(command),
          `${entry} vs ${denied}`,
        ).toBe(false);
      }
    }
  });

  it("allows only the narrow GitHub reads, with no pull-request writes", () => {
    expect(allow).toEqual(
      expect.arrayContaining([
        "Bash(gh pr checks *)",
        "Bash(gh pr diff *)",
        "Bash(gh pr view *)",
        "Bash(gh run view *)",
        "Bash(gh run list *)",
      ]),
    );
    for (const gone of ["Bash(gh pr ready *)", "Bash(gh pr comment *)"]) {
      expect(allow).not.toContain(gone);
    }
    expect(allow.some((entry) => entry.startsWith("Bash(gh pr edit"))).toBe(false);
  });
});

// LAN-523. `settings.json` permissions are session-wide, so the restriction of
// pushing to main to two roles cannot be enforced mechanically. It is enforced
// by the written rule, and this is what makes the written rule binding.
describe("the merge rule is written into every role", () => {
  const MAY_PUSH = ["start-issue", "run-mission"] as const;

  it("states the rule exactly once, in AGENTS.md", () => {
    const agents = read("AGENTS.md");
    expect((agents.match(/A branch reaches `main` exactly once/g) ?? []).length).toBe(1);
    expect(agents).toMatch(/No agent deploys, ever\./);
    expect(agents).toMatch(/Only `\/start-issue` and `\/run-mission` may push to `main`/);
    expect(agents).not.toMatch(/pull request leaves draft|lift the draft/i);
    for (const file of Object.values({ ...skillFiles, ...agentFiles })) {
      expect((read(file).match(/A branch reaches `main` exactly once/g) ?? []).length, file).toBe(
        0,
      );
    }
  });

  it("gives the two pushing roles the three conditions", () => {
    for (const name of MAY_PUSH) {
      const source = read(skillFiles[name]);
      expect(source, name).toMatch(/Pushing to `main` is the last act of the work/);
      expect(source, name).toMatch(/every local check passed at the exact current head/);
      expect(source, name).toMatch(/review is clear at that head/);
      expect(source, name).toMatch(/Brian's visual approval is\s+recorded against that same head/);
      expect(source, name).toMatch(/Never force-push/);
      expect(source, name).toMatch(/never rebase/);
    }
  });

  it("forbids every other role from pushing to main", () => {
    const others = { ...skillFiles, ...agentFiles };
    for (const name of MAY_PUSH) delete (others as Record<string, string>)[name];
    expect(Object.keys(others).sort()).toEqual(
      [
        "code-reviewer",
        "finish-issue",
        "finish-mission",
        "implementation-worker",
        "mission-intake",
        "scout",
      ].sort(),
    );
    for (const [name, file] of Object.entries(others)) {
      const source = read(file);
      expect(source, name).toMatch(/push[^.]*`main`/i);
      expect(source, name).not.toMatch(/Pushing to `main` is the last act/);
    }
  });

  it("leaves no pull request, draft, label, receipt or fast lane in the instruction surface", () => {
    for (const file of [
      "AGENTS.md",
      "CLAUDE.md",
      ...Object.values({ ...skillFiles, ...agentFiles }),
    ]) {
      const source = read(file);
      for (const gone of ["fast-lane", "fast lane", "mission-merge", "gh pr ready", "draft pr"]) {
        expect(source.toLowerCase(), `${file}: ${gone}`).not.toContain(gone);
      }
    }
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
