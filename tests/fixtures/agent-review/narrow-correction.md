# Dry run: narrow Highest-risk correction

This is an executable-policy transcript fixture, not evidence that a language
model will comply mechanically.

1. Round 1 uses `review_mode: full` at SHA A. Independent provenance is recorded
   before implementer framing. The result is `blocked` by R-001 because the
   authorization-denial harness assertion is missing.
2. The top-level session adds only that denial assertion at SHA B. The change
   neither expands the authorization boundary nor replaces the test strategy,
   so no full-reset condition applies.
3. Round 2 uses `review_mode: correction`, base A, head B, blocker R-001, and
   reviews delta A..B plus the affected denial behavior. Unchanged critical
   behavior is not reinjected; its prior controlled-defect evidence is reused.
4. R-001 is resolved and the correction result is `clear`. Handoff: full review
   completed at A; correction delta A..B was approved; current head B is covered.
