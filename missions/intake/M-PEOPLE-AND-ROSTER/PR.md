# Title

Prepare M-PEOPLE-AND-ROSTER mission packet

# Body

## Packet summary

## Ledger

The completed intake ledger travels with the packet in this one merge:
`missions/intake/M-PEOPLE-AND-ROSTER/**` and
`missions/packets/M-PEOPLE-AND-ROSTER/**`, and nothing else.

## Validation

- `npm run intake -- check M-PEOPLE-AND-ROSTER`
- `npm run intake -- pr-paths M-PEOPLE-AND-ROSTER --diff main`
- `npm run mission -- validate --packet missions/packets/M-PEOPLE-AND-ROSTER/packet.json --inventory missions/intake/M-PEOPLE-AND-ROSTER/02-workflows.md`

## Production handoff

- Schema migration and filenames: No
- Compatibility and deployment order: None
- Pilot setup required: No
- Pilot cleanup required: No
- Other Brian action: Merge this intake-artifacts-only PR to approve the packet
- Verification after Brian acts: Confirm the merged packet SHA on `main`
