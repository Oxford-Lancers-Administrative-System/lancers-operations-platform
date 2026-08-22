# Mission Intake changelog

## 2026-08-22

First-run corrections (LAN-149), from the completed
`M-EVENTS-CALENDAR-TARGET-STATE` intake:

- Source-scoped controlling-decision coverage is now canonical in
  `state.json.decision_coverage`, validated before the workflow stage, and
  rendered to `decision-coverage.md`. Sweeping surfaces and actions did not prove
  that every decision had one authoritative home.
- Stage 3 requires a conversational walkthrough before Brian is shown a
  specification or asked to approve it, and the workflow template gained
  `Purpose/intended outcome` and `Dependencies and mission boundaries`.
- `mockups/index.html` is generated from the ledger by
  `npm run intake -- hub --write`; `status` fails on drift. A nonvisual mission
  records `mockup_hub: {"not_applicable": "<reason>"}` instead.
- Scripted intake edits assert their match count, report the targets they
  changed, reload after formatting and re-validate the reloaded artifact.
- The final pull request is intake-artifacts-only: the mission's ledger and its
  packet land in the one owner-approved merge.

## 2026-08-20

- Established the ledger-first intake state machine, repository-grounded mockup
  review, mechanical packet assembly, and fresh-session resume protocol.
