/**
 * What the bootstrap reads before it decides, and what it writes when it acts —
 * LAN-135, `REQ-one-time-bootstrap`.
 *
 * Every statement in this file is one the service layer already makes, restated
 * against this script's own connection. It is a restatement and not a reuse
 * because it has to be: `src/lib/services/operator-invitations.ts` imports
 * `server-only` and reaches the database through `src/lib/db/url.ts`, which
 * refuses every non-loopback host unconditionally and must keep refusing (ADR
 * 0001, ADR 0014, ADR 0026). A provisioning script that needed that guard
 * relaxed would be a provisioning script that had defeated the repository's
 * central safety property, so it opens its own connection instead and leaves
 * the guard alone.
 *
 * `tests/production-bootstrap-contract.test.ts` pays for the restatement,
 * against the local stack: it runs this script's writes and then reads the
 * result back through the *application's* own projections.
 *
 * ## Order of operations, and what it costs when it fails
 *
 * The order is `inviteOperator`'s, for `inviteOperator`'s reasons: create the
 * Auth login first, then write every row in one transaction, then send the
 * email. A login created and then orphaned by a failed transaction is removed
 * again — the one compensation in this file — because leaving it would make the
 * honest retry fail with "that address already has a login", which is exactly
 * the state `plan.mjs` refuses to adopt.
 *
 * A failure after the commit but before the email is not a rollback. The
 * operator exists, correctly, and has not been told; re-running with `--resend`
 * sends it.
 */

/**
 * The display form of a name, matching `NAME_EXPRESSION` in
 * `src/lib/services/administration-audit.ts`. `family_name` is nullable by
 * design, so this must not produce a trailing space.
 */
const NAME_EXPRESSION = (alias) => `case when ${alias}.family_name is null
          then coalesce(nullif(btrim(${alias}.known_as), ''), ${alias}.given_name)
        else coalesce(nullif(btrim(${alias}.known_as), ''), ${alias}.given_name)
             || ' ' || ${alias}.family_name
   end`;

/** What the founding assignments record about themselves. */
export const BOOTSTRAP_ASSIGNMENT_NOTE =
  "Established by the owner-run founding bootstrap (LAN-135).";

/**
 * The one active committee year, or the one open season — fail-closed in both
 * directions, exactly as `resolveActiveCommitteeYear` and `resolveActiveSeason`
 * are.
 *
 * Returns `null` for none *and* for more than one. The caller turns that into a
 * refusal naming what a human has to do; guessing which of two overlapping
 * years an appointment belongs to is not this script's decision to make.
 */
export async function observeOperatingCycle(client, scope) {
  const { rows } =
    scope === "season"
      ? await client.query(
          "select id, label from public.seasons where status in ('open', 'active') order by label",
        )
      : await client.query(
          `select id, label
             from public.committee_years
            where starts_on <= current_date
              and (ends_on is null or ends_on > current_date)
            order by starts_on desc`,
        );

  if (rows.length !== 1) return null;
  return { scope: scope === "season" ? "season" : "committee_year", ...rows[0] };
}

/** The catalogue row for a role code, looked up exactly. */
export async function observeRole(client, code) {
  const { rows } = await client.query(
    `select id, code, name, scope::text as scope, is_constitutional_office, is_single_holder_seat
       from public.roles where code = $1`,
    [code],
  );
  return rows[0] ?? null;
}

/**
 * Everything that decides one manifest entry's plan.
 *
 * One function so that the reads happen together, against one connection, at
 * one moment. The plan is only as good as the state it was computed from, and a
 * preview assembled from reads minutes apart would be a preview of a database
 * that never existed.
 *
 * @param {import("pg").Client} client
 * @param {object} entry a parsed manifest entry
 * @param {{ findLoginByEmail(email: string): Promise<{ id: string } | null> }} identity
 */
export async function observeOperator(client, entry, identity) {
  const role = await observeRole(client, entry.roleCode);
  const operatingYear = role ? await observeOperatingCycle(client, role.scope) : null;

  const account = await client.query(
    `select oa.id, oa.person_id, oa.auth_user_id, oa.is_active, oa.activated_at,
            ${NAME_EXPRESSION("p")} as person_name
       from public.operator_accounts oa
       join public.people p on p.id = oa.person_id
      where lower(oa.login_email) = $1`,
    [entry.email],
  );

  const operatorAccountByEmail =
    account.rows.length === 0
      ? null
      : {
          id: account.rows[0].id,
          personId: account.rows[0].person_id,
          authUserId: account.rows[0].auth_user_id,
          isActive: account.rows[0].is_active,
          activatedAt: account.rows[0].activated_at,
          personName: account.rows[0].person_name,
        };

  // The Auth server is only consulted when the club's own record does not
  // already answer the question. It is the slower read and the less
  // authoritative one: `operator_accounts.login_email` is what the application
  // resolves an operator by, and a login with no account behind it grants
  // nothing.
  const authUser = operatorAccountByEmail ? null : await identity.findLoginByEmail(entry.email);

  let personById = null;
  let operatorAccountByPerson = null;
  if (entry.personId !== null) {
    const found = await client.query(
      `select id, merged_into_person_id, ${NAME_EXPRESSION("p")} as name
         from public.people p where id = $1`,
      [entry.personId],
    );
    personById =
      found.rows.length === 0
        ? null
        : {
            id: found.rows[0].id,
            mergedIntoPersonId: found.rows[0].merged_into_person_id,
            name: found.rows[0].name,
          };

    const bound = await client.query(
      "select id from public.operator_accounts where person_id = $1",
      [entry.personId],
    );
    operatorAccountByPerson = bound.rows[0] ?? null;
  }

  const candidates =
    operatorAccountByEmail || entry.personId !== null || entry.createPerson
      ? []
      : await observeCandidates(client, entry);

  const personId = operatorAccountByEmail?.personId ?? entry.personId ?? null;

  const existingAssignment =
    role && personId
      ? ((
          await client.query(
            `select id, effective_from::text as effective_from, effective_to::text as effective_to
               from public.role_assignments
              where person_id = $1 and role_id = $2
                and (effective_to is null or effective_to > current_date)
              order by effective_from
              limit 1`,
            [personId, role.id],
          )
        ).rows[0] ?? null)
      : null;

  // Only a seat that admits one holder can be blocked by somebody else holding
  // it. The two flags are separate authorities — the constitution, and Brian's
  // General Manager decision — and `admits_multiple_holders` is the one column
  // the catalogue says to consult, so this consults it.
  const conflictingHolder =
    role && !existingAssignment && (role.is_constitutional_office || role.is_single_holder_seat)
      ? ((
          await client.query(
            `select ra.id, ra.person_id, ${NAME_EXPRESSION("p")} as person_name
               from public.role_assignments ra
               join public.people p on p.id = ra.person_id
              where ra.role_id = $1
                and (ra.effective_to is null or ra.effective_to > current_date)
                and ($2::uuid is null or ra.person_id <> $2)
              limit 1`,
            [role.id, personId],
          )
        ).rows[0] ?? null)
      : null;

  return {
    role,
    operatingYear,
    operatorAccountByEmail,
    authUser,
    personById,
    operatorAccountByPerson,
    candidates,
    existingAssignment,
    conflictingHolder: conflictingHolder
      ? {
          assignmentId: conflictingHolder.id,
          personId: conflictingHolder.person_id,
          personName: conflictingHolder.person_name,
        }
      : null,
  };
}

/**
 * Person records that might already be this person — the duplicate check
 * `REQ-one-time-bootstrap` requires.
 *
 * Two independent signals, because either alone misses a real duplicate: the
 * same name, and an email contact point carrying the same address. Merged
 * records are excluded — linking a login to a record that has been merged away
 * would bind the club's most privileged seat to a tombstone.
 *
 * Deliberately coarse, and deliberately not a decision. It over-reports rather
 * than under-reports, because the consequence of a false positive is that Brian
 * reads one extra line and pins a `personId`, and the consequence of a false
 * negative is a duplicate Person for the club President.
 */
export async function observeCandidates(client, entry) {
  const { rows } = await client.query(
    `select p.id,
            ${NAME_EXPRESSION("p")} as name,
            (lower(p.given_name) = $1 and lower(coalesce(p.family_name, '')) = $2) as name_match,
            exists (
              select 1 from public.contact_points cp
               where cp.person_id = p.id
                 and cp.kind = 'email'
                 and lower(btrim(cp.raw_value)) = $3
            ) as email_match
       from public.people p
      where p.merged_into_person_id is null
        and (
          (lower(p.given_name) = $1 and lower(coalesce(p.family_name, '')) = $2)
          or exists (
            select 1 from public.contact_points cp
             where cp.person_id = p.id
               and cp.kind = 'email'
               and lower(btrim(cp.raw_value)) = $3
          )
        )
      order by p.id
      limit 20`,
    [entry.givenName.toLowerCase(), entry.familyName.toLowerCase(), entry.email],
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    matchedOn: [row.name_match ? "name" : null, row.email_match ? "email" : null].filter(Boolean),
  }));
}

/**
 * A cheap, total summary of everything this script can write.
 *
 * The dry run compares one of these before and after itself and refuses to
 * report success if they differ. "The dry run writes nothing" is then a fact
 * the run has checked, not a property somebody has to trust the code for — and
 * the contract test asserts on the same value.
 */
export async function fingerprint(client) {
  const { rows } = await client.query(
    `select (select count(*) from public.people)             as people,
            (select count(*) from public.contact_points)     as contact_points,
            (select count(*) from public.operator_accounts)  as operator_accounts,
            (select count(*) from public.role_assignments)   as role_assignments,
            (select count(*) from public.audit_events)       as audit_events,
            (select coalesce(max(occurred_at)::text, '')
               from public.audit_events)                     as last_audit_event`,
  );
  return rows[0];
}

/**
 * Writes exactly one `public.audit_events` row, inside the caller's
 * transaction.
 *
 * The statement is `recordAudit`'s, column for column. The transaction is not a
 * convenience either: invariant M2 holds because the audit row is written in
 * the same transaction as the change it describes, and a row that survives a
 * rolled-back change is a false history — worse than none.
 */
async function insertAuditEvent(client, row) {
  const { rows } = await client.query(
    `insert into public.audit_events
       (actor_person_id, actor_label, action, entity_table, entity_id,
        from_state, to_state, reason, context)
     values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9::jsonb, '{}'::jsonb))
     returning id`,
    [
      row.actorPersonId,
      row.actorLabel,
      row.action,
      row.entityTable,
      row.entityId,
      row.fromState,
      row.toState,
      row.reason,
      row.context ? JSON.stringify(row.context) : null,
    ],
  );
  return rows[0].id;
}

/**
 * Records the outcome of one invitation send, in its own transaction.
 *
 * Called **after** the operator's rows are committed, because that is when the
 * email is sent — a delivery failure is a recorded outcome against an account
 * that exists, never a reason to undo one.
 *
 * A success clears any previously recorded failure and refreshes `invited_at`,
 * so "when the live invitation was issued" stays true across a `--resend`. A
 * failure sets the two failure columns, which is what moves the account into
 * *Delivery failed* — `deriveOperatorAccountState` reads them, and an account
 * the club's record calls *Invitation pending* when the email bounced is a
 * record that says nothing is wrong when something is.
 */
export async function recordInvitationOutcome(client, outcome, context) {
  const { auditRows, runId, operatingYear, correlationId } = context;
  const detail = {
    bootstrap: true,
    runId,
    procedure: "scripts/production/bootstrap-founding-operators.mjs",
    requirement: "REQ-one-time-bootstrap",
  };

  await client.query("begin");
  try {
    if (outcome.ok) {
      await client.query(
        `update public.operator_accounts
            set invited_at = now(),
                invitation_delivery_failed_at = null,
                invitation_delivery_failure_reason = null,
                updated_at = now()
          where id = $1`,
        [outcome.operatorAccountId],
      );

      if (outcome.resent) {
        await insertAuditEvent(
          client,
          auditRows.invitationResent({
            personId: outcome.personId,
            operatorAccountId: outcome.operatorAccountId,
            operatingYear,
            correlationId,
            detail,
          }),
        );
      }
    } else {
      await client.query(
        `update public.operator_accounts
            set invitation_delivery_failed_at = now(),
                invitation_delivery_failure_reason = $2,
                updated_at = now()
          where id = $1`,
        [outcome.operatorAccountId, outcome.reason],
      );

      await insertAuditEvent(
        client,
        auditRows.invitationDeliveryFailed({
          personId: outcome.personId,
          operatorAccountId: outcome.operatorAccountId,
          operatingYear,
          correlationId,
          reason: outcome.reason,
          detail,
        }),
      );
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

/**
 * Applies one planned entry: every row, or none of them.
 *
 * The Auth login is created **before** the transaction opens, because it cannot
 * participate in one — see the module note — and removed again if the
 * transaction does not commit.
 *
 * @returns a record of what was created, for the caller to report
 */
export async function applyOperator(client, planned, context) {
  const { entry, person, login, role } = planned;
  const { identity, auditRows, runId, operatingYear, roleRow, correlationId } = context;

  let createdAuthUserId = null;
  if (login.action === "create") {
    createdAuthUserId = (await identity.createLogin(entry.email)).authUserId;
  }

  try {
    await client.query("begin");

    let personId = person.personId;
    let personCreated = false;
    if (person.action === "create") {
      const inserted = await client.query(
        `insert into public.people (given_name, family_name, known_as)
         values ($1, $2, $3) returning id`,
        [entry.givenName, entry.familyName, entry.knownAs],
      );
      personId = inserted.rows[0].id;
      personCreated = true;

      // A brand-new Person has no contact points and the club now knows one.
      // An *existing* Person's are deliberately left alone: re-preferring
      // somebody's address because they were given a login is an edit nobody
      // asked for, and editing a profile is outside this mission.
      await client.query(
        `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source)
         values ($1, 'email'::public.contact_point_kind, $2, true, 'founding bootstrap')`,
        [personId, entry.email],
      );
    }

    let operatorAccountId = login.operatorAccountId;
    if (login.action === "create") {
      const inserted = await client.query(
        `insert into public.operator_accounts (auth_user_id, person_id, login_email, invited_at)
         values ($1, $2, $3, now()) returning id`,
        [createdAuthUserId, personId, entry.email],
      );
      operatorAccountId = inserted.rows[0].id;

      await insertAuditEvent(
        client,
        auditRows.operatorInvited({
          personId,
          operatorAccountId,
          operatingYear,
          correlationId,
          detail: {
            bootstrap: true,
            runId,
            procedure: "scripts/production/bootstrap-founding-operators.mjs",
            requirement: "REQ-one-time-bootstrap",
            personCreated,
            roleCodes: [entry.roleCode],
          },
        }),
      );
    }

    let assignmentId = role.assignmentId;
    if (role.action === "assign") {
      const inserted = await client.query(
        `insert into public.role_assignments
           (person_id, role_id, scope, is_constitutional_office, is_single_holder_seat,
            committee_year_id, season_id, effective_from, appointed_by_person_id, note)
         values ($1, $2, $3::public.role_scope, $4, $5, $6, $7, current_date, null, $8)
         returning id`,
        [
          personId,
          roleRow.id,
          roleRow.scope,
          roleRow.is_constitutional_office,
          roleRow.is_single_holder_seat,
          operatingYear.scope === "committee_year" ? operatingYear.id : null,
          operatingYear.scope === "season" ? operatingYear.id : null,
          BOOTSTRAP_ASSIGNMENT_NOTE,
        ],
      );
      assignmentId = inserted.rows[0].id;

      await insertAuditEvent(
        client,
        auditRows.roleAssigned({
          personId,
          operatorAccountId,
          role: { id: roleRow.id, code: roleRow.code, assignmentId },
          operatingYear,
          correlationId,
          detail: {
            bootstrap: true,
            runId,
            procedure: "scripts/production/bootstrap-founding-operators.mjs",
            requirement: "REQ-one-time-bootstrap",
            personCreated,
            roleCodes: [entry.roleCode],
          },
        }),
      );
    }

    await client.query("commit");

    return { personId, operatorAccountId, assignmentId, personCreated, createdAuthUserId };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);

    // The only compensation here, and it covers exactly one thing: a login
    // created seconds ago that no operator account points at, because the
    // statement that would have pointed at it did not commit. Best effort — if
    // the removal fails too, the original failure is what a human needs to see,
    // and an error thrown from a catch block would replace it.
    if (createdAuthUserId) {
      await identity.deleteLogin(createdAuthUserId).catch(() => undefined);
    }
    throw error;
  }
}
