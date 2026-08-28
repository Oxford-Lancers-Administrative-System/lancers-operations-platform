# Mission Intake changelog

## 2026-08-28

Subject-product coverage (LAN-188), from Brian's Recruitment intake correction:

- A portfolio row commissions a subject, not a closed feature list. Version 3
  ledgers map discovered operation, pages, administration, failures, external
  tools and mission seams before workflows freeze.
- `subject-coverage.md` is generated from canonical ledger state. Mechanical
  gates refuse ownerless areas, unsupported exclusions, unresolved gaps and
  blocking or unexplained provisional handoffs; Brian's approvals remain the
  conceptual-completeness gate.
- Current `main`, rendered locally with synthetic data, is the product baseline;
  user-facing work defaults to current-versus-proposed desktop and 375px proof.
- Cross-record consequences accumulate into one append-only amendment plan.
  Brian approves the collected plan before edits; applied changes record refetch
  verification. Existing version 1/2 ledgers retain their original contracts.

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
