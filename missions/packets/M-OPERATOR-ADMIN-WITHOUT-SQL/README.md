# M-OPERATOR-ADMIN-WITHOUT-SQL v1

**Status:** `not_ready` — final reconciled packet awaiting owner approval. No execution is authorized.

## Outcome

Authorized club administrators can create or link one durable Person, invite committee,
operational and coaching operators by secure email, manage predefined role assignments,
recover access and review bounded audit history entirely through the application. Ordinary
account administration no longer requires Brian to write SQL or directly alter Supabase.

## Locked operating model

- `role_management`: President, General Manager and IT Officer.
- Operational Administration appears first, Club Committee second and Coaching Staff third.
- General Manager and IT Officer are standing; GM is single-holder.
- General Manager governs President; nobody may remove themselves.
- IT Officer may perform leadership email recovery but cannot ordinarily remove leadership.
- One Person may simultaneously be player, coach, officer and operator.
- Player membership is seasonal; the Person has at most one operator login; compatible role grants combine.
- Single-holder restrictions follow the constitution, with GM additionally single-holder.
- Start dates default to today; future dates and audited backdating are allowed.
- Assignment ending, holder replacement and account deactivation remain separate audited facts.

## Operating-year context

Routine forms inherit one application-wide current year without repeated selectors or labels.
Past years are deliberately selectable and read-only. This mission does not create or close
years. Once lifecycle separately creates an open future year, authorized administrators may
switch to it and prepare assignments. The main Roles page never mixes holders across years.

## Application surfaces

- `/operate/admin/operators`
- `/operate/admin/operators/[operatorId]`
- `/operate/admin/roles`
- `/operate/admin/roles/[roleId]`
- `/operate/admin/guide` — protected How Administration Works page linked from Operators
  and Roles, not another sidebar item

Role and capability definitions remain read-only. Operator detail shows target-focused Access
History; role detail shows holder history. One canonical append-only event may appear in both
views without duplicated records. The full general audit browser remains deferred.

## Invitation, lifecycle and email

One guided invitation flow duplicate-checks and links or creates the Person using name and
email, requires at least one role, inherits year context, defaults start to today and sends a
secure first-access link. Failed delivery preserves the same account for correction/resend.

The only new informational email is first-access invitation/resend. Password reset and
replacement-email verification remain security mechanisms. Role changes, ending, replacement,
deactivation and reinstatement do not send informational emails.

Brian has confirmed Resend and an API key are available. Brian configures the secret through
the approved secure environment path; it never enters source, SQL, Notion, packet, logs or
client code. Real production first-access delivery is required for acceptance. Broader Resend
account administration, DNS/domain and unrelated LAN-126 work remain excluded.

## One-time owner-run bootstrap

Implementation delivers:

1. one versioned, idempotent migration for the 20-role catalogue and mission-owned schema; and
2. one supported, idempotent Supabase-admin bootstrap script—never direct Auth-table inserts.

The minimum manifest is Clint as active-year President, Stewart as standing GM and Brian as
standing IT Officer. Brian supplies exact names/emails at production handoff. Dry run,
duplicate reconciliation, conflict refusal and bootstrap audit evidence are mandatory. Brian
runs or explicitly directs production execution. After verification, another manual SQL
provisioning touch is a defect.

## Locked exclusions

No runtime role/grant editing, public signup, player-facing accounts, self-service profile
editing, coach module, general audit browser, cycle creation/closure, bulk handover, H7,
LAN-84 recovery rehearsal, Meta/WhatsApp, broader Resend/DNS/SMTP foundation, real-data
cutover or unrelated Release-One work.

## Approval path

1. Intake validates and presents this exact final reconciled version.
2. Brian explicitly approves the version.
3. Intake records approval and leaves the packet-only PR for Brian's merge.
4. Brian's merge authorizes the exact packet and commit.
5. Only then may the Mission Lead initialize, decompose and execute the mission.

Observed implementation baseline: `5812390914b4ca45b609328ffd929ec45071be17`.
