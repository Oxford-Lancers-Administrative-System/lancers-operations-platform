# M-OPERATOR-ADMIN-WITHOUT-SQL v1

**Status:** `not_ready` — active product intake. No execution is authorized.

## Outcome

Authorized club administrators can create or link a durable Person, invite committee
and coaching operators by secure email, manage the approved static role catalogue,
and preserve access history entirely through the application. Ordinary account
administration no longer requires Brian to write SQL or make direct Supabase changes.

## Owner decisions recorded — 18 August 2026

- `role_management`: President, General Manager and IT Officer.
- Vice-President and Secretary: broad ordinary operating tier, not access administration.
- General Manager: standing, multi-year, single-holder continuity authority.
- Nobody may deactivate themselves or remove their own role.
- General Manager may replace/remove President; President may not replace/remove GM.
- IT Officer performs transitional technical administration but may not remove President or GM.
- One visible active operating-year context, such as 2026–27, governs routine assignments.
- Administration sits at the bottom of the left sidebar above user/account controls.
- Roles show read-only capability summaries; grants remain non-editable.
- Operator detail includes a bounded, read-only Access History; the full general audit browser stays deferred.
- Invitation is secure email through Supabase Auth and the transactional email path, not WhatsApp.

The controlling Identity, Access & Ownership brief was surgically amended and
refetched after Brian's authorization. Older conflicting D-2/D-7 text remains as
history but is explicitly superseded by the 18 August amendment.

## Static role catalogue

The packet now uses twenty predefined roles:

- ten committee/operational roles already approved; and
- Head Coach, Offensive Coordinator, Defensive Coordinator, Quarterbacks Coach,
  Offensive Line Coach, Wide Receivers Coach, Defensive Line Coach, Linebackers
  Coach, Defensive Backs Coach and Special Teams Coach.

These roles are assignable but never created or edited at runtime. All coaches may
receive operator accounts. This does not build the future coach module or widen
current coach permissions.

## Create-or-link Person

Invitation begins with duplicate-checked Person search. If no Person exists, the
administrator creates the minimum durable non-player Person record before sending
the invitation. A valid personal email is required for the operator invite; mobile
is preferred when known. The administrator never creates or sends a password—the
recipient follows the secure email link and establishes it.

## Locked boundary

In scope are the 20-role catalogue, Operators and Roles pages, minimal create-or-link
Person seam, committee and coach email invitations, visible active-year assignment,
effective-dated role history, standing GM continuity, bounded Access History,
deactivation/reinstatement, email re-home, hierarchy safeguards, read-only permission
transparency, the one-time bootstrap and a short club-facing guide.

Excluded are runtime-created roles, permission editing, public signup, player
accounts, the full coach module, the full Stage-4 audit browser, cycle lifecycle,
bulk handover, H7, LAN-84, Meta/WhatsApp, DNS/Resend/SMTP setup, real-data cutover
and unrelated Release-One capability.

## Intake path

1. Continue the remaining product and exception review with Brian.
2. Keep the packet `not_ready` until the entire commissioned workflow is accepted.
3. Leave technical architecture, sequencing and work-package decomposition to the Mission Lead.
4. Change to an executable approved state only after final owner review and validation.
5. Brian's merge of the ready packet-only PR approves the exact version and commit.

Observed implementation baseline: `5812390914b4ca45b609328ffd929ec45071be17`.
