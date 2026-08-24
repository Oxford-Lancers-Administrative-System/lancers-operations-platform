# Runner-discipline rehearsal

This is an executable-policy transcript fixture, not evidence from a live
mission.

1. Planning classifies `WP-review` as `guarded-auto`; its scope is
   `src/app/operate/example/**`.
2. The Lead attempts to hand off only `http://localhost:3000/example`.
   Result: **refused — not ready for owner review** because Scope, Fit, the
   Exact review table, the approval boundary, and the expected-route line are
   missing.
3. The Lead supplies Scope and Fit, then an Exact review table with page, URL,
   action, what to verify, and acceptance. It ends: “Your approval means the
   presentation is accepted; it does not yet mean the package is merged.” It
   records `Expected merge route: guarded-auto — standard application path`.
   Result: review handoff permitted.
4. A later correction adds `.github/workflows/example.yml`. The required
   route re-check detects a refused path and changes the expected route to
   `owner`.
5. Result: **stop before owner review**; disclose the route-changing scope and
   exact path to Brian. Approval given for `guarded-auto` is not reused.
6. After the disclosure, the Lead presents the complete three-part brief again
   with `Expected merge route: owner — prohibited workflow path`.
