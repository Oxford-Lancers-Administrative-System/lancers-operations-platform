import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { assertCiLocalExecution } from "../scripts/lib/ci-local-execution.mjs";

const root = path.resolve(import.meta.dirname, "..");
const agents = path.join(root, ".claude", "agents");
const skills = path.join(root, ".claude", "skills");

function frontMatter(file: string) {
  const raw = readFileSync(file, "utf8");
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw);
  if (!match) throw new Error(`${file} has no front matter`);
  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (pair) fields[pair[1]] = pair[2].trim();
  }
  return { fields, body: match[2] };
}

const flat = (value: string) => value.replace(/\*\*/g, "").replace(/\s+/g, " ");
const skillPath = path.join(skills, "start-issue", "SKILL.md");
const reviewerPath = path.join(agents, "code-reviewer.md");
const skill = frontMatter(skillPath);
const reviewer = frontMatter(reviewerPath);
const agreement = readFileSync(path.join(root, "AGENTS.md"), "utf8");
const pullRequestTemplate = readFileSync(
  path.join(root, ".github", "PULL_REQUEST_TEMPLATE.md"),
  "utf8",
);
const settings = JSON.parse(readFileSync(path.join(root, ".claude", "settings.json"), "utf8"));

describe("single-issue Claude workflow", () => {
  it("has one user-invoked skill and no obsolete batch artifacts", () => {
    expect(readdirSync(skills)).toEqual(["start-issue"]);
    expect(skill.fields.name).toBe("start-issue");
    expect(skill.fields["disable-model-invocation"]).toBe("true");
    expect(skill.fields["argument-hint"]).toBe("LAN-###");
    expect(existsSync(path.join(skills, "supervise-batch"))).toBe(false);
  });

  it("requires exactly one explicit Linear identifier and never selects more work", () => {
    const body = flat(skill.body);
    expect(body).toMatch(/match exactly `\^LAN-\[0-9\]\+\$`/i);
    expect(body).toMatch(
      /Refuse a missing argument, extra words, comma-separated identifiers, or more than one identifier/i,
    );
    expect(body).toMatch(/Never select another issue or begin a batch/i);
  });

  it("makes the top-level session implement and permits only review delegation", () => {
    expect(readdirSync(agents)).toEqual(["code-reviewer.md"]);
    expect(flat(skill.body)).toMatch(/Do not launch an implementation sub-agent/i);
    expect(flat(skill.body)).toMatch(/launch exactly one fresh-context `code-reviewer`/i);
    expect(reviewer.fields.disallowedTools).toContain("Agent");
    expect(reviewer.fields.disallowedTools).toContain("Workflow");
  });

  it("creates or resumes exactly one issue worktree and preserves the primary checkout", () => {
    const body = flat(skill.body);
    expect(body).toMatch(/EnterWorktree/i);
    expect(body).toMatch(/inspect `git worktree list --porcelain`/i);
    expect(body).toMatch(/safely resume/i);
    expect(body).toMatch(/Never create a duplicate and never reuse another issue's worktree/i);
    expect(body).toMatch(/primary checkout must remain unchanged and clean/i);
    expect(body).toMatch(/All subsequent commands run from the issue worktree/i);
    expect(body).toMatch(/Never delete a dirty, interrupted, unmerged, or review-ready worktree/i);
  });

  it("keeps Linear evidence deliberately small", () => {
    expect(flat(skill.body)).toMatch(
      /only workflow records are this start status, the eventual PR link, and one final evidence\/handoff comment/i,
    );
    expect(flat(skill.body)).toMatch(
      /Do not set In Review unless human or visual acceptance is genuinely pending/i,
    );
  });

  it("resolves routine problems without weakening genuine stop conditions", () => {
    const body = flat(skill.body);
    expect(body).toMatch(
      /Stop only for a genuine owner decision, irreconcilable authoritative conflict, missing access or credential, or a technical blocker/i,
    );
    expect(body).toMatch(
      /Routine engineering choices, test failures, local-environment faults, and recoverable tooling problems belong to this session/i,
    );
  });
});

describe("graded review routing", () => {
  it("defines and routes Low, Normal, and Highest by reachability and blast radius", () => {
    const body = flat(skill.body);
    expect(body).toMatch(
      /Assign review before implementation from reachability and blast radius, never diff size/i,
    );
    expect(body).toMatch(/Low.*Top-level verification only; no independent reviewer/i);
    expect(body).toMatch(/Normal.*One fresh-context `code-reviewer`/i);
    expect(body).toMatch(
      /Highest.*Authentication, authorization, migrations, grants\/RLS, secrets, privileged credentials, production-affecting workflows, or the agent harness itself/i,
    );
    expect(body).toMatch(/unspecified grade resolves to Normal/i);
    expect(body).toMatch(/raise the grade.*never lower it/i);
  });

  it("requires a fresh re-review after any Highest-risk correction", () => {
    const body = flat(skill.body);
    expect(body).toMatch(/any correction invalidates the prior result/i);
    expect(body).toMatch(/launch a fresh reviewer to review the corrected head/i);
    expect(flat(reviewer.body)).toMatch(/Never treat this review as covering a later commit/i);
  });

  it("pins review and CI to the current PR head", () => {
    expect(flat(skill.body)).toMatch(/GitHub Actions for the current PR head SHA/i);
    expect(flat(skill.body)).toMatch(/CI for an older SHA is not evidence/i);
    expect(flat(reviewer.body)).toMatch(/HEAD_SHA=.*headRefOid/i);
    expect(flat(reviewer.body)).toMatch(/If it moved, the review is stale/i);
  });

  it("keeps independent review read-only and adversarial", () => {
    for (const tool of ["Write", "Edit", "NotebookEdit"])
      expect(reviewer.fields.disallowedTools).toContain(tool);
    expect(reviewer.fields.isolation).toBe("worktree");
    expect(flat(reviewer.body)).toMatch(/inject one plausible defect/i);
    expect(flat(reviewer.body)).toMatch(
      /Never stage, commit, push, or leave an injected defect behind/i,
    );
    expect(flat(reviewer.body)).toMatch(/Do not repair anything/i);
  });
});

describe("zero-command visual acceptance", () => {
  const body = flat(skill.body);

  it("classifies UI, nonvisual, and mixed work without adding a visual stop to nonvisual work", () => {
    expect(body).toMatch(/classify the issue as `UI-affecting`, `nonvisual`, or `mixed`/i);
    expect(body).toMatch(/Mixed work uses the visual gate only for its user-visible portion/i);
    expect(body).toMatch(/Nonvisual work skips this checkpoint entirely/i);
  });

  it("places owner visual acceptance before final current-commit independent review", () => {
    expect(body).toMatch(/before final verification and independent correctness review/i);
    expect(body).toMatch(/Do not launch final independent review/i);
    expect(body).toMatch(/Once Brian approves, run final verification at the current commit/i);
    expect(body).toMatch(/Independent correctness review is final/i);
  });

  it("keeps visual-pending work draft and not PR-ready", () => {
    expect(body).toMatch(/draft PR remains draft/i);
    expect(body).toMatch(/visual-pending, not complete or PR-ready/i);
  });

  it("requires browser-proven URL, login, seeded states, viewports, and protected lease", () => {
    expect(body).toMatch(/use a browser to open the supplied URL, sign in/i);
    expect(body).toMatch(/working URL, real login, seeded states, desktop and 375px evidence/i);
    expect(body).toMatch(/mark the slot `review-ready`/i);
    expect(body).toMatch(/Do not claim readiness from scripts or HTTP probes alone/i);
    expect(body).toMatch(/db:review-ready.*validates that record and fails closed/i);
  });

  it("gives Brian no commands or setup actions", () => {
    for (const source of [skill.body, pullRequestTemplate]) {
      expect(flat(source)).toContain("Commands Brian must run: None");
      expect(flat(source)).toContain("Database/setup actions Brian must perform: None");
      expect(flat(source)).toContain("Production actions Brian must perform: None");
      expect(source).not.toMatch(/credential-retrieval|retrieval command|sed -n '1,2p'/i);
    }
    expect(body).toMatch(/continue troubleshooting/i);
    expect(body).toMatch(
      /genuine missing-access, external-service, permission, or owner-decision/i,
    );
  });
});

describe("production and security boundaries", () => {
  it("preserves draft-only, human-merge, no-deploy, and local-only Supabase rules", () => {
    for (const text of [flat(skill.body), flat(agreement)]) {
      expect(text).toMatch(/draft/i);
      expect(text).toMatch(/never.*merge/i);
      expect(text).toMatch(/never.*un-draft/i);
      expect(text).toMatch(/never.*deploy/i);
      expect(text).toMatch(/hosted Supabase/i);
    }
    expect(flat(skill.body)).toMatch(/never use the fast lane/i);
  });

  it("keeps bypass disabled and common unsafe commands denied", () => {
    expect(settings.permissions.disableBypassPermissionsMode).toBe("disable");
    const deny: string[] = settings.permissions.deny;
    for (const rule of [
      "Bash(gh pr merge *)",
      "Bash(gh pr ready *)",
      "Bash(git push --force*)",
      "Bash(gh workflow run *)",
      "Bash(supabase link *)",
      "Bash(npx supabase db push *)",
      "Bash(gh api *)",
      "Edit(./.claude/**)",
    ])
      expect(deny).toContain(rule);
  });

  it("blocks merging and un-drafting a pull request", () => {
    const deny: string[] = settings.permissions.deny;
    expect(deny).toContain("Bash(gh pr merge *)");
    expect(deny).toContain("Bash(gh pr ready *)");
  });

  it("retains UX and automated-delivery owner gates", () => {
    const body = flat(skill.body);
    expect(body).toMatch(/LAN-90 UX gate/i);
    expect(body).toMatch(/LAN-92 automated-WhatsApp decision gate/i);
    expect(body).toMatch(
      /Manual posting or distribution is never an MVP, pilot, fallback, or completion path/i,
    );
  });
});

describe("local Supabase workflow contract", () => {
  it("requires acquisition and guarded database commands", () => {
    const body = flat(skill.body);
    expect(body).toMatch(/npm run db:acquire -- LAN-###/i);
    expect(body).toMatch(/validate the current fencing token/i);
    expect(body).toMatch(/primary first and overflow only when primary is genuinely occupied/i);
    expect(body).toMatch(/Never edit tracked `supabase\/config.toml`/i);
  });

  it("ships all coordinator operations and ignores generated state", () => {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    for (const command of [
      "dev:slot",
      "db:acquire",
      "db:heartbeat",
      "db:review-ready",
      "db:release",
      "db:cleanup-stale",
      "db:status",
    ]) {
      expect(pkg.scripts[command]).toBeTruthy();
    }
    expect(readFileSync(path.join(root, ".gitignore"), "utf8")).toMatch(/^\.lancers-runtime\/$/m);
    expect(pkg.scripts.pretest).toMatch(/require-local-supabase-lease/);
    expect(
      readFileSync(path.join(root, "scripts", "local-supabase-coordinator.mjs"), "utf8"),
    ).toMatch(/findOwningSessionPid/);
  });

  it("keeps developer database commands fenced while CI uses explicit local-only entry points", () => {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    const workflow = readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");

    expect(pkg.scripts["db:seed"]).toMatch(/local-supabase-command/);
    expect(pkg.scripts["db:seed-user"]).toMatch(/local-supabase-command/);
    expect(pkg.scripts.test).toBe("vitest run");
    expect(pkg.scripts.pretest).toMatch(/require-local-supabase-lease/);

    for (const command of ["db:seed:ci", "db:seed-user:ci", "test:ci"])
      expect(pkg.scripts[command]).toMatch(/ci-local-command/);
    expect(workflow).toContain("npm run db:seed:ci");
    expect(workflow).toContain("npm run db:seed-user:ci");
    expect(workflow).toContain("npm run test:ci");
    expect(workflow).not.toMatch(/run: npm run (db:seed|db:seed-user|test)$/m);
  });

  it("refuses every unfenced CI entry point outside a positively identified runner workspace", () => {
    const cwd = root;
    const runner = {
      CI: "true",
      GITHUB_ACTIONS: "true",
      GITHUB_WORKSPACE: cwd,
      RUNNER_TEMP: "/tmp",
    };

    expect(() => assertCiLocalExecution({ env: {}, cwd })).toThrow(/restricted to GitHub Actions/i);
    expect(() => assertCiLocalExecution({ env: { ...runner, CI: "false" }, cwd })).toThrow(
      /restricted to GitHub Actions/i,
    );
    expect(() =>
      assertCiLocalExecution({ env: { ...runner, GITHUB_ACTIONS: "false" }, cwd }),
    ).toThrow(/restricted to GitHub Actions/i);
    expect(() =>
      assertCiLocalExecution({ env: { ...runner, GITHUB_WORKSPACE: path.dirname(cwd) }, cwd }),
    ).toThrow(/GITHUB_WORKSPACE/i);
    expect(() =>
      assertCiLocalExecution({ env: { ...runner, RUNNER_TEMP: "relative" }, cwd }),
    ).toThrow(/RUNNER_TEMP/i);
    expect(() => assertCiLocalExecution({ env: runner, cwd })).not.toThrow();
  });

  it("executes the CI identity guard before command dispatch", () => {
    const command = path.join(root, "scripts", "ci-local-command.mjs");
    const invoke = (overrides: Record<string, string> = {}) =>
      spawnSync(process.execPath, [command, "unknown"], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          CI: "",
          GITHUB_ACTIONS: "",
          GITHUB_WORKSPACE: "",
          RUNNER_TEMP: "",
          ...overrides,
        },
      });

    const outsideCi = invoke();
    expect(outsideCi.status).toBe(1);
    expect(outsideCi.stderr).toMatch(/restricted to GitHub Actions/i);
    expect(outsideCi.stderr).not.toMatch(/Unknown CI local-stack operation/i);

    const wrongWorkspace = invoke({
      CI: "true",
      GITHUB_ACTIONS: "true",
      GITHUB_WORKSPACE: path.dirname(root),
      RUNNER_TEMP: "/tmp",
    });
    expect(wrongWorkspace.stderr).toMatch(/GITHUB_WORKSPACE/i);
    expect(wrongWorkspace.stderr).not.toMatch(/Unknown CI local-stack operation/i);

    const validRunner = invoke({
      CI: "true",
      GITHUB_ACTIONS: "true",
      GITHUB_WORKSPACE: root,
      RUNNER_TEMP: "/tmp",
    });
    expect(validRunner.status).toBe(1);
    expect(validRunner.stderr).toMatch(/Unknown CI local-stack operation/i);
  });

  it("records the superseding decision", () => {
    const adr = readFileSync(
      path.join(root, "docs", "adr", "0018-single-issue-agent-development.md"),
      "utf8",
    );
    expect(adr).toMatch(/Supersedes[\s\S]*0013[\s\S]*0015/i);
    expect(adr).toMatch(/Two-slot local Supabase coordinator/i);
    expect(readFileSync(path.join(root, "docs", "adr", "README.md"), "utf8")).toContain(
      "0018-single-issue-agent-development.md",
    );
  });

  it("keeps the fixed review credential in shared protected state and provisions on start/reset", () => {
    const command = readFileSync(path.join(root, "scripts", "local-supabase-command.mjs"), "utf8");
    const account = readFileSync(
      path.join(root, "scripts", "lib", "local-review-account.mjs"),
      "utf8",
    );
    expect(account).toContain("brian.daniel.schuster@gmail.com");
    expect(account).toMatch(/coordinatorPaths/);
    expect(account).toMatch(/mode: 0o600/);
    expect(command).toMatch(/operation === "start"[\s\S]*provisionReviewState/);
    expect(command).toMatch(/operation === "reset"[\s\S]*provisionReviewState/);
    expect(command).not.toMatch(/randomBytes/);
    expect(command).not.toMatch(/review-credentials/);
    expect(command).not.toMatch(/`TEST_USER_PASSWORD=\$\{reviewAccount\.password\}`/);
    expect(readFileSync(path.join(root, "supabase", "config.toml"), "utf8")).toMatch(
      /minimum_password_length = 8/,
    );
  });

  it("makes the existing review-ready command validate browser evidence", () => {
    const coordinator = readFileSync(
      path.join(root, "scripts", "local-supabase-coordinator.mjs"),
      "utf8",
    );
    expect(coordinator).toMatch(/requireVisualReviewReadiness/);
    expect(coordinator.indexOf("requireVisualReviewReadiness")).toBeLessThan(
      coordinator.lastIndexOf('state: "review-ready"'),
    );
  });
});
