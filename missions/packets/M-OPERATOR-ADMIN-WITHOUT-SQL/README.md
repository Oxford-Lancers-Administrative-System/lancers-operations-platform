# M-OPERATOR-ADMIN-WITHOUT-SQL v1

**Status:** `not_ready` — active product intake. No execution is authorized.

## Outcome

Authorized club administrators can invite and manage application operators and
their predefined, cycle-scoped role assignments from the application. Ordinary
account administration no longer requires Brian to write SQL or make direct
Supabase changes.

## Owner decisions recorded — 18 August 2026

Only **President and General Manager** administer operator accounts and role
assignments. Vice-President and Secretary remain broad ordinary operators but do
not invite, deactivate, re-home, assign, end or replace access. President and
General Manager cannot remove or deactivate themselves; each administers the
other's top-level transition.

Administration is placed at the bottom of the left sidebar, separated from
Events, Calendar, Roster and other regular work and immediately above the
user/account controls.

These decisions supersede the packet's earlier four-role direction and expose a
required surgical reconciliation with the owner-approved Notion brief. The
packet remains `not_ready`.

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

## Open intake decisions

1. Whether operator detail includes a narrow read-only access-history panel,
   while the full Stage-4 audit browser remains excluded.
2. How active-cycle context is displayed and confirmed without making the
   administrator choose a cycle on every ordinary assignment or silently
   storing the wrong cycle.
3. Whether the Roles page shows a read-only plain-language capability summary;
   permission editing remains excluded.
4. Whether General Manager is single-holder, while preserving the existing
   constitutional-office and multi-holder rules elsewhere.
5. The exact surgical reconciliation of the controlling Notion brief.

## Intake path

1. Continue the product review with Brian and resolve the four points above.
2. Reconcile the approved product record only with Brian's explicit surgical
   authorization.
3. Keep consequential decisions locked in `packet.json`; leave implementation
   design and work-package decomposition to the Mission Lead.
4. When no blocking product question remains, change the canonical packet to an
   executable ready state and rerun validation.
5. Brian's merge of the ready packet-only PR approves the exact version and
   commit. Only then may the Mission Lead initialize the mission and create or
   reconcile Linear work.

Observed implementation baseline: `5812390914b4ca45b609328ffd929ec45071be17`.
