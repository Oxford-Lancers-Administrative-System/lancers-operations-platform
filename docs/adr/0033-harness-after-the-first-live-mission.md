# 0033 — What the first live mission changed about the harness

**Status:** Accepted · **Date:** 2026-08-22 · **Amends:**
[0020](0020-zero-command-visual-review.md), [0027](0027-mission-harness.md),
[0030](0030-concurrent-missions.md)

Approved by Brian through LAN-148, whose merge is the owner approval of the
revised authorization checkpoint and guarded-merge boundary in §4 below. The
agent implementing that issue may not use the authority the issue creates to
merge the issue that creates it.

## Context

`M-OPERATOR-ADMIN-WITHOUT-SQL` ran from 19 to 21 August 2026 — the first
mission the harness executed for real rather than in rehearsal. It proved the
things ADR 0027 was built to prove: durable state survived kills and
compaction, flat delegation held, and independent review caught serious
defects that would otherwise have shipped.

It also produced eight packages, eight Linear issues and eight pull requests
for one workflow; review environments that were dead by the time Brian opened
them; two database slots leaked past the point where anything could recover
them; and twelve usability and consistency defects that package-scoped review
could not have found, because they were properties of the surfaces together
rather than of any one package.

The common thread is not rigour. Each of those is a rule that was correct in
rehearsal and wrong under a real run's timing, and none of them is fixed by
reviewing harder.

## Decision

**1. A decomposition is a proposal until it is approved.** Work-package ids
were stable from the first recording, and Linear issues and branches followed
immediately, so an over-split plan could never be argued with — only executed.
A plan now records what boundary makes each package separate, with the actual
overlapping files or the actual independently gated surface as evidence, and
what the split costs Brian in merges, reviews and visual approvals. Risk grade,
directory, tidiness and estimated agent time are refused by name: they describe
the work, not a boundary. One coherent issue defaults to one implementation
package. Nothing durable is created before the decomposition is approved, a
revised plan withdraws the approval it no longer describes, and a package can
be combined away while it is still a proposal — recorded, and kept in state as
removed so its lineage stays readable. Once it has a Linear issue or a worker,
0027's stable-identity rule applies unchanged.

**2. A pending visual environment has an owner of its own.** ADR 0020's
zero-command handoff stands entirely; what it lacked was anything owning the
environment between the agent finishing and Brian looking, which is the only
interval it exists for. The application was a child of the worker's process and
died with it, and the database lease stopped being refreshed at the same
moment. A supervisor now holds both, in its own detached process, until the
environment is approved, rejected, obsoleted or explicitly abandoned. It is
refused as ready when its supervisor is gone, when it has stopped proving
itself live, or — the failure that looks fine — when the branch has moved past
the head it serves, because Brian would then be approving something that is not
what would merge. Two independent visual gates may be pending at once.

The 375px half of 0020's gate was unsatisfiable on the review machine and
satisfied on paper: Chrome's window resizing is clamped well above 375px there,
so the agent could not produce the layout while the gate accepted a
self-reported boolean nobody could check. Viewport evidence is now measured —
the browser context is asked how wide it is — and carries the screenshots it
produced. The old boolean is refused by name rather than ignored, because the
whole defect was that it looked satisfied.

**3. The mission is reviewed, not only its packages.** Two reviews exist that
only make sense against the integrated result. A workflow walker completes the
mission's actual user jobs end to end at exactly the head Brian will be shown,
and visual approval is refused without one. A cross-surface pass compares the
repeated facts, states, dates, permissions and copy once every package has
landed, and a mission cannot close as delivered without it. Separately, a fix
that claims to have corrected a finding must show the defect can be put back
and that a named test notices: the command, the failing assertion, the restored
pass, and the SHA. Only for corrections, only for the findings that correction
was dispatched to fix — four recorded facts, not a mutation-testing platform.

**4. Review grade, merge route and dispatch state are three things.** 0027
conflated them, and the cost was concrete. Because authorization rules are
graded Highest and all Highest work was refused the lane, the
checkpoint-approval tier Brian approved on 2026-08-18 could never fire for the
work it was designed for. Grade now decides review rigour only. Merge route is
decided by the protected surface the diff actually touches plus the evidence,
which the workflow re-derives from the real diff and which no receipt can talk
its way past. Highest-risk work may travel the guarded lane once an answered
owner checkpoint names the package — Brian still hears about it before it
merges. Migrations, grants and RLS, authentication and session boundaries,
production scripts, secrets, hosted data, deployment and every path in the
prohibited list remain owner-merged, unchanged and decided from evidence.

Dispatch is the third. Downstream work waited for `merged` even when its
dependency was reviewed clean and green at exactly the head its pull request
carried, which made Brian's merge timing a scheduling dependency and idled
packages for hours. That basis is now accepted, pinned to the exact commit and
recorded; it is refused the moment the dependency's head moves past the
reviewed one. Choosing to wait anyway records its concrete reason, and routing
a lane-qualified package to Brian is recorded as the harness defect it is.

**5. A mission closes where Brian already looks.** Mission evidence lived in
the packet and the journal, both mission-scoped and temporary, so the only
durable trace of a finished mission was Linear issues marked Done — which the
project status page correctly refuses to read as acceptance. LAN-146 is what
happened instead: an issue created to hold eleven findings because nothing
durable would. A mission now closes by extending the **existing** Notion
mission record with the outcome, the shipped issues, pull requests and exact
merged SHAs, the acceptance and injection evidence, the unresolved findings and
their dispositions, the owner and external actions, elapsed time and cost, and
the next action. Not a new Linear planning document, and not an automatic
deferred-findings issue. The Mission Lead writes it through its Notion
connection; no new credential is introduced, and none is needed.

**6. Liveness is the heartbeat, not the process.** 0030 gave each mission its
own stack and each issue a fenced slot, and reclaim required the owning process
to be dead. But the recorded pid is the Claude session's, which every agent
under that session shares, so an abandoned lease was unrecoverable while the
editor stayed open — both slots were leaked when LAN-148 began, one for
eighteen hours. A conclusively dead owner is reclaimed at once; an owner the
pid cannot distinguish waits out a heartbeat window. `review-ready` is never
reclaimed on a timer, but cleanup may retire it once every holding worktree is
conclusively gone.

## Consequences

- Brian is asked for one more thing and released from several. He approves a
  decomposition before it becomes durable, which is where his judgment is
  cheapest and most useful. He stops being a scheduling dependency for reviewed
  work, stops being asked to re-open dead environments, and triages a mission's
  residue once, from a record that is already in front of him.
- A class of highest-risk work now merges without him reading the final diff,
  bounded by an answered checkpoint that names the package and by a
  prohibited-path scan he does not have to trust an agent for. This is the
  boundary his merge of LAN-148 approves.
- The lease window is long — heartbeats are refreshed by whichever guarded
  command happens to run next, so an agent waiting on a build is genuinely
  working. It should shorten once §2's supervisor heartbeats continuously
  rather than a command doing it in passing.
- `appliedConfig` proves what the coordinator applied, not what Docker is
  running. It fails closed on the case that occurred — a re-fenced stack never
  restarted — and can be stale in the optimistic direction if containers are
  restarted outside the guarded commands.

## Alternatives considered

- **Review harder.** Rejected: the twelve missed defects were properties of the
  surfaces together. No amount of package-scoped rigour reaches them.
- **Hosted preview environments per package.** Rejected by the issue's
  non-goals, and it answers a question nobody asked: the environments did not
  need to be remote, they needed an owner.
- **Keep every Highest-risk merge with Brian.** Rejected: it is what made the
  checkpoint tier dead code, and his own observation on 2026-08-18 was that by
  the time a pull request reaches his merge click he rubber-stamps it. The
  moment his judgment operates is the checkpoint, so the ask moves there.
- **A general mutation-testing framework** for §3's fix-to-test binding.
  Rejected by the issue's non-goals and disproportionate: the question is
  whether one fix is bound to one test, and four recorded facts answer it.
