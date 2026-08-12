# 0015 — Review is graded into four levels, keyed on reachability

**Status:** Superseded by [0018](0018-single-issue-agent-development.md) · **Date:** 2026-08-11 · **Amends
[0013](0013-supervised-agent-development.md)**

ADR 0013 records a **single** review standard: every draft pull request goes to a
fresh-context reviewer that challenges every critical matrix row by injecting a
plausible defect. This ADR replaces that one standard with **four graded levels**
and leaves everything else in 0013 — three roles, two workers, worktree
isolation, draft-only, human merges, the one wave-wide database lock, the test
matrix written before implementation — exactly as it stands.

It changes **when** an independent review happens. It does not change what one
consists of.

## Context

The single standard has already paid for itself. On LAN-72 the reviewer ran three
rounds and 39 injected defects against a ~2,900-line change across 24 files, and
found a defect no amount of green CI would have surfaced: a commit-time rejection
escaping as a raw driver error carrying `DETAIL: Key (email)=…` — a person's name
and contact details, out of the one field three documents promise never to copy
out. Three critical rules also turned out to survive a plausible defect. That
process was proportionate.

The same process was then applied to LAN-95: four lines and one string, in a
change **nothing consumes yet** — role codes are displayed, not checked, until
LAN-73 wires `requireRole()`. The lead wrote a six-row matrix, a wave record, and
queued a full independent review for a patch. Brian noticed the mismatch; the
lead did not.

Two observations follow, and they pull in opposite directions:

1. A uniform standard applied to everything eventually gets applied
   inattentively, and inattentive review is the outcome this whole structure
   exists to avoid.
2. **Size is the wrong criterion for reducing it.** "It is only a small change"
   is how review gets skipped on exactly the changes that most need it. Two of
   LAN-72's four blockers were one-line defects: a `>=` where `>` was meant,
   which would have admitted a role assignment at the instant it expired; and a
   guard fix applied correctly but to the wrong module, caught only because a
   reviewer injected the same defect one file over. Neither would have been
   flagged by a size heuristic. Both were caught by injection.

What actually distinguished LAN-95 was not that it was short. It was that the
change is **inert**: no deployed code path consumes it, so a defect could not
reach a person until a later issue wires it up — and that later issue gets its
own review, exercising the predicate under real enforcement, which is a stronger
test than a reviewer poking at it in isolation.

Cost, measured rather than assumed: a level-2 review round ran ~10–17 minutes of
wall clock on LAN-72 (~37 minutes over three rounds). That is cheap against a
substrate issue and expensive against a four-line fix. But the figure that
matters is not the average cost of a review — it is the cost of a missed defect,
and LAN-72's round-one blocker was a PII leak into an operator-visible error.

## Decision

### 1. Four levels, defined in the lead workflow

`.claude/skills/supervise-batch/SKILL.md` §4 is authoritative. In summary:

| Level                           | What runs                                                                               | When                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **0 — none**                    | Lead verifies CI for the head SHA and reads the whole diff                              | Documentation only, no behavioural change, no change to something that gates a production action             |
| **1 — lead verification**       | Level 0, plus the lead checks the implementer's own injection results                   | Behavioural but unreachable from any deployed path, no security or privacy surface, no dependency, no schema |
| **2 — full independent review** | The reviewer role in full, pinned to the head SHA, injecting against every critical row | **The default**, everything reachable, everything with a critical row, and everything on the floor below     |
| **3 — multi-round**             | Level 2, then the corrections re-reviewed **as new code**                               | Migrations; grants, policies, RLS; authn/authz; secrets or a new privileged credential; the harness itself   |

### 2. The criterion is reachability and blast radius, never diff size

Stated explicitly in `SKILL.md`, because the failure mode is a reader inferring
the opposite. Can a defect here be reached from a deployed code path, by a user,
an operator, or a scheduled job — and if it is wrong, what is the worst
observable outcome? A four-line change to an authorization predicate is level 2
or 3; a large change nothing imports may be level 1.

### 3. A mandatory level-2 floor that overrides lead discretion

Any change under `supabase/migrations/`; any grant, policy, or RLS surface;
anything under `src/lib/auth/` or `src/lib/db/`; anything touching a secret or
`.env.example`; any dependency change; any change under `.claude/`,
`.github/workflows/`, or to `AGENTS.md` — each forces **at least** level 2
regardless of how small it is. A floor a lead can argue around is not a floor.

The list is a floor, not a definition of what deserves review: level 2 remains
the default for everything, and these entries only remove the lead's discretion
to go below it. A path's absence from the list is never an argument for a lower
level.

### 4. The level is assigned at matrix time, before implementation

With the test matrix, from the acceptance criteria — never from the diff that
comes back, which is how a level gets chosen to fit the work that was actually
done. The lead also records the **expected blast radius** in one sentence.
Writing that sentence is the control: it is what would have surfaced "nothing
consumes this yet" on LAN-95 before wave-scale process was applied to it.

The level is re-checked against the actual diff during verification, where the
lead is reading the diff anyway. That re-check may only **raise** a level, never
lower it.

### 5. The lead may assign 0 or 1, only on the record

Brian's decision: the lead may go below the default on its own authority, without
waiting for him — an approval gate would stall an unattended run — **provided the
justification is recorded in both the wave record and the run report**. An
assignment below 2 with no recorded justification is not compliant and reverts to 2. The lead is deciding how much scrutiny its own wave receives, which is the one
judgement in this workflow that nothing else checks; the written reason is the
whole audit trail.

### 6. An unspecified level is level 2 — the default fails safe, upward

A missing field, a blank field, or a value outside 0–3 resolves to level 2, never
to "no review". Silence produces more scrutiny, not less. A skipped review that
reads as an oversight is worse than either doing it or deciding openly not to.

### 7. One correction cycle at every level, unchanged

The limit does not scale with the level. Level 3's re-review of corrections
happens inside that single cycle — a second pass over one correction, not a
second correction. A defect found later, by a subsequent issue's review, re-enters
as new work with its own level rather than consuming a cycle budget belonging to
something else.

### 8. The defect-injection standard is untouched

At levels 2 and 3, everything in `.claude/agents/code-reviewer.md` applies in
full: pinned to the head SHA, test adequacy judged independently against the
matrix, every critical row challenged by injecting a plausible defect, no
mutation ever committed, staged, pushed, or left behind. The reviewer is told
which level it is invoked at so that a genuinely narrowed scope — the level-3
second pass over corrections — is distinguishable from an incomplete brief; if
its brief states no level, it reviews at level 2 in full.

## What this amends in 0013

0013's operating model says the lead "routes each draft pull request to the
independent reviewer". That now reads: **routes each draft pull request to the
independent reviewer at level 2 and above**, with levels 0 and 1 available only
under §3–§6 above. Everything else in 0013 stands unchanged, including the
sections on the test matrix as a contract, the implementer not certifying its own
tests, critical behaviours being challenged rather than reasoned about, the
database lock, and the two-worker cap.

## Consequences

- The harness is deliberately **less strict in some cases**. That is the point,
  and it is also the risk: this decision is a control on how much scrutiny future
  agent work receives, written with the help of agents. The floor is therefore
  wide, the default is level 2, and the fail-safe direction is upward.
- `tests/agent-harness.test.ts` pins every element above, in **both**
  directions. Positively: the four levels, each level's entry criteria **by
  content rather than by length**, each floor entry — checked inside `SKILL.md`'s
  floor section and inside `AGENTS.md`'s graded-review bullet, rather than
  anywhere in either file — the override wording in both, the
  recorded-justification requirement in both recording locations, the matrix-time
  timing in the skill, the templates **and** the working agreement, the
  reachability-not-size criterion, the fail-safe default, and the one-cycle
  limit. Negatively: five regions may not acquire a qualifier — the graded-level
  policy (§4), the verification-time re-check (§6), **the independent-review
  section (§7), which is what actually launches the reviewer**, the `AGENTS.md`
  graded-review bullet, and the `AGENTS.md` § Agent tooling section.
- **The second direction was added after a review found six escapes, and every
  one was a contradicting addition rather than a deletion.** A positive assertion
  proves a sentence is present and notices nothing about the exception written
  beside it: a floor reading "…is still level 2, unless the lead records that the
  touched path is trivially inert" satisfied the entire suite. Scope is the other
  half of the lesson — the first correction guarded only the sections the six
  demonstrated defects happened to occupy, which left §7 open to a strictly worse
  repeal ("…unless the lead has already read the whole diff, in which case the
  launch is waived"), and checked the `AGENTS.md` floor entries against the whole
  file, where three of the nine appear elsewhere and could be deleted from the
  floor unnoticed.
- **The token ban is a list of shapes, not a proof.** A qualifier phrased in
  words nobody enumerated still passes, and enumerating further is not the
  answer: the tokens are deliberately narrowed to phrases that hand discretion to
  an agent ("unless the lead", "except where the lead", "at the lead's
  discretion") rather than bare conjunctions, because a guard that fires on
  "a level may not be lowered except by Brian" — a **tightening** — is a guard
  somebody will relax, and a relaxed guard catches nothing. The residual gap is
  why `.claude/**` and `AGENTS.md` are on the floor, and why prose no test pins
  is a preference rather than a guarantee.
- **One assertion was deliberately given up.** Deleting the sentence "A floor a
  lead can argue around is not a floor" now passes, where an earlier revision
  caught it. It is rhetorical restatement and the binding clauses beside it are
  still pinned, but pinning it verbatim also failed an honest reword — and a test
  that cries wolf gets relaxed. The trade is recorded rather than presented as
  strictly better.
- **Whether a level is assigned correctly remains a judgement**, and no test can
  check it. The floor bounds the damage; the verification-time re-check catches a
  level set too low against the code that actually arrived; and the requirement to
  record a justification in two places means a wrong call is at least legible
  afterwards. A test can assert a justification exists, not that it is sound —
  Brian reads the run report.
- **Level 1's "unreachable" test is a judgement made before the code exists,**
  by the lead, about its own wave. A new service module that nothing imports yet
  is honestly unreachable, so its business rules could be written at level 1 and
  never face an injection challenge. This ADR's answer — the issue that wires it
  up gets its own review, under real enforcement — is an argument rather than a
  guarantee: that issue's diff does not contain the predicate, and a reviewer
  pinned to that diff has no reason to re-challenge it. The
  verification-time re-check and the floor bound this; neither closes it.
- **At level 0 or 1 there is no independent reviewer**, so nothing catches a
  shared-resource side effect the implementer does not disclose. On 2026-08-11 an
  implementer silently changed the shared local stack's test-user password and
  disclosed it unprompted; under level 1 that disclosure would have been the only
  record. The delegation brief now tells an implementer at level 0 or 1 that its
  own disclosure is the only record there will be, and to escalate if its work
  turns out to touch a floor path or to be reachable after all.
- **`.claude/**` is on the floor, so this change is its own first subject** — the
  policy's first application is to the change that writes it.
- `.claude/settings.json` denies only `Edit(./.claude/**)`, which blocks the
  `Edit` tool and not `Write` or a shell redirect. That gap is recorded on LAN-96
  as a separate follow-up: closing it inside the change that must write to
  `.claude/` would be circular, and a settings change taking effect mid-run would
  be worse. This ADR does not close it.

## Revisit when

- A level assigned below 2 turns out, in hindsight, to have let a defect through
  — the first such case is evidence that the floor or the criteria are wrong, and
  it should be recorded here rather than absorbed.
- The floor list stops matching the repository's shape: `src/proxy.ts`, the
  Supabase clients under `src/lib/supabase/`, `docs/migration-runbook.md`, and
  `tests/agent-harness.test.ts` are all plausible additions, deliberately not
  added here because the floor list is Brian's decision and was fixed as
  proposed.
- Enough waves have run to say whether levels 0 and 1 are ever actually chosen.
  If in practice everything lands at 2, the grading is ceremony and should be
  simplified back.
