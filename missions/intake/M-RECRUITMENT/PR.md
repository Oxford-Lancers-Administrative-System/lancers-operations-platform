# Title

Prepare M-RECRUITMENT mission packet

# Body

## Packet summary

## Ledger

The completed intake ledger travels with the packet in this one merge:
`missions/intake/M-RECRUITMENT/**` and `missions/packets/M-RECRUITMENT/**`, and
nothing else.

## Validation

- `npm run intake -- check M-RECRUITMENT`
- `npm run intake -- pr-paths M-RECRUITMENT --diff main`
- `npm run mission -- validate --packet missions/packets/M-RECRUITMENT/packet.json --inventory missions/intake/M-RECRUITMENT/02-workflows.md`

## Production handoff

- Schema migration and filenames: No
- Compatibility and deployment order: None
- Pilot setup required: No
- Pilot cleanup required: No
- Other Brian action: Merge this intake-artifacts-only PR to approve the packet
- Verification after Brian acts: Confirm the merged packet SHA on `main`
