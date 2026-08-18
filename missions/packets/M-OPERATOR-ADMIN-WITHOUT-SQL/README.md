# M-OPERATOR-ADMIN-WITHOUT-SQL v1

**Status:** `not_ready` — active product intake. No execution is authorized.

## Outcome

Authorized club administrators can invite and manage application operators and
their predefined, cycle-scoped role assignments from the application. Ordinary
account administration no longer requires Brian to write SQL or make direct
Supabase changes.

## Resolved owner decision — 18 August 2026

Regular operator administration belongs to **President, Vice-President,
Secretary and General Manager**, matching the owner-approved Identity, Access &
Ownership brief.

The later showcase-era implementation granting `role_management` to IT Officer
alone is implementation drift for this mission to reconcile. This decision does
not silently reopen or change the IT Officer's other current grants; those remain
outside this packet unless a directly mission-relevant conflict requires separate
owner review.

This resolves one intake question. It does **not** approve the mission packet.
The packet remains `not_ready` while Brian reviews the ordinary workflows,
exceptions, placement and acceptance behavior for the first real Mission Harness
test.

## Locked boundary

In scope are the static 13-seat catalogue, Operators and Roles pages, invitation
of an existing Person, explicit cycle-scoped assignments, effective-dated role
history, deactivation/reinstatement, email re-home, last-administrator
protections, append-only audit evidence and a short club-facing guide.

The full Stage-4 change-audit viewing interface is not in this mission. The
mission preserves and verifies the audit substrate and historical role records;
it exposes current operator state and current role holders only. Adding a
general audit browser later requires its own approved scope.

Also excluded: editable grants, new roles, player accounts, public sign-up,
cycle open/close, bulk handover, H7, LAN-84, Meta/WhatsApp, DNS/email foundation,
real-data cutover and unrelated Release 1 capability.

## Intake path

1. Walk the everyday operator-administration workflows with Brian.
2. Test the exceptional states, authority boundaries, information placement and
   acceptance examples.
3. Keep consequential decisions locked in `packet.json`; leave implementation
   design and work-package decomposition to the Mission Lead.
4. When no blocking product question remains, change the canonical packet to an
   executable ready state and rerun validation.
5. Brian's merge of the ready packet-only PR approves the exact version and
   commit. Only then may the Mission Lead initialize the mission and create or
   reconcile Linear work.

Observed implementation baseline: `5812390914b4ca45b609328ffd929ec45071be17`.
