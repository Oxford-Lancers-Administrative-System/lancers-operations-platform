# Title

Prepare <mission-id> mission packet

# Body

## Packet summary

## Ledger

The completed intake ledger travels with the packet in this one push:
`missions/intake/<mission-id>/**` and `missions/packets/<mission-id>/**`, and
nothing else.

## Validation

- `npm run intake -- check <mission-id>`
- `npm run intake -- branch-paths <mission-id> --diff main`
- `npm run mission -- validate --packet missions/packets/<mission-id>/packet.json --inventory missions/intake/<mission-id>/02-workflows.md`

## Production handoff

- Schema migration and filenames: No
- Compatibility and deployment order: None
- Pilot setup required: No
- Pilot cleanup required: No
- Other Brian action: Push this intake-artifacts-only branch to `main` to approve the packet
- Verification after Brian acts: Confirm the packet SHA on `main` and that CI is green
