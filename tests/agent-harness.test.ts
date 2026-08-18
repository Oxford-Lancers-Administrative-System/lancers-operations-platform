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
const missionSkillPath = path.join(skills, "run-mission", "SKILL.md");
const workerPath = path.join(agents, "implementation-worker.md");
const skill = frontMatter(skillPath);
const reviewer = frontMatter(reviewerPath);
const missionSkill = frontMatter(missionSkillPath);
const worker = frontMatter(workerPath);
const agreement = readFileSync(path.join(root, "AGENTS.md"), "utf8");
const narrowCorrectionTranscript = readFileSync(
  path.join(root, "tests", "fixtures", "agent-review", "narrow-correction.md"),
  "utf8",
);
const repeatedPremiseTranscript = readFileSync(
  path.join(root, "tests", "fixtures", "agent-review", "repeated-premise.md"),
  "utf8",
);
const findingDispositionTranscript = readFileSync(
  path.join(root, "tests", "fixtures", "agent-review", "finding-dispositions.md"),
  "utf8",
);
const pullRequestTemplate = readFileSync(
  path.join(root, ".github", "PULL_REQUEST_TEMPLATE.md"),
  "utf8",
);
const dispositionPolicy = flat(
  [skill.body, reviewer.body, missionSkill.body, worker.body, findingDispositionTranscript].join(
    "\n",
  ),
);
const contradictoryPolicyPatterns = {
  correctionTrigger:
    /`?correct-before-handoff`? findings?.{0,40}(?:also )?independently triggers (?:a )?correction-review invocation|`?correct-before-handoff`? (?:also )?independently triggers (?:a )?correction review/i,
  sensitiveLowerDisposition:
    /(?:authorization|authentication|privacy|security|data[- ]integrity) findings?.{0,80}(?:may|can|use|assign).{0,40}(?:correct-before-handoff|advisory)|(?:correct-before-handoff|advisory).{0,80}(?:may|can|use|assign).{0,40}(?:authorization|authentication|privacy|security|data[- ]integrity) findings?/i,
  unresolvedHandoff:
    /final handoff.{0,80}(?:may|can|proceed|allowed).{0,80}unresolved.{0,40}correct-before-handoff/i,
  boundaryCrossing:
    /(?:executable role list|migration instruction|production action).{0,100}(?:remain|stays?|use).{0,40}correct-before-handoff/i,
  fourthReviewer: /(?:launch|run).{0,30}(?:a )?fourth automatic reviewer/i,
  contraryScenario:
    /(?:every|all seven) scenarios?.{0,100}(?:including authorization|including integrity|authorization|data[- ]integrity).{0,80}advisory|(?:every|all seven) scenarios?.{0,80}(?:may|can|are|be).{0,30}advisory.{0,100}(?:including )?(?:authorization|integrity|data[- ]integrity)/i,
};
const settings = JSON.parse(readFileSync(path.join(root, ".claude", "settings.json"), "utf8"));

describe("single-issue Claude workflow", () => {
  it("has exactly the two user-invoked workflows and no obsolete batch artifacts", () => {
    expect([...readdirSync(skills)].sort()).toEqual(["run-mission", "start-issue"]);
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

  it("makes the /start-issue session implement and permits only review delegation there", () => {
    expect([...readdirSync(agents)].sort()).toEqual([
      "code-reviewer.md",
      "implementation-worker.md",
    ]);
    expect(flat(skill.body)).toMatch(/Do not launch an implementation sub-agent/i);
    expect(flat(skill.body)).toMatch(/launch one fresh-context `code-reviewer`/i);
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

  it("uses one full review and correction-only review for narrow fixes", () => {
    const body = flat(skill.body);
    const reviewBody = flat(reviewer.body);
    expect(body).toMatch(/Review has three operations/i);
    expect(body).toMatch(/Full review.*independently reconstructs material requirements/i);
    expect(body).toMatch(/Correction review.*previous_reviewed_sha\.\.current_head_sha/i);
    expect(reviewBody).toMatch(
      /review mode \(`full`, `correction`, or `requirement-adjudication`\)/i,
    );
    expect(reviewBody).toMatch(/Review `previous_reviewed_sha\.\.current_head_sha`/i);
    expect(reviewBody).toMatch(
      /Before reading the PR body, implementer summary, acceptance matrix, complete diff, or commit list, reconstruct every material criterion/i,
    );
    expect(reviewBody).toMatch(
      /Do not receive the implementer acceptance\/test matrix.*until after independently reconstructing/i,
    );
    expect(body).not.toMatch(/any correction invalidates the prior result/i);
    expect(body).not.toMatch(/continue until.*clear/i);
  });

  it("preserves unchanged coverage and reuses controlled-defect evidence", () => {
    for (const body of [flat(skill.body), flat(reviewer.body)]) {
      expect(body).toMatch(/reuse.*controlled-defect evidence for unchanged behavior/i);
      expect(body).toMatch(/only corrected or newly affected critical behavior/i);
    }
    expect(flat(skill.body)).toMatch(/Prior coverage remains valid for unchanged behavior/i);
  });

  it("separates impact severity from the three gate dispositions", () => {
    const body = flat(skill.body);
    const reviewBody = flat(reviewer.body);
    for (const value of ["critical", "high", "medium", "low"])
      expect(body).toContain(`\`${value}\``);
    for (const value of ["block", "correct-before-handoff", "advisory"])
      expect(body).toContain(`\`${value}\``);
    expect(body).toMatch(/severity alone never decides whether another reviewer runs/i);
    expect(reviewBody).toMatch(
      /Only `block` independently triggers a correction-review invocation/i,
    );
    expect(body).toMatch(/critical regression test that stays green/i);
    expect(body).toMatch(
      /minor findings first discovered in unchanged code.*are normally advisories/i,
    );
    expect(body).toMatch(/advisory.*never authorizes a correction, commit, review round/i);
  });

  it("gates required artifact corrections without spending a review round", () => {
    const body = flat(skill.body);
    expect(body).toMatch(/correct-before-handoff.*before the PR may be reported ready for merge/i);
    expect(body).toMatch(/deterministic verification or exact artifact read-back/i);
    expect(body).toMatch(
      /do not consume another independent review round unless the correction changes executable behavior/i,
    );
    expect(flat(reviewer.body)).toMatch(
      /correct-before-handoff.*does not by itself trigger another reviewer invocation/i,
    );
  });

  it("hard-blocks sensitive or executable-boundary findings", () => {
    for (const body of [flat(skill.body), flat(reviewer.body)]) {
      expect(body).toMatch(
        /Authentication, authorization, privacy, security, data integrity, incorrect reachable behavior/i,
      );
      expect(body).toMatch(
        /may never be `correct-before-handoff` or `advisory`|never assign either lower disposition/i,
      );
      expect(body).toMatch(
        /reclassify it as `block`.*changes executable behavior|changes executable behavior.*reclassify it as `block`/i,
      );
    }
  });

  it("rejects contradictory lower dispositions and review triggers", () => {
    expect(dispositionPolicy).not.toMatch(contradictoryPolicyPatterns.correctionTrigger);
    expect(dispositionPolicy).not.toMatch(contradictoryPolicyPatterns.sensitiveLowerDisposition);
  });

  it("rejects unresolved handoff and lower-disposition boundary crossings", () => {
    expect(dispositionPolicy).not.toMatch(contradictoryPolicyPatterns.unresolvedHandoff);
    expect(dispositionPolicy).not.toMatch(contradictoryPolicyPatterns.boundaryCrossing);
  });

  it("rejects review-budget and scenario outcomes that contradict the policy", () => {
    expect(dispositionPolicy).not.toMatch(contradictoryPolicyPatterns.fourthReviewer);
    expect(dispositionPolicy).not.toMatch(
      /(?:authorization|data[- ]integrity).{0,100}(?:may|can|is|are|be).{0,30}advisory/i,
    );
    expect(dispositionPolicy).not.toMatch(contradictoryPolicyPatterns.contraryScenario);
  });

  it("detects canonical ordinary-format contradictions", () => {
    const contradictions: Array<[string, RegExp]> = [
      [
        "A `correct-before-handoff` finding also independently triggers a correction-review invocation.",
        contradictoryPolicyPatterns.correctionTrigger,
      ],
      [
        "Low-impact authorization findings may use `correct-before-handoff`.",
        contradictoryPolicyPatterns.sensitiveLowerDisposition,
      ],
      [
        "Final handoff may proceed with unresolved `correct-before-handoff` findings.",
        contradictoryPolicyPatterns.unresolvedHandoff,
      ],
      [
        "An executable role list may remain `correct-before-handoff`.",
        contradictoryPolicyPatterns.boundaryCrossing,
      ],
      [
        "Launch a fourth automatic reviewer when uncertainty remains.",
        contradictoryPolicyPatterns.fourthReviewer,
      ],
      [
        "All seven scenarios may be advisory, including authorization and data-integrity defects.",
        contradictoryPolicyPatterns.contraryScenario,
      ],
    ];
    for (const [contradiction, pattern] of contradictions) expect(contradiction).toMatch(pattern);
  });

  it("restricts new blockers found during correction review", () => {
    const body = flat(reviewer.body);
    expect(body).toMatch(/new blocker is allowed only when the correction introduced the defect/i);
    expect(body).toMatch(
      /previously missed critical correctness, security, privacy, or data-integrity/i,
    );
    expect(body).toMatch(
      /controlling authoritative source or invariant, concrete failure evidence/i,
    );
    expect(body).toMatch(/Every other new finding against unchanged code.*is advisory/i);
  });

  it("resets full review only for enumerated material risk-surface changes", () => {
    const body = flat(skill.body);
    expect(body).toMatch(/Reset to a full review only when.*materially expands or invalidates/i);
    expect(body).toMatch(
      /authorization, privacy, credential, or trust boundary outside the original finding/i,
    );
    expect(body).toMatch(/migration, RLS policy, transaction boundary, or production side effect/i);
    expect(body).toMatch(/replacing the test strategy/i);
    expect(body).toMatch(/Diff size and editing a Highest-risk file are not reset conditions/i);
  });

  it("breaks repeated-premise loops and caps automatic reviewer invocations", () => {
    const body = flat(skill.body);
    expect(body).toMatch(/two consecutive rounds block on substantially the same requirement/i);
    expect(body).toMatch(/stop correction work and do not launch another code-review round/i);
    expect(body).toMatch(/requirement adjudication/i);
    expect(body).toMatch(/fresh-context `code-reviewer` in `requirement-adjudication` mode/i);
    expect(body).toMatch(/excludes the PR body, implementation, diff, acceptance matrix/i);
    expect(flat(reviewer.body)).toMatch(/requirement-adjudication brief names only the issue/i);
    expect(flat(reviewer.body)).toMatch(/Return an adjudication receipt containing/i);
    expect(body).toMatch(
      /at most one initial full review, two correction reviews, and three total reviewer invocations/i,
    );
    expect(body).toMatch(/never auto-approve an unresolved material blocker/i);
  });

  it("requires structured receipts and lineage-aware handoff", () => {
    for (const field of [
      "review_mode",
      "full_review_sha",
      "correction_base_sha",
      "reviewed_head_sha",
      "requirement_provenance",
      "resolved_finding_ids",
      "findings",
      "blocking_findings",
      "correct_before_handoff_findings",
      "advisories",
      "result",
    ]) {
      expect(skill.body).toContain(`\`${field}\``);
      expect(reviewer.body).toContain(`"${field}"`);
    }
    expect(flat(skill.body)).toMatch(/Prior review remains valid; only this delta is pending/i);
    expect(flat(skill.body)).toMatch(/Automatic review stopped after three rounds/i);
    for (const label of [
      "Findings",
      "Blocking findings",
      "Correct-before-handoff findings",
      "Advisories",
    ])
      expect(pullRequestTemplate).toContain(`- **${label}:**`);
    expect(flat(pullRequestTemplate)).toMatch(
      /stable ID, impact severity, gate disposition, concrete reachable consequence, review-invocation effect/i,
    );
  });

  it("dry-runs narrow correction and repeated-premise scenarios", () => {
    expect(flat(narrowCorrectionTranscript)).toMatch(
      /round 1.*full.*blocked.*R-001.*round 2.*correction.*A\.\.B.*clear/i,
    );
    expect(flat(narrowCorrectionTranscript)).toMatch(/unchanged.*evidence is reused/i);
    expect(flat(repeatedPremiseTranscript)).toMatch(
      /round 1.*R-007.*round 2.*same finding family.*requirement adjudication/i,
    );
    expect(flat(repeatedPremiseTranscript)).toMatch(/third code-review invocation.*not launched/i);
  });

  it("dry-runs all seven finding-disposition scenarios", () => {
    const transcript = flat(findingDispositionTranscript);
    for (const marker of [
      "stale cosmetic sentence",
      "hosted runbook",
      "visibly Saved",
      "unauthorized operator",
      "lose, corrupt, mis-anchor",
      "executable role list",
      "mixed review",
    ])
      expect(transcript).toMatch(new RegExp(marker, "i"));
    expect(transcript).toMatch(/authorization hard exclusion rejects both lower dispositions/i);
    expect(transcript).toMatch(/data-integrity hard exclusion rejects both lower dispositions/i);
    expect(transcript).toMatch(/reclassified from `correct-before-handoff` to `block`/i);
    expect(transcript).toMatch(/do not independently expand review scope/i);
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

describe("mission harness v1", () => {
  const missionBody = flat(missionSkill.body);
  const workerBody = flat(worker.body);
  const stateSource = readFileSync(
    path.join(root, "scripts", "mission", "lib", "state.mjs"),
    "utf8",
  );
  const gateSource = readFileSync(path.join(root, "scripts", "mission", "merge-gate.mjs"), "utf8");

  it("adds the mission workflow as user-invoked, and keeps /start-issue supported", () => {
    expect(missionSkill.fields.name).toBe("run-mission");
    expect(missionSkill.fields["disable-model-invocation"]).toBe("true");
    expect(missionSkill.fields["argument-hint"]).toBe("M-<mission-id>");
    expect(missionBody).toMatch(
      /`\/start-issue` remains available for deliberate manual single-issue work/i,
    );
    expect(existsSync(skillPath)).toBe(true);
  });

  it("defines the implementation worker as bounded, unable to spawn agents, but able to implement", () => {
    expect(worker.fields.name).toBe("implementation-worker");
    expect(worker.fields.isolation).toBe("worktree");
    expect(worker.fields.disallowedTools).toContain("Agent");
    expect(worker.fields.disallowedTools).toContain("Workflow");
    expect(worker.fields.disallowedTools).not.toContain("Write");
    expect(worker.fields.disallowedTools).not.toContain("Edit");
    expect(workerBody).toMatch(
      /never spawn an implementation worker, a reviewer, an agent team, a workflow, or any other agent/i,
    );
    expect(workerBody).toMatch(/never select another issue, expand scope/i);
  });

  it("makes the Mission Lead the only orchestrator, with flat delegation", () => {
    expect(missionBody).toMatch(/workers and reviewers are spawned only by the Mission Lead/i);
    expect(missionBody).toMatch(/workers never spawn agents of any kind/i);
    expect(missionBody).toMatch(
      /never launches an agent that is not `implementation-worker` or `code-reviewer`/i,
    );
    expect(missionBody).toMatch(/never becomes the default application-code implementer/i);
  });

  it("caps implementation concurrency at two and serializes collisions and migrations", async () => {
    const { MAX_ACTIVE_WORKERS } = await import("../scripts/mission/lib/state.mjs");
    expect(MAX_ACTIVE_WORKERS).toBe(2);
    expect(missionBody).toMatch(/at most two `implementation-worker` agents/i);
    expect(stateSource).toContain("Maximum implementation concurrency is");
    expect(stateSource).toContain("only one migration-owning package runs at a time");
    expect(stateSource).toContain("colliding work is serialized");
  });

  it("holds mission memory in the durable journal, never in chat", () => {
    expect(missionBody).toMatch(/append-only journal/i);
    expect(missionBody).toMatch(/never in chat/i);
    expect(missionBody).toMatch(/Every material transition.*recorded through that CLI/i);
    expect(missionBody).toMatch(/completely fresh Mission Lead resumes/i);
    expect(missionBody).toMatch(/usage-exhausted/);
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    expect(pkg.scripts.mission).toBe("node scripts/mission/cli.mjs");
  });

  it("refuses dispatch before Linear synchronization, and keeps sync idempotent", () => {
    expect(missionBody).toMatch(
      /No implementation worker starts until its package has a created or reconciled Linear issue/i,
    );
    expect(stateSource).toContain(
      "No implementation worker starts before its work package is synchronized",
    );
    expect(stateSource).toContain("a second issue would be a duplicate");
    expect(missionBody).toMatch(/non-mutating connectivity preflight/i);
  });

  it("routes ordinary corrections back to the original worker, never a replacement", () => {
    expect(stateSource).toContain("resumes the original implementation worker");
    expect(stateSource).toContain("is refused");
    expect(missionBody).toMatch(/resume the original implementation worker/i);
    expect(missionBody).toMatch(/Do not create a new implementer because review failed/i);
    expect(workerBody).toMatch(/re-enter the same worktree and branch/i);
  });

  it("checks owner rules before asking, and separates immediate from hourly questions", () => {
    expect(missionBody).toMatch(
      /Before asking Brian any product or visual question, check in order/i,
    );
    expect(missionBody).toMatch(/Owner Rule Registry/);
    expect(missionBody).toMatch(
      /promote it with `promote-rule` only after Brian explicitly approves reuse/i,
    );
    expect(stateSource).toContain('"immediate" or "hourly"');
    expect(missionBody).toMatch(/Interrupt Brian immediately only for/i);
  });

  it("merges only through the guarded lane, which fails closed", () => {
    expect(missionBody).toMatch(/Never run `gh pr merge`, `gh pr ready`, or any direct merge/i);
    expect(missionBody).toMatch(/mission-merge-receipt/);
    expect(missionBody).toMatch(/apply the `mission-merge` label/i);
    expect(gateSource).toContain("merge: reasons.length === 0");
    expect(gateSource).not.toMatch(/merge\s*=\s*true/);
  });

  it("keeps Highest-risk, migration, and unapproved visual work with Brian", () => {
    expect(missionBody).toMatch(
      /Highest risk retains the strongest current rules and never merges autonomously/i,
    );
    expect(stateSource).toContain("Highest-risk work cannot autonomous-merge in v1");
    expect(stateSource).toContain("owner-merged, never autonomous");
    expect(missionBody).toMatch(/ADR 0020 stands/);
    expect(gateSource).toContain("highest risk is owner-merged in v1");
  });
});

describe("production and security boundaries", () => {
  it("preserves draft-only, human-merge, no-deploy, and local-only Supabase rules", () => {
    for (const text of [
      flat(skill.body),
      flat(missionSkill.body),
      flat(worker.body),
      flat(agreement),
    ]) {
      expect(text).toMatch(/draft/i);
      expect(text).toMatch(/never.*merge/i);
      expect(text).toMatch(/never.*un-draft/i);
      expect(text).toMatch(/never.*deploy/i);
      expect(text).toMatch(/hosted Supabase/i);
    }
    expect(flat(skill.body)).toMatch(/never use the fast lane/i);
    expect(flat(missionSkill.body)).toMatch(/never use the fast lane for mission work/i);
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
    expect(account).toMatch(/ensureLocalReviewAccount/);
    expect(command).toMatch(/ensureLocalReviewAccount/);
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
