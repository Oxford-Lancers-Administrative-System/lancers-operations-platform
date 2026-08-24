# 0035 — Owner package walkthroughs and one final smoke

**Status:** Accepted · **Date:** 2026-08-24 · **Supersedes:** the owner/walker
ordering and separate cross-surface pass in
[0034](0034-mission-level-review-and-security-tier.md)

Approved by Brian during LAN-160. The package topology, security-tier review and
merge protections are unchanged.

## Context

Brian already checks each issue's live experience while a mission runs. Making
an agent walk the same issue first duplicated that work, delayed feedback and
made every correction capable of buying another broad model run. The final
integrated system still needs one smoke test because hand-offs between packages
can fail even when every package works alone.

## Decision

Present each visual package to Brian in its prepared zero-command environment as
soon as it is ready. Record approval at the exact package head and continue
unrelated work.

After all packages are built and integrated, run one bounded Sonnet workflow
walker over predetermined end-to-end journeys and their visible hand-offs. It
is the final pre-merge smoke test, not open-ended exploration and not a repeat of
Brian's presentation judgment. Its report absorbs the former separate
cross-surface pass. After a rendered correction, repeat only affected journeys;
classifier-proven non-rendered changes carry valid evidence forward.

The sensitive-path security-tier review remains separate and exact-head. No
package merges before the final walker covers its head.

## Consequences

- Brian sees issues early without paying for an agent walk per issue.
- One integrated walker can catch broken cross-package hand-offs.
- One cross-surface agent invocation disappears.
- Ordinary visual defects may reach Brian first; that is an accepted,
  forward-fixable cost trade-off.
