#!/usr/bin/env bash
#
# Owner-run. Agents never run this. Sets the ruleset on `main` for the delivery
# process in docs/adr/0041-push-to-main-without-pull-requests.md (LAN-523).
#
# The model, in one line: a branch passes every check on the author's machine,
# reaches `main` in one fast-forward push, and CI runs once, on main. Deploy
# (`deploy.yml`) refuses any commit whose required checks are not green, so that
# refusal — not a merge gate — is what stands between a red main and production.
#
# What this sets:
#
#   1. A ruleset on `main` that BLOCKS FORCE PUSHES and BLOCKS DELETION, and
#      nothing else. In particular it has:
#        - no "require a pull request",
#        - no required status checks,
#        - no "require branches to be up to date".
#      A direct push is the intended path, so none of those can stay.
#
#   2. No bypass actors, and none are needed: with no pull-request rule,
#      nobody needs to bypass anything to push.
#
#   3. Repository auto-merge and delete-branch-on-merge switched OFF. Nothing
#      here asks for an auto-merge any more. (Dependabot version updates are
#      already off; its security updates can still open a pull request, which
#      Brian merges by hand in the GitHub UI. That is the one place a pull
#      request survives.)
#
# It also removes the old "main — merge readiness" ruleset, because that ruleset
# is exactly what this replaces. Classic branch protection on `main`, if it
# exists, would override a ruleset where they overlap: the dry run shows it, and
# you delete it in Settings > Branches.
#
# Dry run by default. Pass --apply to write.
#
#   ./scripts/production/github-merge-protection.sh            # show the plan
#   ./scripts/production/github-merge-protection.sh --apply    # write it

set -euo pipefail

REPO="Oxford-Lancers-Administrative-System/lancers-operations-platform"
BRANCH="main"
RULESET_NAME="main — no force push, no deletion"
OLD_RULESET_NAME="main — merge readiness"

APPLY=false
[ "${1:-}" = "--apply" ] && APPLY=true

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
note() { printf '  %s\n' "$*"; }

command -v gh >/dev/null || { echo "gh is not installed."; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh is not authenticated. Run: gh auth login"; exit 1; }

say "Current state — $REPO"

note "Rulesets:"
gh api "repos/$REPO/rulesets" --jq '.[] | "    #\(.id)  \(.name)  [\(.enforcement)]"' 2>/dev/null \
  || note "    (none, or no permission to read them)"

note "Classic branch protection on $BRANCH:"
if gh api "repos/$REPO/branches/$BRANCH/protection" > /tmp/prot.json 2>/dev/null; then
  jq -r '
    "    required approvals: \(.required_pull_request_reviews.required_approving_review_count // "none")",
    "    required checks:    \((.required_status_checks.contexts // []) | join(", ") | if . == "" then "none" else . end)"
  ' /tmp/prot.json
  note "    DELETE THIS in Settings > Branches: it overrides the ruleset below."
else
  note "    (none)"
fi

note "Repository settings:"
gh api "repos/$REPO" --jq '"    allow_auto_merge: \(.allow_auto_merge)   delete_branch_on_merge: \(.delete_branch_on_merge)"'

if [ "$APPLY" = false ]; then
  say "Dry run. Re-run with --apply to write the rules below."
  cat <<'PLAN'
  1. Delete the ruleset "main — merge readiness" if it exists.
  2. Create or replace the ruleset "main — no force push, no deletion" on main:
       - block force pushes (non_fast_forward)
       - block deletion of main
       - no pull-request rule, no required status checks, no up-to-date rule
       - no bypass actors
  3. Turn repository auto-merge and delete-branch-on-merge off.
PLAN
  exit 0
fi

say "Applying"

RULESET_JSON=$(cat <<JSON
{
  "name": "$RULESET_NAME",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": { "ref_name": { "include": ["refs/heads/$BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" }
  ]
}
JSON
)

OLD=$(gh api "repos/$REPO/rulesets" --jq \
  ".[] | select(.name == \"$OLD_RULESET_NAME\") | .id" 2>/dev/null | head -1 || true)
if [ -n "$OLD" ]; then
  note "Deleting the old ruleset #$OLD ($OLD_RULESET_NAME)"
  gh api --method DELETE "repos/$REPO/rulesets/$OLD" > /dev/null
fi

EXISTING=$(gh api "repos/$REPO/rulesets" --jq \
  ".[] | select(.name == \"$RULESET_NAME\") | .id" 2>/dev/null | head -1 || true)

if [ -n "$EXISTING" ]; then
  note "Updating ruleset #$EXISTING"
  printf '%s' "$RULESET_JSON" | gh api --method PUT "repos/$REPO/rulesets/$EXISTING" --input - > /dev/null
else
  note "Creating the ruleset"
  printf '%s' "$RULESET_JSON" | gh api --method POST "repos/$REPO/rulesets" --input - > /dev/null
fi

note "Turning auto-merge and delete-branch-on-merge off"
gh api --method PATCH "repos/$REPO" \
  -F allow_auto_merge=false -F delete_branch_on_merge=false > /dev/null

say "Done"
note "Re-run without --apply to verify."
