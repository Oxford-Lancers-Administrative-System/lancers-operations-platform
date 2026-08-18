# M-OPERATOR-ADMIN-WITHOUT-SQL v1

**Status:** `not_ready` — active product intake. No execution is authorized.

## Outcome

Authorized club administrators can create or link one durable Person, invite committee,
operational and coaching operators by secure email, manage predefined role assignments,
and review bounded access history entirely through the application. Ordinary account
administration no longer requires Brian to write SQL or make direct Supabase changes.

## Owner decisions recorded — 18 August 2026

- `role_management`: President, General Manager and IT Officer.
- Operational Administration appears first, Club Committee second and Coaching Staff third.
- The top-level Roles view shows current holders only; former holders remain on detail.
- General Manager and IT Officer are standing across operating years; GM is single-holder.
- One application-wide operating-year context is inherited without repetitive selectors or labels.
- Historical years require deliberate switching and are read-only through ordinary administration.
- Nobody may deactivate themselves, remove their own role or administrator-rehome their own email.
- General Manager governs President; IT Officer may recover leadership email but not remove leadership.
- Single-holder restrictions follow the constitution, with GM additionally single-holder.
- Start dates default to today; future dates and audited backdating are allowed; ordinary assignment has no end-date field.
- Deactivation is immediate and separate from ending organizational roles.
- Role definitions and grants remain read-only.

## One Person, independent relationships

One durable Person may simultaneously be a player, coach, officer and operator. Player
membership is season-specific; the operator account is the Person's single login; role
assignments are independent effective relationships. An existing player who becomes
President or coach is linked to the same Person and account—never duplicated.

Invitation uses one guided email flow:

1. duplicate-check and link the existing Person, or create one with name and email;
2. require at least one approved role;
3. inherit the active operating year and default the start date to today;
4. send a secure link so the recipient establishes their own password;
5. preserve the same account for delivery correction, resend and activation.

First login establishes credentials only. Operator self-service profile editing, public
signup and player-facing accounts remain outside this mission.

## Account lifecycle and recovery

Deactivation prevents sign-in immediately without deleting Person, membership, account,
role or audit history and without automatically ending roles. Reinstatement restores only
still-effective authority. Forgotten password remains self-service. Lost-email recovery
disables the old path, verifies the replacement email and retains the same identity and
attribution; failed delivery is correctable and retryable without another account.

## Audit boundary

Audit is event-first and append-only. One canonical event records actor, authority at the
time, target Person/operator, affected role when applicable, operating year, reason and
before/after state. Operator Access History shows target-affecting events; role detail
shows the role-related subset as holder history. The same event may appear in both views
without duplicate records. The full Stage-4 general audit browser remains excluded.

## Locked boundary

In scope are the static 20-role catalogue, Operators and Roles pages, the minimal
create-or-link seam, guided email invitation, inherited-year role lifecycle, standing
GM/IT continuity, target and role audit projections, deactivation/reinstatement, verified
email recovery, hierarchy safeguards, read-only permission transparency, one-time
bootstrap and the short club-facing guide.

Excluded are runtime-created roles, permission editing, public signup, player-facing
accounts, self-service profile editing, the full coach module, the full general audit
browser, cycle lifecycle, bulk handover, H7, LAN-84, Meta/WhatsApp, DNS/Resend/SMTP
setup, real-data cutover and unrelated Release-One capability.

## Intake path

1. Continue the remaining product, exception and acceptance review with Brian.
2. Keep the packet `not_ready` until the entire commissioned workflow is accepted.
3. Leave architecture, sequencing and work-package decomposition to the Mission Lead.
4. Change to an executable approved state only after final owner review and validation.
5. Brian's merge of the ready packet-only PR approves the exact version and commit.

Observed implementation baseline: `5812390914b4ca45b609328ffd929ec45071be17`.
