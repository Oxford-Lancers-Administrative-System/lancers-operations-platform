# 0008 — Relational mapping conventions for the domain schema

**Status:** Accepted · **Date:** 2026-08-10

## Context

The frozen conceptual domain model v1.2 had to become PostgreSQL. Most of the
choices involved — identifier mechanics, naming, timestamps, how a
many-to-many is normalised — are ordinary physical design that the
implementation ticket explicitly delegates. They are recorded here not because
they were difficult but because they are the kind of thing a future maintainer
would otherwise re-litigate table by table.

Two of them are not ordinary and are the real subject of this ADR: how a
"this row may only exist while its parent is in state X" rule is enforced, and
how append-only history is made genuinely append-only.

## Decision

**Ordinary conventions.** Plural `snake_case` table names. Surrogate `uuid`
primary keys defaulted with `gen_random_uuid()`, never a natural key — invariant
I1 forbids it and the club's own data proves why: display name already fails as
a join key across both workbooks. `timestamptz` for instants, `date` for
calendar dates. Effective dating as `effective_from` / `effective_to` with
half-open `[)` semantics, `null` meaning current. `updated_at` maintained by the
service layer rather than a trigger.

**State-dependent existence is enforced by a cascading composite foreign key.**
Where a child row may only exist against a parent in a particular state, the
child carries a copy of the parent's discriminator, joined by a composite
foreign key with `on update cascade`, plus a check constraint on the copy:

```sql
-- events: unique (id, status)
-- attendance_records:
foreign key (event_id, event_status) references events (id, status) on update cascade
check (event_status = 'occurred')
```

This is used for invariants P1 (an invitation requires an approved event), P5
(attendance requires an occurred event) and E6 (an invitation to a
non-soliciting event never expires).

**Overlap rules are enforced by GiST exclusion constraints** over
`daterange(effective_from, effective_to, '[)')`, requiring `btree_gist`. This
carries invariants I3, S1, S2 and the eligibility and committee-year rules.

**Append-only history is enforced by privilege.** History tables grant
`service_role` only `select, insert`. Every migration revokes from `anon`,
`authenticated` **and** `service_role` before granting back, because Supabase's
default privileges leave `truncate`, `trigger` and `references` granted on a new
table — enough to defeat the guarantee.

## Alternatives considered

- **Triggers** for state-dependent existence and for `updated_at`. Rejected:
  the architecture record is explicit that changeable workflow must not be
  buried in triggers, and a rule that is _sometimes_ a trigger is harder to
  reason about than one that is never a trigger. The composite-foreign-key
  device achieves the same guarantee declaratively.
- **Application-only enforcement**, with the database holding shape but not
  rules. Rejected: these are durable facts that must never be false, which the
  same record assigns to PostgreSQL.
- **Partial unique indexes on open-ended rows** instead of exclusion
  constraints. Simpler, but only prevents two _current_ overlaps and silently
  permits overlapping closed historical periods — which is exactly where a
  botched import would put them.
- **Composite natural keys** (person + season). Rejected under I1, and they
  propagate painfully through eight levels of child table.

## Consequences

- Correcting an event wrongly marked `occurred` requires removing its attendance
  first. This is intended: it makes the data loss explicit rather than silent.
- Three columns (`event_status`, `solicits_response`, `season_id` on
  participation tables; `scope` and `is_constitutional_office` on role
  assignments) are denormalised. Each is kept true by a cascading foreign key
  and none can drift.
- `btree_gist` is a schema dependency. It is a standard contrib extension,
  available on Supabase, installed into the `extensions` schema.
- Adding a history table is a three-line habit: create, enable RLS, grant
  `select, insert` only.
