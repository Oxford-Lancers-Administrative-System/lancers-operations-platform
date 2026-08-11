# Test matrix template

**The lead writes this, before the implementer is launched.** It is the test
contract for one issue: what "working" means, decided from the acceptance
criteria and the authoritative requirements rather than from whatever the
implementer finds convenient once it is deep in the code.

It goes into the delegation brief, and it goes into the pull request evidence.
An implementer launched without one has been told to stop.

## Before you write it — escalate rather than resolve

Read the Linear issue, the frozen domain model, `docs/architecture/data-model.md`,
the relevant ADRs, and the locked owner decisions the issue cites.

**Stop and escalate to Brian — do not fill a gap yourself, and do not let the
implementer fill it — if the issue is:**

- **ambiguous** about a material behaviour (two readings produce different
  products, not merely different code);
- **internally inconsistent** (an acceptance criterion contradicts another, or
  contradicts the frozen model or an ADR);
- **missing a material acceptance criterion** for behaviour the issue clearly
  requires.

Product ambiguity is Brian's to resolve. An implementer choosing its preferred
reading is how a slice quietly becomes a different product.

## Review level and expected blast radius — decide them here

Two required fields, filled in **now**, from the acceptance criteria — not later,
from the diff that comes back.

**Review level:** `<0 / 1 / 2 / 3 — level 2 if this line is missing or left blank>`

**Expected blast radius:** `<one sentence: what could go wrong if this change were
defective, and who or what could reach the defect — a user, an operator, a
scheduled job, or nothing yet>`

**Justification, required only below level 2:** `<why the change is unreachable
or non-behavioural, and confirmation that it touches no mandatory-floor path>`

The level is keyed on **reachability and blast radius, never on diff size**. The
mandatory level-2 floor, the four levels, and the recording requirements are in
`SKILL.md` §4; a change on the floor is at least level 2 however small it is, and
the lead may not reason its way past that. Copy all three fields into the wave
record and, below level 2, into the run report as well. Writing the blast-radius
sentence is what surfaces "nothing consumes this yet" before wave-scale process
is applied to a patch-scale change.

## The matrix

One row per **material behaviour** — a behaviour a person or another system can
observe, and would notice being wrong. Not one row per function.

| #   | Behaviour        | Expected success           | Invalid / failure behaviour                                                            | Boundary conditions                                 | Authorization & privacy                      | Test level                                  | Critical? |
| --- | ---------------- | -------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------- | ------------------------------------------- | --------- |
| 1   | `<what it does>` | `<the observable outcome>` | `<what a rejection looks like, and that it is a rejection rather than a silent no-op>` | `<the edges — just before, exactly at, just after>` | `<who may, who may not, what must not leak>` | unit / service / db+RLS / integration / e2e | yes / no  |

Filling the columns:

- **Expected success** — an observable outcome. "Returns the right thing" is not
  a row; "the invitation moves to `accepted` and a delivery result names the
  operator" is.
- **Invalid / failure** — every material behaviour has one. If you cannot name
  the failure case, you do not yet understand the behaviour.
- **Boundary conditions** — name the edge and both sides of it. For a cutoff at
  event start: just before is accepted, exactly at and just after are refused.
- **Authorization & privacy** — who may do it, who may not, and what must not be
  visible to whom. A row that leaves this blank is asserting there is no rule;
  say so explicitly if that is what you mean.
- **Test level** — the cheapest level that can actually observe the behaviour.
  Database constraints and RLS are proven against the database, not against a
  mock of it. Browser tests are for load-bearing user journeys only, and only
  once the screen exists (see the end-to-end policy in `SKILL.md`).
- **Critical?** — mark **yes** for business rules, security, privacy, and state
  transitions. The reviewer must challenge every critical row by injecting a
  plausible defect and confirming a test catches it.

## Deliberately untested

List every material behaviour that will **not** be tested, and why. This section
existing and being honest matters more than it being short.

| Behaviour | Why it stays untested                                                 | Residual risk                                            |
| --------- | --------------------------------------------------------------------- | -------------------------------------------------------- |
| `<what>`  | `<why — cost, environment, needs real infrastructure, needs a human>` | `<what could go wrong undetected, and who would notice>` |

"Covered by CI" is not a reason. "Requires hosted Supabase, which no agent may
touch" is.

## What this matrix is not

It is not a list of test function names, and the implementer is not required to
produce one test per row. It is the contract the tests are judged against — by
the reviewer, independently, after the fact.
