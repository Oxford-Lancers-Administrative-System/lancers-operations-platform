# Title

Prepare the automated communications mission packet

# Body

## Packet summary

Intake is in progress. W1 is fully approved and complete. W2 has a revised draft
specification and mockup incorporating Brian's WhatsApp, answer recording,
follow-up question, social-proof, and outstanding-invitation direction, but W2
has not been approved as a whole. W3 through W8 have not started.

The exact handoff, including settled decisions and unresolved W2 review points,
is recorded in
`missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/evidence/2026-08-25-w2-handoff.md`.

## Ledger

When complete, the intake ledger will travel with the packet in this one merge:
`missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/**` and
`missions/packets/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/**`, and nothing
else.

## Validation

- Current handoff only: `npm run intake -- check M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY`
- Final intake: `npm run intake -- pr-paths M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY --diff main`
- Final packet: `npm run mission -- validate --packet missions/packets/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/packet.json --inventory missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/02-workflows.md`

## Production handoff

- Schema migration and filenames: No
- Compatibility and deployment order: None
- Pilot setup required: No
- Pilot cleanup required: No
- Other Brian action: Merge this intake-artifacts-only PR to approve the packet
- Verification after Brian acts: Confirm the merged packet SHA on `main`
