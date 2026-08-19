# 0028 — The role catalogue is read-only reference data for the application

**Status:** Accepted · **Date:** 2026-08-19 · **Refines:** [0010](0010-domain-table-access-posture.md)

## Context

ADR 0010 sets one default for every mutable domain table: revoke everything from
`anon`, `authenticated` and `service_role`, then grant `service_role`
`select, insert, update, delete` — with a single narrower case, the seven
append-only history tables, which get `select, insert`.

LAN-128 (mission `M-OPERATOR-ADMIN-WITHOUT-SQL`, `WP-schema`) moved the approved
twenty-role catalogue out of the local seed script and into two migrations, so
that hosted Supabase would have the rows at all. In the same change it tightened
the application role's access to the three catalogue tables:

```sql
revoke all on table public.role_groups from anon, authenticated, service_role;
grant select on table public.role_groups to service_role;

revoke insert, update, delete on table public.roles, public.role_aliases
  from service_role;
```

`public.roles`, `public.role_aliases` and `public.role_groups` therefore hold
`select` for `service_role` and nothing else. That is narrower than ADR 0010's
stated default, and ADR 0010 is what the next author of a migration reads.
Leaving the two unreconciled makes the older document quietly misleading: a
future migration that touched one of these tables and followed ADR 0010 to the
letter would grant write access back, and nothing would object.

Two facts make it worth recording rather than merely noticing.

**The tightening enforces a decision, not a precaution.** `DEC-no-runtime-role-editing`
is locked: "the role catalogue and capability map are read-only in the
application. Changing a role or grant remains a separately reviewed owner
decision and code change." `REQ-static-role-catalogue` says the catalogue
"cannot be edited in the application". `REQ-role-definition-and-permission-boundary`
says administrators "cannot create roles or edit grants in the application". The
grant is those three sentences expressed where a defect cannot argue with them:
Operator Administration is now being built directly on top of these tables, and
a bug in an administration service must not be able to rename a seat or invent
one.

**Almost nothing would catch it if it regressed.** `tests/schema-security.test.ts`
is the suite whose name suggests it would, and it does not: it asserts that
`anon` and `authenticated` hold nothing anywhere, and that `service_role` can
read `public.people` and one view. It never enumerates `service_role`'s
privileges per table, and full CRUD on `roles` was that suite's implicit
baseline for the whole life of the schema. The only thing pinning the tightening
today is one assertion in `tests/role-catalogue.test.ts` — "grants the
application role SELECT and nothing else" — which reads
`information_schema.role_table_grants` for exactly these three tables.

## Decision

- **ADR 0010 is refined, not superseded.** Deny-by-default is unchanged, the
  per-table revoke-then-grant habit is unchanged, `security_invoker` on views is
  unchanged, and RLS on every table is unchanged. What changes is that ADR 0010's
  `select, insert, update, delete` is the default for _mutable_ tables, and the
  role catalogue is not one.

- **`public.roles`, `public.role_aliases` and `public.role_groups` are
  reference data.** `service_role` holds `select` on all three and no write
  privilege of any kind. They join the append-only history tables as a named
  exception to the default, for a different reason: history is append-only
  because the past does not change, and the catalogue is read-only because
  changing it is an owner decision that reaches the database through a reviewed
  migration.

- **A future migration touching these three tables must not re-grant write
  access to `service_role`.** Doing so needs a superseding ADR and Brian's
  agreement, exactly as ADR 0010 requires for exposing a domain table to the
  browser. This is the constraint the document exists to record.

- **The owner's route is unaffected.** Migrations and the owner-run bootstrap
  reach the database as the owner, not as `service_role`, so nothing here stands
  between Brian and a reviewed catalogue change. Adding a role remains a
  migration; changing what a role may do remains an edit to
  `src/lib/auth/capabilities.ts`.

## Consequences

- Any application code that tries to write the catalogue fails at the database
  rather than succeeding quietly, which is what makes
  `DEC-no-runtime-role-editing` enforceable instead of merely stated. Operator
  Administration reads `public.roles`; it has no path that writes it.

- **The gap is recorded rather than closed here.** `tests/schema-security.test.ts`
  still does not enumerate `service_role`'s per-table privileges, so widening
  the grant on these three tables fails only `tests/role-catalogue.test.ts`. One
  test is enough to catch it and is one deletion away from not being. Extending
  the security suite to assert the whole per-table grant matrix is worth doing
  and belongs to whoever next changes that suite; it is deliberately not folded
  into an authorization package that owns no migration.

- The catalogue tables now have two independent reasons to be unwritable — this
  grant, and the absence of any code that writes them. Losing one is survivable;
  the point of writing it down is that losing both silently is not.
