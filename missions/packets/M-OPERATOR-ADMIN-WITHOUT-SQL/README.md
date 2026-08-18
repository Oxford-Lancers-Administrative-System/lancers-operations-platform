# M-OPERATOR-ADMIN-WITHOUT-SQL v1

**Status:** `not_ready` — one owner decision remains. No execution is authorized.

## Outcome

Authorized club administrators can invite and manage application operators and
their predefined, cycle-scoped role assignments from the application. Ordinary
account administration no longer requires Brian to write SQL or make direct
Supabase changes.

## Why the packet is not ready

The controlling sources disagree on the only capability that can authorize the
workflow:

- The owner-approved Identity, Access & Ownership brief (14 August 2026) grants
  `role_management` to President, Vice-President, Secretary and General Manager.
- Current `main`, citing LAN-124 and a later Brian decision (15 August 2026),
  grants `role_management` to IT Officer alone.

This determines who can see operator data and assign roles, so the Intake Agent
cannot silently select one. The recommendation is **IT Officer alone**: it is
later, already implemented and the narrower least-privilege grant. Brian must
choose before the packet can be marked ready; if he chooses IT Officer, the
approved Notion brief needs a surgical correction and refetch.

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

## Approval path

1. Brian answers the single `role_management` question.
2. The controlling product record is surgically reconciled if needed.
3. Intake refetches it, updates this packet to `approved`, reruns canonical
   validation and requests review of the ready version.
4. Brian's merge of the ready packet-only PR approves the exact version and
   commit. Only then may the Mission Lead initialize the mission and create or
   reconcile Linear work.

Observed implementation baseline: `5812390914b4ca45b609328ffd929ec45071be17`.

