#!/usr/bin/env bash
#
# Owner-run. Applies LAN-209's merge rule to the files under `.claude/`, which
# agents cannot write.
#
# The rule (Brian, 2026-09-01; docs/adr/0038): a pull request leaves draft
# exactly once, as the last act of the work, and that act is the authorization
# to merge it. Only `/start-issue` and `/run-mission` may lift a draft, and only
# when the diff touches no prohibited path, review is clear at the exact current
# head, and — for visual work — Brian's visual approval is recorded against that
# same head. No agent merges, ever.
#
# What this changes:
#
#   1. `.claude/settings.json`: moves `Bash(gh pr ready *)` from `deny` to
#      `allow`. `Bash(gh pr merge *)` stays denied. This is a real loosening of
#      the agent fence and it is deliberate — merge authority stays with
#      GitHub; only the readiness signal moves to the agent. Note that these
#      permissions are session-wide, so the restriction to two roles is
#      enforced by the written rule and tests/agent-harness.test.ts rather than
#      mechanically.
#
#   2. The five skills and three agents: each carries the rule, in the form its
#      own role needs. `tests/agent-harness.test.ts` fails until they do.
#
# It prints what it will change before changing anything, and it is safe to run
# twice: every edit is matched exactly and skipped when already applied.
#
#   ./scripts/production/lan-209-agent-merge-rule.sh

set -euo pipefail

cd "$(dirname "$0")/../.."
[ -d .claude ] || { echo "No .claude/ here. Run this from the repository."; exit 1; }
command -v python3 >/dev/null || { echo "python3 is required."; exit 1; }

python3 - "$@" <<'PY'
import json
import sys

BOLD, RESET = "\033[1m", "\033[0m"


def report(title):
    print(f"\n{BOLD}{title}{RESET}")


LIFT = (
    "Lifting the draft is the last act of the work and the authorization to merge\n"
    "it (AGENTS.md, \"Merging\"). Lift it only when the diff touches no prohibited\n"
    "path, review is clear at the exact current head, and, for visual work,\n"
    "Brian's visual approval is recorded against that same head. Otherwise leave\n"
    "the draft and Brian merges. Never merge.\n"
)

NEVER = "never lift a draft"

# Every edit is (file, exact old text, new text). An edit whose old text is
# absent and whose new text is present is already applied.
EDITS = [
    (
        ".claude/skills/start-issue/SKILL.md",
        "Commit and push, then open/update one normal draft PR against `main`; fill every\n"
        "Production handoff line. Never fast-lane, merge, un-draft, deploy, or apply a\n"
        "hosted migration. Inspect actual CI conclusions at the current head.\n",
        "Commit and push, then open/update one normal draft PR against `main`; fill every\n"
        "Production handoff line. Never merge, deploy, or apply a hosted migration.\n"
        "Inspect actual CI conclusions at the current head.\n",
    ),
    (
        ".claude/skills/start-issue/SKILL.md",
        "Add the PR link and exactly one final evidence comment to Linear. Leave the draft\n",
        LIFT + "\nAdd the PR link and exactly one final evidence comment to Linear. Leave the\n",
    ),
    (
        ".claude/skills/start-issue/SKILL.md",
        "PR, branch, worktree, lease, and review environment recoverable. Never set Done,\n"
        "release the lease as a finishing move, remove the worktree, or merge; those are\n"
        "`/finish-issue LAN-###`.\n",
        "draft PR, branch, worktree, lease, and review environment recoverable. Never set\n"
        "Done, release the lease as a finishing move, remove the worktree, or merge; those\n"
        "are `/finish-issue LAN-###`.\n",
    ),
    (
        ".claude/skills/run-mission/SKILL.md",
        "For qualifying work, run `mission gate` with current PR, checks, and diff\n"
        "evidence. A pass records `gate-passed` at the exact head. Only its receipt may\n"
        "be published in the PR and followed by the `mission-merge` label. The workflow\n"
        "re-derives the result and merges immediately; the Lead never runs a merge or\n"
        "un-drafts. Record the resulting merge and route, reclaim it, and let dependent\n"
        "work start from the updated `main`.\n"
        "Prohibited paths remain owner-merged. Highest-risk, auth, and delivery work use\n"
        "the guarded lane only after an answered owner checkpoint names the package.\n"
        "Mission merges never deploy.\n",
        "For qualifying work, run `mission gate` with current PR, checks, and diff\n"
        "evidence. A pass records `gate-passed` at the exact head and is the only\n"
        "authority to run `gh pr ready` on that package.\n"
        "\n" + LIFT +
        "\nThe merge workflow then enables GitHub's auto-merge and GitHub merges once the\n"
        "checks are green. Record the resulting merge and route, reclaim it, and let\n"
        "dependent work start from the updated `main`. Prohibited paths stay drafts for\n"
        "Brian. Highest-risk, auth, and delivery work leaves draft only after an answered\n"
        "owner checkpoint names the package. Merging never deploys.\n",
    ),
    (
        ".claude/skills/finish-issue/SKILL.md",
        "Never implement, review, delegate, merge, un-draft, deploy, or use hosted\n",
        "Never implement, review, delegate, merge, " + NEVER + ", deploy, or use hosted\n",
    ),
    (
        ".claude/skills/finish-mission/SKILL.md",
        "Never implement, review, merge, un-draft, deploy, migrate hosted Supabase, touch\n",
        "Never implement, review, merge, " + NEVER + ", deploy, migrate hosted Supabase,\n"
        "touch\n",
    ),
    (
        ".claude/skills/mission-intake/SKILL.md",
        "required check at the final SHA. Never merge or un-draft; Brian's merge is packet\n",
        "required check at the final SHA. Never merge and " + NEVER + "; Brian's merge is\n"
        "packet\n",
    ),
    (
        ".claude/agents/implementation-worker.md",
        "one normal draft PR against `main`. Fill every Production handoff line. Inspect\n"
        "CI conclusions at the exact head. Never merge, un-draft, label for merge, deploy,\n"
        "or perform hosted, production, or real-data actions.\n",
        "one normal draft PR against `main`. Fill every Production handoff line. Inspect\n"
        "CI conclusions at the exact head. Never merge and " + NEVER + " — you open it,\n"
        "and the Lead lifts it after review clears. Never deploy or perform hosted,\n"
        "production, or real-data actions.\n",
    ),
    (
        ".claude/agents/code-reviewer.md",
        "and never gate or reopen an already-merged issue.\n",
        "and never gate or reopen an already-merged issue. Never merge and " + NEVER + ";\n"
        "your clear verdict at the exact head is what lets the Lead lift it.\n",
    ),
    (
        ".claude/agents/scout.md",
        "Answer exactly one bounded question from only the files, history, or output\n"
        "needed. Never edit, implement, format, commit, push, mutate Linear, acquire a\n"
        "database lease, start services, deploy, or touch hosted/production systems.\n",
        "Answer exactly one bounded question from only the files, history, or output\n"
        "needed. Never edit, implement, format, commit, push, mutate Linear, acquire a\n"
        "database lease, start services, merge, " + NEVER + ", deploy, or touch\n"
        "hosted/production systems.\n",
    ),
]

report("Plan")
print("  .claude/settings.json")
print("      move  Bash(gh pr ready *)  from deny to allow")
print("      keep  Bash(gh pr merge *)  denied")
for path, old, _ in EDITS:
    print(f"  {path}")
    print(f"      {old.strip().splitlines()[0][:66]}...")

report("Applying")

settings_path = ".claude/settings.json"
with open(settings_path) as handle:
    settings = json.load(handle)
permissions = settings["permissions"]
ready = "Bash(gh pr ready *)"
changed = False
if ready in permissions["deny"]:
    permissions["deny"].remove(ready)
    changed = True
if ready not in permissions["allow"]:
    permissions["allow"].append(ready)
    changed = True
if "Bash(gh pr merge *)" not in permissions["deny"]:
    print("  REFUSING: Bash(gh pr merge *) is not denied. Nothing written.")
    sys.exit(1)
if changed:
    with open(settings_path, "w") as handle:
        json.dump(settings, handle, indent=2)
        handle.write("\n")
    print(f"  {settings_path}: gh pr ready moved to allow")
else:
    print(f"  {settings_path}: already applied")

failed = []
for path, old, new in EDITS:
    with open(path) as handle:
        source = handle.read()
    if new in source:
        print(f"  {path}: already applied")
        continue
    if source.count(old) != 1:
        failed.append(f"{path}: expected text not found exactly once")
        continue
    with open(path, "w") as handle:
        handle.write(source.replace(old, new))
    print(f"  {path}: updated")

if failed:
    report("Incomplete")
    for line in failed:
        print(f"  {line}")
    print("\n  These files have drifted from what LAN-209 expected. Nothing was")
    print("  guessed at. Report this rather than editing by hand.")
    sys.exit(1)

report("Done")
print("  Run `npm run verify` — tests/agent-harness.test.ts proves this landed.")
PY
