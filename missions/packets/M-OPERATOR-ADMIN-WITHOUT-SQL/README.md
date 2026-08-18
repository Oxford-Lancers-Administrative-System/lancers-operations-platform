# M-OPERATOR-ADMIN-WITHOUT-SQL v2

**Status:** `approved` — owner-authorized packet awaiting Brian's merge. No execution is authorized before merge.

## Outcome

Authorized club administrators can create or link one Person, invite committee, operational
and coaching operators by secure email, manage predefined role assignments, recover access
and review bounded audit history entirely through the application. Ordinary account
administration no longer requires Brian to write SQL or directly alter Supabase. Every fixed
coaching role also receives the approved narrow attendance and current availability access.

## Locked operating model

- `role_management`: President, General Manager and IT Officer.
- Operators are grouped Standing Officers, Club Officers and Coaches. Roles are grouped
  Operational Administration, Club Committee and Coaching Staff.
- General Manager and IT Officer are standing; GM is single-holder.
- General Manager governs President; nobody may remove themselves.
- IT Officer may perform leadership email recovery but cannot ordinarily remove leadership.
- One Person may simultaneously be player, coach, officer and operator.
- Player membership is seasonal; the Person has at most one operator login; compatible role grants combine.
- Single-holder restrictions follow the constitution, with GM additionally single-holder.
- Start dates default to today; future dates and audited backdating are allowed.
- Assignment ending, holder replacement and account deactivation remain separate audited facts.
- Deactivating operator access does not make the person's role pending or vacant. Replace role
  changes the holder; only End role creates a Not assigned vacancy.

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

Invite Operator is the top-right primary action. How Administration Works is a compact
question-mark link beside Operators and Roles, not a callout. Role detail presents the current
holder, a plain-language Permissions summary and Holder history. Operator detail uses
plain-language account states and Operator audit history. Role/capability copy comes from the
same reviewed definition as server enforcement. One canonical append-only event may appear in
both views without duplicated records. The full general audit browser remains deferred.

## Reviewed UI prototype

The packet includes a self-contained, repository-native
[`administration-prototype.html`](mockups/administration-prototype.html). It is the controlling
visual reference for the reviewed information architecture, labels, actions, states, grouping,
FAQ structure and responsive direction. Open it directly in a browser; it has no build step or
external assets.

Synthetic names, dates and counts—and exact spacing, border shades and low-level component
composition—remain illustrative. Implementation uses the existing Material UI shell and must
enforce the packet's service and authorization rules rather than treating sample prototype data
as behavior.

## Invitation, lifecycle and email

One guided invitation flow duplicate-checks and links or creates the Person using required
first name, last name and email plus optional phone number, requires at least one role, inherits
year context, defaults start to today and sends a secure first-access link. It records send
attempts and exposes resend while Invitation pending or Delivery failed. Failed delivery
preserves the same account for correction/resend.

The only new informational email is first-access invitation/resend. Password reset and
replacement-email verification remain security mechanisms. Role changes, ending, replacement,
deactivation and reinstatement do not send informational emails.

Brian has confirmed Resend and an API key are available. Brian configures the secret through
the approved secure environment path; it never enters source, SQL, Notion, packet, logs or
client code. Real production first-access delivery is required for acceptance. Broader Resend
account administration, DNS/domain and unrelated LAN-126 work remain excluded.

## Coaching boundary

All ten fixed coaching roles may be invited as operators. Each receives only:

- narrow attendance, including minimal walk-up capture; and
- current availability viewing and Orange/Red reporting.

This does not grant Green confirmation, availability history or actor identity, injury/medical
narrative, general roster/contact data, administrative access or football-assignment/depth-chart
self-service. A player-coach reuses the same Person and operator account; membership remains an
independent seasonal record.

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
editing, broader coach module, general audit browser, cycle creation/closure, bulk handover, H7,
LAN-84 recovery rehearsal, Meta/WhatsApp, broader Resend/DNS/SMTP foundation, real-data
cutover or unrelated Release-One work.

## Approval path

1. Brian approved packet version 2 in the completed intake conversation on 18 August 2026.
2. Intake validates and leaves the packet-only PR for Brian's review and merge.
3. Brian's merge authorizes the exact packet and commit.
4. Only then may the Mission Lead initialize, decompose and execute the mission.

Observed implementation baseline: `5812390914b4ca45b609328ffd929ec45071be17`.
