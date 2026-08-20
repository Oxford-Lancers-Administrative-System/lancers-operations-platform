# Mission Intake skill implementation handoff

## Delivered by this change

This change installs and validates the Claude Code mission-intake harness: the
ledger-first skill, state/resume validator, mockup standards and exemplar,
templates, packet completeness validation, three-skill harness allowlist, proposed
Notion kickoff replacement, and synthetic kill/resume rehearsal.

## Acceptance still outstanding: first real use

The first real use remains the re-intake of `M-EVENT-RSVP-PARTICIPATION`, using the
preserved contaminated packet as a line-by-line verification checklist. It is the
next separately invoked `/mission-intake <portfolio mission number>` run after this
skill is available. That run requires Brian's serial boundary, overview, inventory,
workflow-specification, and mockup approvals and must end in its own packet-only
pull request. Those approvals and packet evidence cannot be fabricated or folded
into this harness implementation change.

Until that intake completes, this ticket's “First real use” acceptance criterion is
open. Confirmed contaminated-packet lines may seed its ledger; unverified lines must
be omitted.

## Production handoff

- Schema migration and filenames: No
- Compatibility and deployment order: None
- Pilot setup required: No
- Pilot cleanup required: No
- Other Brian action: Review and merge the normal harness PR; then invoke the Event
  RSVP first-use intake separately
- Verification after Brian acts: Confirm the skill is available and the new intake
  prints a valid Stage 0 resume banner from its committed ledger
