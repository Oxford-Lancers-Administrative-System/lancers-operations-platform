# Title

Prepare <mission-id> mission packet

# Body

## Packet summary

## Ledger

The completed intake ledger travels with the packet in this one merge:
`missions/intake/<mission-id>/**` and `missions/packets/<mission-id>/**`, and
nothing else.

## Validation

- `npm run intake -- check <mission-id>`
- `npm run intake -- pr-paths <mission-id> --diff main`
- `npm run mission -- validate --packet missions/packets/<mission-id>/packet.json --inventory missions/intake/<mission-id>/02-workflows.md`

## Production handoff

- Schema migration and filenames: No
- Compatibility and deployment order: None
- Pilot setup required: No
- Pilot cleanup required: No
- Other Brian action: Merge this intake-artifacts-only PR to approve the packet
- Verification after Brian acts: Confirm the merged packet SHA on `main`
