# Title

LAN-424: mission packet — Granular Roles & Permissions

# Body

## Packet summary

**M-GRANULAR-ROLES-AND-PERMISSIONS v1** (LAN-424, parent LAN-423). Four workflows, 18 screens photographed on
both sides at 1280 and 375, 25 requirements and 70 recorded decisions. `packet.json` validates as
**approved** against the frozen inventory at baseline `main` `0d4b6ce5`.

The packet defines per-seat access the club administers itself: every seat gets exactly the access its job
needs, and the club changes it on the seat's page without a code change.

| ID   | Workflow                                               | Surface                                                                             |
| ---- | ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `W1` | Administer a seat's grants on the seat page            | `/operate/admin/roles/[roleId]`: Access replaces Permissions; Roles index unchanged |
| `W2` | Edit roster group colours                              | `/operate/roster`: Edit categories and the Roster categories dialog                 |
| `W3` | Work the roster and recruits within granted categories | Roster board and record, recruitment board and prospect record                      |
| `W4` | Work events of a granted template, view or manage      | Events list, calendar, event pages, Follow-ups                                      |

### The decisions it locks

- Access is edited on the seat page only, by President, General Manager and IT Officer (`role_management`).
- Roster: the board's ten groups plus Contact & emergency, None / View / Edit. Recruiting: Person information,
  Recruit details (None / View / Edit), Event details (None / View).
- Events per template, None / View / Manage, including templates added later; no types or categories; the
  event templates page is unchanged. A template added after delivery starts at Manage for President, General
  Manager and IT Officer only, None for every other seat (Vice-President and Secretary included).
- Two switches: may add to the roster, may add recruits. No records switch.
- Records open to anyone who reaches the roster or recruits; a None section is collapsed and locked and its
  contents never leave the server; with None on Person a roster row shows the name only; with None on Contact
  & emergency, Contactable is a plain indicator that never carries or dials a number.
- Floor: President, General Manager, IT Officer full and fixed; Vice-President and Secretary start full,
  removable; every other seat starts with None.
- Copy access from another seat and Grant everything, each one audited action. No time-limited delegation.
- Every grant and colour change audited in `audit_events`.
- Roster group colours editable; palette of thirteen: key `blue` becomes Oxford Blue `#002147`, Lancer Gold
  `#C09723` added, no Lancer Blue; charcoal band text on gold and orange.
- Record header status is text, not a pill. Attendance is outside the access list and unchanged; the record's
  Attendance section is always open.

Delegated to the Mission Lead: table shapes, capability derivation, guard derivation, the attendance surface,
per-event Delivery page scoping, the LAN-406 revert, the printed-access test, package decomposition.
Excluded: messaging pause authority (LAN-407), erasure, seat-replacement rules, the generalised messaging
module, the Monday report, the attendance-sheet email, per-group scoping for coaches.

### Approvals recorded (Brian, 2026-09-25)

- Boundary, overview, the four-workflow inventory, and W2 to W4 specification, mockups and acceptance: "Other
  than that, I think this is approved. We can go ahead and create the packet and push it."
- W1: "W1 is approved." Copy access and Grant everything were on the approved W1-03 and are locked with it.
- Late locked rule, no re-shoot: "if the person record is not viewable … I should just see the name, not the
  contactable and missing."

Items drawn as _Proposed for owner approval_ and approved with the whole, now locked: Copy access / Grant
everything; eleven roster categories; `role_management` edits group colours; prospect Notes, What changed and
Status history read as Recruit details; Follow-ups is the delivery board; Event info link stays under View; a
template manager cannot edit the template itself.

Decided on LAN-424 (2026-09-25), restoring recorded rules where the drawings differ:

- Under View on Person with None on Contact & emergency, Contactable is a plain indicator and never carries or
  dials a number (W3-02 draws the chip dialling).
- The record's Attendance section is always open, because attendance is not in the access list (W3-03 draws
  it locked).
- A template added after delivery starts at Manage for the fixed seats only, per Brian and the Scope and Quote
  v2; the earlier nonblocking unknown is removed.

## Ledger

The completed intake ledger travels with the packet in this one merge:
`missions/intake/M-GRANULAR-ROLES-AND-PERMISSIONS/**` and `missions/packets/M-GRANULAR-ROLES-AND-PERMISSIONS/**`,
and nothing else. Each stage transition is its own commit carrying Brian's words.

## Validation

- `npm run intake -- check M-GRANULAR-ROLES-AND-PERMISSIONS` →
  `M-GRANULAR-ROLES-AND-PERMISSIONS ledger, stage pr_open: consistent.`
- `npm run intake -- pr-paths M-GRANULAR-ROLES-AND-PERMISSIONS --diff main` →
  `218 changed file(s) against main: exactly M-GRANULAR-ROLES-AND-PERMISSIONS's ledger and packet.`
- `npm run mission -- validate --packet missions/packets/M-GRANULAR-ROLES-AND-PERMISSIONS/packet.json --inventory missions/intake/M-GRANULAR-ROLES-AND-PERMISSIONS/02-workflows.md`
  → `Packet M-GRANULAR-ROLES-AND-PERMISSIONS v1 is valid and approved (baseline 0d4b6ce51798). Frozen workflow inventory matches. No state was written.`
- `decision-coverage.md`, `subject-coverage.md` and `mockups/index.html` are generated by the intake CLI; all
  18 proposal hashes in `shots.json` match their files. `npm run verify` was not run: the diff contains no
  application code; CI runs the full suite.

## External configuration

No external configuration. Nothing is sent, and no provider, credential or account is involved.

## Merge

- **Prohibited paths touched:** `missions/**` — prohibited from every automatic lane, so Brian merges this.
- **Linear issues delivered:** none closed by this PR; LAN-424's packet, execution follows under a Mission Lead.
- **Draft state:** Still a draft — Brian merges. Brian's merge approves this packet version.

## Production handoff

- **Supabase schema migration:** No — none.
- **Compatibility and deployment order:** None.
- **Pilot setup required:** No.
- **Pilot cleanup required:** No.
- **Other Brian action:** Merge this intake-artifacts-only PR to approve the packet. No owner action qualifies
  as asynchronous: no external party is awaited.
- **Verification after Brian acts:** Confirm the merged packet SHA on `main`; `npm run mission -- validate`
  on `main` reports the packet valid and approved.

## Limitations

- W1 and W4 screens show today's template colours; W2's palette re-tones key `blue` (Practice) to Oxford Blue.
  Not re-shot; the build follows W2.
- W3-02 predates the name-only rule under None on Person and draws the Mobile chip dialling; W3-03 draws the
  record's Attendance section locked. Each screen head says so and the build follows the rules. No re-shoot.
- The Scope and Quote v2 lists the report and the attendance list among places a None template's events never
  appear; this packet excludes the Monday report and delegates the attendance surface, per LAN-424.
- The Notion Work Request is not in this ledger (`HANDOFF.md` does not summarise it); the Scope and Quote v2
  and LAN-424 carry its content.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
