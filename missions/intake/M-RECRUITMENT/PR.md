# Title

Prepare M-RECRUITMENT mission packet

# Body

## Packet summary

`missions/packets/M-RECRUITMENT/packet.json` v1, status `approved`, baseline
`main@e669331d96fb949a3c29d7475842a6414cfe9e57`.

Recruitment is the funnel from first contact to the flip: four capture doors that
dedup before they create, recruitment's own board and record, two questionnaires,
recruitment events with their own audience and their own chase, the administration
of all of it, and the two exits. Mission 5 gives recruitment the person; Mission 7
takes the member.

- **14 frozen workflows**, `W1`–`W14`, each approved by Brian one at a time in his
  own words on 2026-08-31. `W3`, `W9` and `W15` are dead numbers, kept as empty
  slots and never reused.
- **23 requirements**, each pinned to one of 10 version-pinned sources.
- **22 decisions**, 7 items delegated to the Mission Lead, and 5 nonblocking
  unknowns each with an explicit handling rule.
- **39 screens**, every one a photograph of the running application on both sides,
  at a browser-measured 1280px and a browser-measured 375px. No screen pairs a
  photograph with a drawing.

**The defect this mission closes.** At the baseline `scheduleEventLadder` inserts a
reminder job for every invitation filtered only by `event_id`, so a recruit invited
today receives the player escalation to the President; and `countByCapacity` omits
recruits from the approval summary, so an operator approves a recruitment event
without being told how many recruits it reaches. The fix is not suppression: the
player ladder stops reaching recruits, and recruitment's own — an invitation and at
most one polite follow-up, then silence — is built beside it.

**Owner gates that remain.** Four WhatsApp templates must clear Meta before the
recruitment cycle can run; only `event_invitation` exists there today. LAN-86 and
LAN-101 stay open. The club's own domain must serve the sign-up page before a QR is
printed for a real recruiting moment.

## Ledger

The completed intake ledger travels with the packet in this one merge:
`missions/intake/M-RECRUITMENT/**` and `missions/packets/M-RECRUITMENT/**`, and
nothing else.

The approved mocks are not duplicated into the packet directory — the shots alone
are 30 MB, and both trees are approved, merged and immutable together.
`missions/packets/M-RECRUITMENT/mockups/README.md` says exactly where they are and
what each screen is grounded in.

## Validation

- `npm run intake -- check M-RECRUITMENT` — consistent, stage `pr_open`
- `npm run intake -- pr-paths M-RECRUITMENT --diff main` — intake artifacts only
- `npm run mission -- validate --packet missions/packets/M-RECRUITMENT/packet.json --inventory missions/intake/M-RECRUITMENT/02-workflows.md` — valid, approved, inventory matches

No application code, schema, migration or workflow file is touched by this pull
request, so `npm run verify` has nothing of its own to prove here; CI provides the
gate on the final head SHA.

## Production handoff

- Schema migration and filenames: No
- Compatibility and deployment order: None
- Pilot setup required: No
- Pilot cleanup required: No
- Other Brian action: Merge this intake-artifacts-only PR to approve the packet. Separately, and not blocking this merge, submit the four recruitment WhatsApp templates to Meta.
- Verification after Brian acts: Confirm the merged packet SHA on `main`, then `npm run mission -- validate --packet missions/packets/M-RECRUITMENT/packet.json --inventory missions/intake/M-RECRUITMENT/02-workflows.md` against that SHA
