import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * The supervised parallel-development harness (docs/adr/0013) is configuration,
 * not code: nothing else in the repository fails if someone quietly drops
 * `isolation: worktree`, hands the reviewer an editing tool, or adds a third
 * role. These assertions are that missing failure. They read the checked-in
 * files only — no agent is launched, and nothing here talks to a network,
 * a database, or GitHub.
 */

const repoRoot = path.resolve(import.meta.dirname, "..");
const agentsDir = path.join(repoRoot, ".claude", "agents");
const skillsDir = path.join(repoRoot, ".claude", "skills");

/**
 * Minimal YAML front-matter reader. The harness files use only scalar keys, so
 * this deliberately understands nothing else: a definition that needs richer
 * YAML is a definition that has outgrown "the minimum roles" and should be
 * discussed rather than silently accommodated.
 */
function frontMatter(file: string): { fields: Record<string, string>; body: string } {
  const raw = readFileSync(file, "utf8");
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw);
  if (!match) throw new Error(`${path.relative(repoRoot, file)} has no YAML front matter`);

  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (kv) fields[kv[1]] = kv[2].trim();
  }
  return { fields, body: match[2] };
}

/** `disallowedTools: Write, Edit` -> ["Write", "Edit"] */
function toolList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

describe("agent harness: roles", () => {
  const agentFiles = readdirSync(agentsDir).filter((name) => name.endsWith(".md"));

  it("defines exactly the two approved roles", () => {
    // ADR 0013 approves one implementer and one reviewer. A third role is a
    // scope change that needs Brian, not a new file.
    const names = agentFiles.map((file) => frontMatter(path.join(agentsDir, file)).fields.name);
    expect(names.sort()).toEqual(["code-reviewer", "issue-implementer"]);
  });

  it("gives every role a description, so the lead can tell them apart", () => {
    for (const file of agentFiles) {
      const { fields } = frontMatter(path.join(agentsDir, file));
      expect(fields.description ?? "").not.toHaveLength(0);
    }
  });

  it("isolates the implementer in its own worktree", () => {
    // Without this, two implementers share one checkout and overwrite each
    // other. It is the single assumption the two-worker model rests on.
    const { fields } = frontMatter(path.join(agentsDir, "issue-implementer.md"));
    expect(fields.isolation).toBe("worktree");
  });

  it("keeps the reviewer read-only and out of the main checkout", () => {
    const { fields } = frontMatter(path.join(agentsDir, "code-reviewer.md"));
    const denied = toolList(fields.disallowedTools);

    for (const writer of ["Write", "Edit", "NotebookEdit"]) {
      expect(denied).toContain(writer);
    }
    // An explicit `tools` allowlist would re-admit whatever it lists, so the
    // reviewer must not carry one alongside the denials.
    expect(fields.tools).toBeUndefined();
    expect(fields.isolation).toBe("worktree");
  });

  it("stops either role from growing an agent hierarchy of its own", () => {
    for (const file of agentFiles) {
      const denied = toolList(frontMatter(path.join(agentsDir, file)).fields.disallowedTools);
      expect(denied).toContain("Agent");
      expect(denied).toContain("Workflow");
    }
  });
});

describe("agent harness: the lead workflow", () => {
  const skillDirs = readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  it("is the only checked-in skill", () => {
    expect(skillDirs).toEqual(["supervise-batch"]);
  });

  it("runs only when Brian invokes it", () => {
    // Model-invocable, this could fire mid-conversation and launch workers that
    // nobody asked for.
    const { fields } = frontMatter(path.join(skillsDir, "supervise-batch", "SKILL.md"));
    expect(fields["disable-model-invocation"]).toBe("true");
  });

  it("states the two-issue cap and refuses to merge", () => {
    const { body } = frontMatter(path.join(skillsDir, "supervise-batch", "SKILL.md"));
    expect(body).toMatch(/\*\*At most two\*\* implementation issues/);
    expect(body).toMatch(/merge|auto-merge/i);
  });

  it("ships every template the workflow tells the lead to fill in", () => {
    // Each of these is referenced by name from SKILL.md. A missing one turns an
    // executable instruction back into a suggestion.
    for (const template of ["delegation-brief.md", "test-matrix.md", "run-report.md"]) {
      expect(
        existsSync(path.join(skillsDir, "supervise-batch", template)),
        `${template} is missing`,
      ).toBe(true);
    }
  });

  it("points at an ADR that exists", () => {
    const { body } = frontMatter(path.join(skillsDir, "supervise-batch", "SKILL.md"));
    for (const referenced of body.match(/docs\/adr\/\d{4}-[a-z0-9-]+\.md/g) ?? []) {
      expect(existsSync(path.join(repoRoot, referenced)), `${referenced} is missing`).toBe(true);
    }
  });
});

describe("agent harness: the process controls", () => {
  /**
   * These files are Prettier-wrapped prose, so a sentence can break across lines
   * anywhere. Match against a whitespace-flattened copy, with the Markdown
   * emphasis markers dropped, so re-wrapping a paragraph never fails a test that
   * is really asking whether the instruction is still there.
   */
  const flat = (text: string) => text.replace(/\*\*/g, "").replace(/\s+/g, " ");

  const lead = frontMatter(path.join(skillsDir, "supervise-batch", "SKILL.md")).body;
  const implementer = frontMatter(path.join(agentsDir, "issue-implementer.md")).body;
  const reviewer = frontMatter(path.join(agentsDir, "code-reviewer.md")).body;
  const AGENTS_MD = readFileSync(path.join(repoRoot, "AGENTS.md"), "utf8");
  const ADR_0013 = readFileSync(
    path.join(repoRoot, "docs", "adr", "0013-supervised-agent-development.md"),
    "utf8",
  );

  it("requires the test contract before implementation, not after", () => {
    expect(flat(lead)).toMatch(/test matrix before the implementer is launched/i);
    // The implementer must be told to refuse a brief that arrives without one.
    expect(flat(implementer)).toMatch(/Test matrix — the test contract/i);
  });

  it("escalates product ambiguity instead of letting an agent settle it", () => {
    for (const [role, text] of [
      ["lead", lead],
      ["implementer", implementer],
    ] as const) {
      expect(flat(text), `${role} must escalate ambiguity`).toMatch(
        /ambiguous, internally inconsistent, or missing a material/i,
      );
    }
  });

  it("separates writing tests from certifying them", () => {
    expect(flat(implementer)).toMatch(/You do not certify/i);
    expect(flat(reviewer)).toMatch(/green CI run is not approval/i);
  });

  it("makes the reviewer challenge the PR head, not main", () => {
    expect(flat(reviewer)).toMatch(/git switch --detach FETCH_HEAD/i);
    expect(flat(reviewer)).toMatch(/expected_sha/i);
    expect(flat(reviewer)).toMatch(/omitting this step would test `main`/i);
  });

  it("makes the reviewer challenge critical behaviours by injecting a defect", () => {
    expect(flat(reviewer)).toMatch(/Challenge the critical behaviours/i);
    expect(flat(reviewer)).toMatch(/Restore the exact pull-request state before moving on/i);
    // Lightweight by decision — a framework here would be a dependency and a
    // scope change, not an improvement.
    expect(flat(reviewer)).toMatch(/Do not install a mutation-testing framework/i);
  });

  it("extends the one database lock across implementers and reviewers", () => {
    expect(flat(lead)).toMatch(/one wave-wide database lock/i);
    expect(flat(lead)).toMatch(/implementer or reviewer/i);
    expect(flat(reviewer)).toMatch(/database lock: HELD/i);
    expect(flat(reviewer)).toMatch(/Never take the lock yourself/i);
  });

  it("keeps Playwright out until a screen exists, and additive when it arrives", () => {
    expect(flat(lead)).toMatch(/Do not commission speculative browser tests/i);
    expect(flat(lead)).toMatch(/complement and never replace/i);
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const installed = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(Object.keys(installed).some((name) => name.includes("playwright"))).toBe(false);
  });

  it("carries all eight supervisor stop rules", () => {
    const section = lead.slice(lead.indexOf("## Stop rules"));
    expect(section).not.toHaveLength(0);
    expect(flat(section)).toMatch(/never silently convert a blocker into an assumption/i);
    // Numbered 1..8 — a dropped rule is a silently weakened control.
    for (let rule = 1; rule <= 8; rule += 1) {
      expect(section, `stop rule ${rule} is missing`).toMatch(new RegExp(`^${rule}\\. `, "m"));
    }
  });

  it("holds the UX gate that outranks a clear dependency graph", () => {
    expect(flat(lead)).toMatch(/LAN-90/);
    expect(flat(lead)).toMatch(/LAN-71 or LAN-72/);
  });

  it("treats automated delivery as locked and manual distribution as forbidden", () => {
    // The harness must not leave a single sentence an agent could read as
    // permission to ship manual link copying.
    expect(flat(lead)).toMatch(/Automated WhatsApp delivery is a locked requirement/i);
    expect(flat(lead)).toMatch(/Manual posting or manual distribution is never/i);
    expect(flat(lead)).toMatch(/never an MVP, pilot, fallback, or separate acceptable path/i);
    for (const text of [flat(lead), flat(AGENTS_MD), flat(ADR_0013)]) {
      expect(text).not.toMatch(/manual distribution is a separate.{0,40}locked owner decision/i);
    }
  });

  it("holds LAN-92 open as the delivery decision gate", () => {
    // LAN-92 owns the provider, recipient pattern, prerequisites, and failure
    // behaviour. An agent deciding any of them has left its authority.
    const gate = flat(lead);
    expect(gate).toMatch(/LAN-92 is the decision gate, and it is not closed/i);
    for (const blocked of ["LAN-78", "LAN-82", "LAN-90"]) {
      expect(gate, `${blocked} must have its gate status stated`).toMatch(new RegExp(blocked));
    }
    expect(gate).toMatch(/Do not choose the provider, the recipient pattern, or the failure/i);
    expect(gate).toMatch(/stop rule 1 \(missing owner decision\)/i);
  });

  it("still treats any surviving manual-distribution wording as stale", () => {
    // Brian corrected LAN-78, LAN-82 and the project summary. The rule stays, so
    // a regression in any source stops the wave instead of being reconciled.
    const gate = flat(lead);
    expect(gate).toMatch(/treat that wording as .{0,3}stale.{0,3}/i);
    expect(gate).toMatch(/stop rule 2 \(requirements conflict\)/i);
    expect(gate).toMatch(/Do not edit a Linear issue to remove the contradiction/i);
    // The frozen schema's manual channel is a domain capability, not a loophole.
    expect(gate).toMatch(/must not be removed/i);
  });

  it("pins the reviewer to the pull request's exact head commit", () => {
    expect(flat(reviewer)).toMatch(/Pin yourself to the exact head commit/i);
    expect(flat(reviewer)).toMatch(/headRefOid/);
    expect(flat(reviewer)).toMatch(/git switch --detach FETCH_HEAD/);
    expect(flat(reviewer)).toMatch(/expected_sha/);
    expect(flat(reviewer)).toMatch(/omitting this step would test `main`/i);
    // Without this it silently reviews the default branch.
    expect(flat(reviewer)).toMatch(/you will review `main`, or a stale copy/i);
    expect(flat(lead)).toMatch(/head commit SHA it must review/i);
  });

  it("guarantees an injected defect never survives the review", () => {
    const text = flat(reviewer);
    expect(text).toMatch(/A mutation never leaves your worktree/i);
    expect(text).toMatch(
      /never.{0,3} committed, .{0,10}never.{0,3} staged, .{0,10}never.{0,3} pushed/i,
    );
    expect(text).toMatch(/git status --porcelain # MUST be empty/i);
    expect(text).toMatch(/prove the restore/i);
  });

  it("extends the database lock to every agent, reviewers included", () => {
    expect(flat(lead)).toMatch(/every agent, not just implementers/i);
    expect(flat(lead)).toMatch(/one .{0,3}wave-wide database lock/i);
    expect(flat(lead)).toMatch(/implementer .{0,3}or reviewer/i);
    expect(flat(reviewer)).toMatch(/database lock: HELD/i);
    expect(flat(reviewer)).toMatch(/Never take the lock\s*yourself/i);
    expect(flat(lead)).toMatch(/Exactly one holder at a time, across the whole wave/i);
    // The reviewer is the agent most likely to assume it is exempt.
    expect(flat(reviewer)).toMatch(/The database lock applies to you too/i);
    expect(flat(implementer)).toMatch(/implementers and reviewers alike/i);
  });

  it("persists the plan, matrix, and run report outside agent context", () => {
    const text = flat(lead);
    expect(text).toMatch(/Persist it in Linear before you launch/i);
    expect(text).toMatch(/durable location.{0,20}is the Linear issue/i);
    expect(text).toMatch(/never leave the evidence only in your own context/i);
  });

  it("makes the lead read the actual GitHub Actions run, not a claim", () => {
    const text = flat(lead);
    expect(text).toMatch(/Read the actual GitHub Actions run, not a summary of it/i);
    expect(text).toMatch(/gh run view <run id> --log-failed/);
    expect(text).toMatch(/gh run view <run id> --log/);
    expect(text).toMatch(/current head SHA/i);
    expect(text).toMatch(/gh run list --commit/);
    expect(text).toMatch(
      /A green run you have not opened is not a result — it is a claim you have chosen to believe/i,
    );
  });

  it("requires durable Linear evidence before and after a wave", () => {
    expect(flat(lead)).toMatch(/Record the wave, then launch/i);
    expect(flat(lead)).toMatch(/Linear comment on every selected issue before/i);
    expect(flat(lead)).toMatch(/Persist the completed report as a new Linear comment/i);
    expect(flat(lead)).toMatch(/No second wave without Brian's approval/i);
  });

  it("checks the actual CI logs for the current pull-request head", () => {
    expect(flat(lead)).toMatch(/gh run view <run id> --log/i);
    expect(flat(lead)).toMatch(/current head SHA/i);
  });

  it("treats automated WhatsApp delivery as locked and every manual path as stale", () => {
    expect(flat(lead)).toMatch(/Automated WhatsApp delivery is a locked requirement/i);
    expect(flat(lead)).toMatch(/Manual posting or manual distribution is never/i);
    expect(flat(lead)).toMatch(/LAN-78.*stale/i);
  });

  it("keeps a failed run recoverable", () => {
    expect(flat(lead)).toMatch(/## Recovery and safety/i);
    expect(flat(lead)).toMatch(/never force-push, delete an unfinished branch/i);
    expect(flat(implementer)).toMatch(/If you are interrupted or you fail/i);
  });
});

describe("agent harness: mechanical guards", () => {
  const settings = JSON.parse(
    readFileSync(path.join(repoRoot, ".claude", "settings.json"), "utf8"),
  ) as {
    permissions?: { deny?: string[]; allow?: string[]; disableBypassPermissionsMode?: string };
  };

  const deny = settings.permissions?.deny ?? [];

  it("cannot be switched off with bypass-permissions mode", () => {
    // Preserved deliberately: without it an autonomous run could start in bypass
    // mode and skip every rule below.
    expect(settings.permissions?.disableBypassPermissionsMode).toBe("disable");
  });

  it("covers the alternate spellings of a denied command", () => {
    // A prefix rule only blocks the spelling it was written for. These are the
    // straightforward re-writes of an already-denied action.
    for (const rule of [
      "Bash(git -C * push *)", // wrapper form: git -C <dir> push
      "Bash(git -c * push *)", // config-override form
      "Bash(git push *refs/heads/main*)", // fully-qualified ref
      "Bash(git push --mirror*)",
      "Bash(gh api graphql *)", // mergePullRequest via GraphQL
      "Bash(curl *api.github.com*)", // the API without gh at all
      "Bash(bunx supabase *)",
      "Bash(pnpm dlx supabase *)",
      "Bash(*node_modules/.bin/supabase *)",
    ]) {
      expect(deny, `${rule} is missing`).toContain(rule);
    }
  });

  it("closes the shell indirections that would hide a denied command", () => {
    // `bash -c "gh pr merge 6"` is one string to the matcher, not a gh command.
    for (const rule of ["Bash(bash -c *)", "Bash(sh -c *)", "Bash(eval *)", "Bash(xargs *)"]) {
      expect(deny, `${rule} is missing`).toContain(rule);
    }
  });

  it("stops an agent rewriting the guardrails it runs under", () => {
    // Edit rules cover every file-editing tool; a Write(...) path rule is never
    // consulted, so this must be spelled Edit(...).
    expect(deny).toContain("Edit(./.claude/**)");
  });

  it("documents that these rules supplement the real controls", () => {
    // Recorded so nobody mistakes a pattern list for the security model.
    const adr = readFileSync(
      path.join(repoRoot, "docs", "adr", "0013-supervised-agent-development.md"),
      "utf8",
    ).replace(/\s+/g, " ");
    expect(adr).toMatch(/deny rules supplement the real controls; they do not replace them/i);
    for (const control of [
      "Protected `main`",
      "A human merge",
      "Restricted credentials",
      "Worktree isolation",
      "Independent review",
    ]) {
      expect(adr, `${control} must be named`).toContain(control);
    }
  });

  it("grants nothing — the checked-in file only restricts", () => {
    // Allow rules from a repository file need workspace trust and hand out
    // capability. Deny rules take effect immediately and only take it away.
    expect(settings.permissions?.allow ?? []).toEqual([]);
  });

  it("blocks merging and un-drafting a pull request", () => {
    expect(deny).toContain("Bash(gh pr merge *)");
    expect(deny).toContain("Bash(gh pr ready *)");
  });

  it("blocks common push-to-main, history-rewrite, and branch-deletion forms", () => {
    for (const rule of [
      "Bash(git push * main)",
      "Bash(git push *:main)",
      "Bash(git push * refs/heads/main*)",
      "Bash(git push *:refs/heads/main*)",
      "Bash(git push --force*)",
      "Bash(git push * --force*)",
      "Bash(git push * -f*)",
      "Bash(git push * +*)",
      "Bash(git push * --delete*)",
    ]) {
      expect(deny).toContain(rule);
    }
  });

  it("blocks raw GitHub API writes and destructive pull-request state changes", () => {
    expect(deny).toContain("Bash(gh api *)");
    expect(deny).toContain("Bash(gh pr close *)");
    expect(deny).toContain("Bash(gh pr reopen *)");
  });

  it("blocks deployment", () => {
    expect(deny).toContain("Bash(gh workflow run *)");
    expect(deny).toContain("Bash(gcloud run *)");
  });

  it("blocks every route to hosted Supabase, npx-wrapped or not", () => {
    // `npx` is not one of the wrappers Claude Code strips before matching, so
    // each hosted command needs both spellings.
    for (const hosted of ["supabase link *", "supabase db push *", "supabase db remote *"]) {
      expect(deny).toContain(`Bash(${hosted})`);
      expect(deny).toContain(`Bash(npx ${hosted})`);
    }
  });

  it("blocks changing repository settings and reading out secrets", () => {
    for (const rule of [
      "Bash(gh repo edit *)",
      "Bash(gh ruleset *)",
      "Bash(gh secret *)",
      "Bash(gcloud secrets *)",
    ]) {
      expect(deny).toContain(rule);
    }
  });
});
