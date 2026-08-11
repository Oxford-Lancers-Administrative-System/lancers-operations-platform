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

/**
 * Graded review levels (docs/adr/0015). This decision makes the harness *less*
 * strict in some cases, which means the prose describing it is a control on how
 * much scrutiny future agent work receives. Prose no test pins is a preference,
 * not a guarantee — so every element a future edit could quietly remove is
 * asserted here: the four levels and their criteria, each entry of the
 * mandatory level-2 floor, the wording that makes the floor override the lead's
 * discretion, the recorded-justification requirement in both places, the
 * matrix-time timing, reachability-rather-than-size, the fail-safe default, and
 * the unchanged one-cycle limit.
 *
 * Nothing here relaxes the defect-injection standard. The assertions above
 * about challenging critical rows by injection are deliberately left untouched,
 * and the last test in this block re-asserts them so that a future edit cannot
 * weaken the standard "to accommodate the levels".
 */
describe("agent harness: graded review levels", () => {
  const flat = (text: string) => text.replace(/\*\*/g, "").replace(/\s+/g, " ");
  const skill = path.join(skillsDir, "supervise-batch");

  const lead = frontMatter(path.join(skill, "SKILL.md")).body;
  const reviewer = frontMatter(path.join(agentsDir, "code-reviewer.md")).body;
  const matrixTemplate = readFileSync(path.join(skill, "test-matrix.md"), "utf8");
  const runReport = readFileSync(path.join(skill, "run-report.md"), "utf8");
  const brief = readFileSync(path.join(skill, "delegation-brief.md"), "utf8");
  const AGENTS_MD = readFileSync(path.join(repoRoot, "AGENTS.md"), "utf8");
  const adrPath = path.join(repoRoot, "docs", "adr", "0015-graded-review-levels.md");
  const adrIndex = readFileSync(path.join(repoRoot, "docs", "adr", "README.md"), "utf8");

  /** The Markdown section introduced by `headingPrefix`, up to the next heading of the same or higher rank. */
  function section(text: string, headingPrefix: string): string {
    const lines = text.split("\n");
    const start = lines.findIndex((line) => line.startsWith(headingPrefix));
    expect(start, `"${headingPrefix}" is missing`).toBeGreaterThanOrEqual(0);
    const depth = /^#+/.exec(lines[start])![0].length;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i += 1) {
      const heading = /^(#+) /.exec(lines[i]);
      if (heading && heading[1].length <= depth) {
        end = i;
        break;
      }
    }
    return lines.slice(start, end).join("\n");
  }

  /** Every path or surface that forces level 2 regardless of how small the change is. */
  const FLOOR = [
    "supabase/migrations/",
    "src/lib/auth/",
    "src/lib/db/",
    ".env.example",
    "package.json",
    "package-lock.json",
    ".claude/",
    ".github/workflows/",
    "AGENTS.md",
  ];

  // Row 1 — four levels exist, each with a stated criterion.
  it("defines four graded levels, each with what runs and when it applies", () => {
    const levels = section(lead, "#### The four levels")
      .split("\n")
      .filter((line) => /^\|\s*\*\*[0-9] —/.test(line))
      .map((line) =>
        line
          .split("|")
          .slice(1, -1)
          .map((cell) => cell.trim()),
      );

    expect(levels.map((row) => row[0])).toEqual([
      "**0 — none**",
      "**1 — lead verification**",
      "**2 — full independent review**",
      "**3 — multi-round**",
    ]);

    // A level with no criterion is a level chosen by taste. Both edges — 0 and
    // 3 — must be reachable in practice, which means both must say when.
    for (const [label, whatRuns, whenItApplies] of levels) {
      expect(whatRuns.length, `${label} does not say what runs`).toBeGreaterThan(60);
      expect(whenItApplies.length, `${label} does not say when it applies`).toBeGreaterThan(60);
    }

    // The default lives on level 2 and nowhere else — checked across the whole
    // row, since a row can claim to be the default in either column.
    const defaultRows = levels.filter((row) => /the default/i.test(row.join(" ")));
    expect(defaultRows.map((row) => row[0])).toEqual(["**2 — full independent review**"]);
  });

  // Row 2 — the mandatory level-2 floor, and that it beats lead discretion.
  it("enumerates a mandatory level-2 floor that overrides the lead's discretion", () => {
    const floor = section(lead, "#### The mandatory level-2 floor");

    for (const entry of FLOOR) {
      expect(floor, `${entry} is missing from the mandatory level-2 floor`).toContain(entry);
    }
    // Named surfaces rather than paths — a migration is not the only way to
    // change a grant or a policy.
    expect(flat(floor)).toMatch(/any grant, policy, or RLS surface/i);
    expect(flat(floor)).toMatch(/anything touching a secret/i);
    expect(flat(floor)).toMatch(/any dependency change/i);

    // A floor the lead may reason its way past is not a floor.
    expect(flat(floor)).toMatch(/at least level 2 regardless of how small it is/i);
    expect(flat(floor)).toMatch(/the lead may not reason its way past it/i);
    expect(flat(floor)).toMatch(/A floor a lead can argue around is not a floor/i);
    // One floor path and nothing else is still level 2.
    expect(flat(floor)).toMatch(/touching one floor path and nothing else is still level 2/i);
    // And the list is a minimum, not a definition of what deserves review.
    expect(flat(floor)).toMatch(/a floor, not a definition of what deserves review/i);
    expect(flat(floor)).toMatch(/absence from the list is never an argument/i);

    // The same floor is stated in the working agreement, where a reader who
    // never opens the skill will find it.
    for (const entry of FLOOR) {
      expect(AGENTS_MD, `${entry} is missing from the AGENTS.md floor`).toContain(entry);
    }
  });

  // Row 3 — downgrade authority exists, but only on the record.
  it("lets the lead assign 0 or 1 only with the justification recorded twice", () => {
    const authority = section(lead, "#### The lead may assign level 0 or 1");

    expect(flat(authority)).toMatch(/may assign level 0 or level 1 on its own authority/i);
    expect(flat(authority)).toMatch(/recorded in both places/i);
    expect(flat(authority)).toMatch(/in the wave record, before launch/i);
    expect(flat(authority)).toMatch(/in the run report, afterwards/i);
    // An unjustified downgrade must be impossible to record as compliant.
    expect(flat(authority)).toMatch(/no recorded justification is not compliant/i);
    expect(flat(authority)).toMatch(/the level reverts to 2/i);

    // Both recording locations carry the field, so "there was nowhere to put
    // it" is never available as an excuse.
    expect(flat(matrixTemplate)).toMatch(/Justification, required only below level 2/i);
    expect(flat(runReport)).toMatch(/Justification \(required below level 2\)/i);
    expect(flat(runReport)).toMatch(/Justification for a level below 2/i);
    expect(flat(runReport)).toMatch(/required here as well as in the wave record/i);
  });

  // Row 4 — the fail-safe default. This is the one that must fail upward.
  it("resolves an unspecified review level to 2, never to no review", () => {
    const fallback = section(lead, "#### Level 2 is what happens when nobody says otherwise");

    expect(flat(fallback)).toMatch(/An unspecified level is level 2/i);
    // Every shape "unspecified" takes in practice.
    expect(flat(fallback)).toMatch(/no review-level field/i);
    expect(flat(fallback)).toMatch(/left blank/i);
    expect(flat(fallback)).toMatch(/a value outside 0–3/i);
    expect(flat(fallback)).toMatch(/resolves to 2 — full independent review/i);
    // It is never read downward.
    expect(flat(fallback)).toMatch(/never read as level 0/i);
    expect(flat(fallback)).toMatch(/never read as "no review"/i);
    expect(flat(fallback)).toMatch(/fails safe, upward/i);
    expect(flat(fallback)).toMatch(/Silence means _more_ scrutiny, not less/i);

    // The templates encode the default in the placeholder itself, so deleting a
    // level from a real record still resolves upward.
    expect(flat(runReport)).toMatch(/level 2 if this cell is missing or left blank/i);
    expect(flat(runReport)).toMatch(/level 2 if this line is missing or left blank/i);
    expect(flat(matrixTemplate)).toMatch(/level 2 if this line is missing or left blank/i);
    expect(flat(brief)).toMatch(/level 2 if this line is missing or left blank/i);
    expect(flat(runReport)).toMatch(/An unspecified level is level 2, never "no review"/i);

    // And the reviewer, which is the agent a silent brief would otherwise
    // quietly narrow.
    expect(flat(reviewer)).toMatch(
      /If your brief does not state a level, treat it as level 2 and review in full/i,
    );
    expect(flat(reviewer)).toMatch(/A brief that is silent is not permission to do less/i);
  });

  // Row 5 — assigned at matrix time, from the criteria, before implementation.
  it("assigns the level with the matrix, before implementation, not from the diff", () => {
    expect(lead).toMatch(
      /^## 4 — Write the test contract, and set the review level, before any implementation$/m,
    );
    const assign = section(lead, "### Assign the review level");
    expect(flat(assign)).toMatch(/at matrix time, before an implementer is launched/i);
    expect(flat(assign)).toMatch(/never from the diff that comes back/i);
    expect(flat(assign)).toMatch(/how a level gets picked to fit the work that was actually done/i);
    // The blast-radius sentence is the control that surfaces "nothing consumes
    // this yet" before wave-scale process is applied to a patch-scale change.
    expect(flat(assign)).toMatch(/the expected blast radius/i);
    expect(flat(assign)).toMatch(/who or what could reach the defect/i);

    expect(flat(matrixTemplate)).toMatch(/Review level and expected blast radius — decide them/i);
    expect(flat(matrixTemplate)).toMatch(/Review level:/);
    expect(flat(matrixTemplate)).toMatch(/Expected blast radius:/);
    expect(flat(runReport)).toMatch(/assigned at matrix time, before launch/i);

    // The verification-time re-check may only raise a level. Lowering it there
    // is choosing the scrutiny to fit the work that came back.
    const recheck = section(lead, "### Re-check the review level against the diff");
    expect(flat(recheck)).toMatch(/raise it and proceed at the higher one/i);
    expect(flat(recheck)).toMatch(/never lower a level here/i);
    expect(flat(recheck)).toMatch(/Record any raise, and the reason, in the run report/i);
  });

  // Row 6 — the criterion, stated explicitly, is not diff size.
  it("keys the level on reachability and blast radius, and says size is not the criterion", () => {
    const criterion = section(lead, "#### The criterion is reachability and blast radius");

    expect(flat(criterion)).toMatch(/Diff size is not the criterion/i);
    expect(flat(criterion)).toMatch(
      /"it is only a small change" is never a reason to review less/i,
    );
    expect(flat(criterion)).toMatch(/Reachability — can a defect here be reached/i);
    expect(flat(criterion)).toMatch(/Blast radius — if it is wrong/i);
    // The concrete counter-example, so the rule is not abstract.
    expect(flat(criterion)).toMatch(
      /four-line change to an authorization predicate is level 2 or 3/i,
    );
    expect(flat(criterion)).toMatch(/Neither conclusion comes from counting lines/i);

    expect(flat(AGENTS_MD)).toMatch(/reachability and blast radius, never on diff size/i);
  });

  // Row 7 — the injection standard at levels 2 and 3 is untouched.
  it("leaves the defect-injection standard at levels 2 and 3 exactly as it was", () => {
    // The graded model decides when a review happens, never what it consists of.
    expect(flat(lead)).toMatch(/what level 2 means, and it runs in full at levels 2 and 3/i);
    expect(flat(lead)).toMatch(/they never decide what one consists of/i);
    expect(flat(lead)).toMatch(/no level weakens the defect-injection standard/i);
    expect(flat(reviewer)).toMatch(
      /Everything in this file applies in full at both, and the defect-injection standard is identical at both/i,
    );

    // Re-asserted here as well as above: if a future edit relaxes the standard
    // "to accommodate the levels", this block fails too, next to the policy
    // that would have been the excuse.
    expect(flat(reviewer)).toMatch(/Challenge the critical behaviours/i);
    expect(flat(reviewer)).toMatch(/Restore the exact pull-request state before moving on/i);
    expect(flat(reviewer)).toMatch(/A mutation never leaves your worktree/i);
    expect(flat(reviewer)).toMatch(/Do not install a mutation-testing framework/i);
    expect(flat(lead)).toMatch(/challenges every critical behaviour by injecting a plausible/i);
  });

  // Row 8 — the reviewer is told its level, so a narrowing is legible.
  it("tells the reviewer which level it is invoked at", () => {
    expect(flat(lead)).toMatch(/the review level it is being invoked at/i);
    expect(flat(reviewer)).toMatch(/the review level you are invoked at/i);
    expect(flat(reviewer)).toMatch(/only ever launched at level 2 or level 3/i);
    // The one narrowing that is real: the level-3 second pass over corrections.
    expect(flat(reviewer)).toMatch(/it names the correction range/i);
    expect(flat(reviewer)).toMatch(/review those corrections as new code/i);
    expect(flat(reviewer)).toMatch(/anything else is an incomplete brief/i);
  });

  // Row 9 — one correction cycle, and it does not scale with the level.
  it("keeps one correction cycle at every level", () => {
    expect(flat(lead)).toMatch(/One correction cycle, at every level/i);
    expect(flat(lead)).toMatch(/The limit does not scale with the level/i);
    // Level 3's second pass is inside that cycle, not an extra one.
    expect(flat(lead)).toMatch(/happens inside that single cycle/i);
    // And a defect found later does not consume a budget belonging elsewhere.
    expect(flat(lead)).toMatch(/re-enters as new work with its own level/i);
    expect(flat(AGENTS_MD)).toMatch(/One correction cycle at every level/i);
  });

  // Row 10 — the record is truthful: ADR 0015 exists, is indexed, and amends 0013.
  it("records the graded model in an ADR that amends 0013, and indexes it", () => {
    expect(existsSync(adrPath), "docs/adr/0015-graded-review-levels.md is missing").toBe(true);
    const adr = flat(readFileSync(adrPath, "utf8"));

    expect(adr).toMatch(/Amends \[0013\]\(0013-supervised-agent-development\.md\)/i);
    // ADR 0013 records a single review standard; leaving that uncorrected is
    // exactly the documentation drift the definition of done forbids.
    expect(adr).toMatch(/ADR 0013 records a single review standard/i);
    expect(adr).toMatch(/routes each draft pull request to the independent reviewer at level 2/i);
    for (const clause of [
      /four graded levels/i,
      /mandatory level-2 floor/i,
      /reachability and blast radius, never diff size/i,
      /unspecified level is level 2/i,
      /One correction cycle at every level/i,
    ]) {
      expect(adr, `ADR 0015 must record ${clause}`).toMatch(clause);
    }

    expect(adrIndex).toContain("[0015](0015-graded-review-levels.md)");
    expect(adrIndex, "0013 must be marked as amended in the index").toMatch(
      /0013-supervised-agent-development\.md\).*Amended by 0015/,
    );

    // AGENTS.md § Agent tooling carries the graded model, not the old single one.
    expect(flat(AGENTS_MD)).toMatch(
      /Review is graded, and the grade is set before implementation/i,
    );
    expect(flat(AGENTS_MD)).toMatch(/an unspecified level resolves to level 2/i);
    expect(AGENTS_MD).toContain("docs/adr/0015-graded-review-levels.md");
    expect(flat(AGENTS_MD)).toMatch(/independent reviewer at review level 2 and above/i);
  });
});
