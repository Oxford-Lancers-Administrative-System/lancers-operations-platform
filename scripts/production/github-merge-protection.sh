#!/usr/bin/env bash
#
# Owner-run. Puts the merge rules into GitHub itself, so no workflow in this
# repository — ours included — can merge work before it is ready.
#
# The model, in one line: DRAFT MEANS NOT READY. GitHub refuses to merge a
# draft natively, and its auto-merge waits for the draft to be lifted. So the
# act of taking a pull request out of draft is the authorization to merge it,
# and nothing else needs to be.
#
# What this sets:
#
#   1. A ruleset on `main`: a pull request is required, both CI jobs must be
#      green at an up-to-date head, main cannot be force-pushed or deleted,
#      and squash is the only merge method.
#
#   2. ZERO required approving reviews. Deliberate. Brian is the only human
#      here; a required approval he cannot give himself would lock him out of
#      his own work, and GitHub reviews are not how this repository decides
#      anything. Readiness is the draft bit, not an approval.
#
#   3. No bypass actors — and none are needed, because nothing here requires
#      an approval to satisfy. Brian merges his own work through the same
#      rules everyone else does: green checks, not a draft.
#
#   4. Repository auto-merge enabled, so a workflow can ASK for a merge
#      (`gh pr merge --auto`) rather than perform one. GitHub then merges if
#      and only if the pull request is out of draft and every required check
#      is green. Protected-path work is simply never asked for, so it waits
#      for Brian's own hand on the merge button.
#
#   5. GitHub Actions may not create or approve pull requests. Belt and
#      braces at zero approvals, but it stops the requirement being quietly
#      satisfiable by a token if approvals are ever turned back on.
#
# Dry run by default. Pass --apply to write.
#
#   ./scripts/production/github-merge-protection.sh            # show the plan
#   ./scripts/production/github-merge-protection.sh --apply    # write it

set -euo pipefail

REPO="Oxford-Lancers-Administrative-System/lancers-operations-platform"
BRANCH="main"
RULESET_NAME="main — merge readiness"
CHECK_ONE="Format, lint, typecheck, test, build"
CHECK_TWO="Container builds and serves"

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
    "    code owner review:  \(.required_pull_request_reviews.require_code_owner_reviews // false)",
    "    required checks:    \((.required_status_checks.contexts // []) | join(", ") | if . == "" then "none" else . end)"
  ' /tmp/prot.json
else
  note "    (none)"
fi

note "Repository settings:"
gh api "repos/$REPO" --jq '"    allow_auto_merge: \(.allow_auto_merge)   delete_branch_on_merge: \(.delete_branch_on_merge)"'
gh api "repos/$REPO/actions/permissions/workflow" \
  --jq '"    actions may approve PRs: \(.can_approve_pull_request_reviews)"' 2>/dev/null \
  || note "    (cannot read; organisation policy may govern it)"

if [ "$APPLY" = false ]; then
  say "Dry run. Re-run with --apply to write the rules below."
  cat <<'PLAN'
  1. Create or replace the ruleset "main — merge readiness" on main:
       - require a pull request before merging
       - 0 required approving reviews
       - require both CI checks green, branch up to date
       - squash only
       - block force pushes and deletion of main
       - no bypass actors
  2. Enable repository auto-merge and delete-branch-on-merge.
  3. Forbid GitHub Actions from creating or approving pull requests.

  NOTE: classic branch protection, if present above, takes precedence over a
  ruleset where they overlap. If the "current state" section shows a classic
  rule on main, delete it in Settings > Branches so this ruleset is the only
  thing deciding.
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
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "require_code_owner_review": false,
        "dismiss_stale_reviews_on_push": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["squash"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [
          { "context": "$CHECK_ONE" },
          { "context": "$CHECK_TWO" }
        ]
      }
    }
  ]
}
JSON
)

EXISTING=$(gh api "repos/$REPO/rulesets" --jq \
  ".[] | select(.name == \"$RULESET_NAME\") | .id" 2>/dev/null | head -1 || true)

if [ -n "$EXISTING" ]; then
  note "Updating ruleset #$EXISTING"
  printf '%s' "$RULESET_JSON" | gh api --method PUT "repos/$REPO/rulesets/$EXISTING" --input - > /dev/null
else
  note "Creating the ruleset"
  printf '%s' "$RULESET_JSON" | gh api --method POST "repos/$REPO/rulesets" --input - > /dev/null
fi

note "Enabling auto-merge and delete-branch-on-merge"
gh api --method PATCH "repos/$REPO" \
  -F allow_auto_merge=true -F delete_branch_on_merge=true > /dev/null

note "Forbidding Actions from creating or approving pull requests"
gh api --method PUT "repos/$REPO/actions/permissions/workflow" \
  -F can_approve_pull_request_reviews=false > /dev/null 2>&1 \
  || note "  (refused — governed by the organisation's Actions settings)"

say "Done"
note "Re-run without --apply to verify."
