# LAN-74 — returner intake, duplicate-candidate scenario

Makes LAN-74's duplicate check testable by hand against hosted Supabase and the
deployed container. The conventions these scripts follow are in
[`docs/pilot-data-runbook.md`](../../../docs/pilot-data-runbook.md);
[`scripts/pilot/lan-93/`](../lan-93/) is the worked example they are copied from.

## Why this scenario needs to exist at all

The duplicate check is the one part of returner intake that cannot be honestly
proved by looking at a screen: it is only interesting when there is somebody in
the database who might already be the person being entered. Hosted has no
synthetic roster, so without these rows the check runs, finds nothing, and looks
like it works.

The specific case it recreates is the one the club actually has. 26% of the
club's existing records carry a first name and nothing else (Source Data
Analysis §11.1), which is why `people.family_name` is nullable and why the
duplicate check matches on a given name alone. The scenario therefore installs
**two people who share a given name, one of them with no surname at all**.

## What it creates

Eight rows, all synthetic, all identifiable twice over — a deterministic primary
key from the block `00740074-0074-4074-8074-…` and the sentinel `PILOT-LAN-74`
in a text column.

| #   | Table                             | Deterministic id | Sentinel carried in                         |
| --- | --------------------------------- | ---------------- | ------------------------------------------- |
| 1   | `people`                          | `…0001`          | `known_as = 'PILOT-LAN-74'`                 |
| 2   | `contact_points`                  | `…0002`          | `source = 'PILOT-LAN-74'`                   |
| 3   | `people`                          | `…0003`          | `known_as = 'PILOT-LAN-74'`                 |
| 4   | `contact_points`                  | `…0004`          | `source = 'PILOT-LAN-74'`                   |
| 5   | `contact_points`                  | `…0005`          | `source = 'PILOT-LAN-74'`                   |
| 6   | `season_memberships`              | `…0006`          | its person is `…0001`                       |
| 7   | `season_membership_status_events` | `…0007`          | `actor_label = 'PILOT-LAN-74 setup script'` |
| 8   | `season_membership_status_events` | `…0008`          | `actor_label = 'PILOT-LAN-74 setup script'` |

The two candidates, and what each is for:

| Person  | Recorded as                                       | Membership in the open season | Demonstrates                                                                     |
| ------- | ------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------- |
| `…0001` | **Fenwold**, no family name                       | **Yes**, `confirmed`          | UX-11 surfacing a first-name-only record, and UX-12 refusing a second membership |
| `…0003` | **Fenwold Pilotworth**, email `…@example.invalid` | No                            | UX-11 selection succeeding, and UX-13                                            |

Contact values use `example.invalid` (reserved by RFC 2606, undeliverable) and
the `07700 900xxx` drama range (never allocated to a subscriber). Nothing here
can reach a real person.

## What it does not create, ever

**No season.** The open season belongs to the permanent pilot foundation, and
`setup.sql` asserts it rather than creating one. This is not tidiness: the
service layer's `resolveOpenSeason()` refuses when two seasons are open at once,
so a scenario that created its own would break the feature it exists to test.
Setup aborts if there is no open season, and aborts if there is more than one.

No Auth user. No `operator_accounts` row. No `role_assignments` row. No
`audit_events` row. No event, invitation or notification — nothing here can
message anybody. Durable pilot identities and access are provisioned by the
owner procedure in the pilot-data runbook and are outside every scenario's
reach, in both directions: a scenario neither creates them nor removes them.

## Testing the feature — and the one thing you must type

Sign in as an approved pilot operator and open **`/operate/roster/new`**.

1. **The duplicate check surfaces the first-name-only record.** Enter family
   name `Pilotworth`, given name `Fenwold`. Choose **Check for matches**.
   Expect UX-11 with **two** candidates: `Fenwold` (shown as having no family
   name on record, and **Already a member**) and `Fenwold Pilotworth` (**No
   membership**). Nothing has been written at this point.
2. **The membership refusal.** Select `Fenwold` — the one already a member —
   and choose **Use selected person**. Expect UX-12, naming the person and the
   open season and stating that nothing was changed. Its actions are
   **View Fenwold's roster entry** and **Go back**. Confirm on the roster that
   no second membership appeared.
3. **Selecting an existing person succeeds.** Choose **Go back**, select
   `Fenwold Pilotworth`, and **Use selected person**. Expect UX-13 and a
   membership `Confirmed`, entry `Returning`.
4. **Creating a new person.** Return to `/operate/roster/new` and enter a
   person who is genuinely new. Choose **Check for matches**, then **Confirm
   this is a new person**. Expect UX-13.

> **This applies from step 1, not only step 4.** Selecting an existing person
> in step 3 also records whatever you typed into Email and Phone against _that_
> person. A real address entered while searching in step 1 lands on scenario
> person `…0003` and makes `cleanup.sql` refuse — it will not delete a contact
> it cannot account for. Use the values below in every step.

### What to type, exactly

`cleanup.sql` can only remove this person if the values identify them, so use
these and nothing else:

| Field          | Value                                                                       |
| -------------- | --------------------------------------------------------------------------- |
| **Last name**  | `PILOT-LAN-74` — the only handle cleanup has. Case and spacing are forgiven |
| **First name** | anything clearly synthetic                                                  |
| **Email**      | any address ending `@example.invalid`                                       |
| **Phone**      | leave blank, or `07700 900123` / `+44 7700 900123` — one space, no brackets |

> **The application mints `people.id` itself**, so `cleanup.sql` cannot know it
> in advance. The last name is the only handle. A returner created without the
> sentinel has to be found and removed by hand — and nothing will tell you it is
> there, because every count in the script and every query below keys on the
> same sentinel you did not type.
>
> **The email and phone matter too.** Cleanup refuses to cascade-delete a
> contact point it cannot account for, so a real-looking address or an ordinary
> mobile number on this person will stop the whole script. `example.invalid` is
> reserved by RFC 2606 and `07700 900xxx` is Ofcom's drama range; cleanup
> recognises both and nothing else.

Step 3 also leaves a membership on person `…0003`, and step 4 leaves a person, a
membership, contact points and status history. `cleanup.sql` removes all of it —
the deletes run in dependency order (history, memberships, contacts, aliases,
then people) precisely so that step 3's membership cannot block the removal of
the person holding it.

## How Brian runs the scripts

The full sequence, the authorization boundary and the retention policy are in
[`docs/pilot-data-runbook.md`](../../../docs/pilot-data-runbook.md). In short:

1. Read `setup.sql` end to end.
2. Paste it into the Supabase SQL editor for the intended project — **check the
   project first**, the editor does not ask twice.
3. Read the first result set: it names the database, the user, and how many
   seasons are open, before a single row is written.
4. If it is not the project you meant, stop. Nothing has been committed.
5. Otherwise let it run to `commit` and read the verification result: `people` 2,
   `contact_points` 3, `season_memberships` 1,
   `season_membership_status_events` 2, and `seasons open or active` **1**.

Cleanup is the same, in reverse, and — per the retention policy — is **not** run
by default after a feature test.

## Ownership marker: sentinel only

This scenario uses **both** ownership shapes, and the second one is the
relaxation [ADR 0019](../../../docs/adr/0019-application-created-pilot-rows.md)
governs.

The eight rows `setup.sql` writes carry a deterministic identifier **and** the
sentinel, and are deleted by both. But the point of the hosted test is that a
human creates a returner _through the application_, and `people.id` comes from
`gen_random_uuid()` — so five of the deletes in `cleanup.sql` have no identifier
to key on and are qualified by the sentinel alone. Every one of them is pinned
by value in `SENTINEL_ONLY_DELETES` in
[`tests/pilot-data-contract.test.ts`](../../../tests/pilot-data-contract.test.ts).

## What the sentinel-only deletes match

Every scenario row is removed by its primary key **and** the sentinel, as the
runbook requires. The returner created through the interface in step 4 cannot
be: its id was minted by `gen_random_uuid()`. Five of the deletes in
`cleanup.sql` are therefore keyed on the sentinel alone. LAN-76 uses the same
shape, so these are not the only such deletes in the repository — which is why
ADR 0019 makes each one pinned by value rather than permitted by category.

**Exactly what it matches, because this is the paragraph to read before you run
it against production:**

```sql
'PILOT-LAN-74' in (known_as, family_name)
```

Two columns, because two kinds of row carry the marker. `setup.sql` can write
any column, so its rows carry it in `known_as` — and they have to, since person
`…0001` is deliberately first-name-only and has no surname to put it in.
Anything created through the interface carries it in `family_name`, because the
form has a Last name field and no nickname field.

**So the sweep will delete any `people` row whose surname is exactly
`PILOT-LAN-74`,** whoever created it and whenever. That is the intended
behaviour — it is how a returner from an earlier testing round gets cleaned up
too — but it is a wider net than a deterministic identifier, and it is the
reason every refusal below exists.

Both columns are part of the pinned predicate, so widening the match to a third
is an edit to `SENTINEL_ONLY_DELETES` — a line in a diff, and Brian's decision
under ADR 0019. The comparison is `upper(btrim(…))`, so a sentinel typed in the
wrong case or with a stray space still matches; without that, a typo would leave
rows behind that every count in the script reports as absent.

It is fenced by refusing outright, rather than by being narrow. `cleanup.sql`
aborts if any person it would remove has an operator account, holds or granted
a role assignment, is an actor in `audit_events` or on a membership transition,
has been merged with another record, has a recruitment prospect record, carries
a contact point the scenario cannot account for, holds a membership in a season
other than the open one, or has anything hanging off a membership. Each of those
refusals is exercised by
[`tests/pilot-scenario-lan-74.test.ts`](../../../tests/pilot-scenario-lan-74.test.ts).

The set the sweep deletes is resolved **once**, in the preflight, into a
temporary table, and every guard and every delete then uses that same set. The
Supabase SQL editor runs at READ COMMITTED, so re-deriving the sentinel match at
delete time could remove a person created through the interface _after_ the
guards ran, having passed none of them.

The general rule is
[ADR 0019](../../../docs/adr/0019-application-created-pilot-rows.md), and it is
enforced by `SENTINEL_ONLY_DELETES` in
[`tests/pilot-data-contract.test.ts`](../../../tests/pilot-data-contract.test.ts):
each sentinel-only delete is pinned **by value**, this scenario declares the
shape under the heading above, and the sentinel must be one of the pinned
conjuncts. A delete this scenario has not pinned — against `audit_events`, or
anything else — is refused because it has no entry, not because a table sits on
a deny-list.

`audit_events` is never deleted. The rows LAN-74 wrote about these people
survive cleanup by design — `audit_events` is deliberately not foreign-keyed to
its subject precisely so history outlives the row it describes (invariant M2,
review F13). After cleanup those rows name a person id that no longer resolves,
which is the intended behaviour and not a defect.

## Verification query

Re-runnable at any time, and it writes nothing:

```sql
select
  'people' as table_name,
  count(*) filter (
    where id in (
      '00740074-0074-4074-8074-000000000001',
      '00740074-0074-4074-8074-000000000003'
    )
  ) as scenario_rows
  from public.people
union all
select 'contact_points', count(*) filter (
    where id in (
      '00740074-0074-4074-8074-000000000002',
      '00740074-0074-4074-8074-000000000004',
      '00740074-0074-4074-8074-000000000005'
    )
  )
  from public.contact_points
union all
select 'season_memberships', count(*) filter (
    where id = '00740074-0074-4074-8074-000000000006'
  )
  from public.season_memberships
union all
select 'season_membership_status_events', count(*) filter (
    where id in (
      '00740074-0074-4074-8074-000000000007',
      '00740074-0074-4074-8074-000000000008'
    )
  )
  from public.season_membership_status_events
union all
select 'seasons open or active', count(*) filter (where status in ('open', 'active'))
  from public.seasons;
```

After setup: 2, 3, 1, 2, 1. After cleanup: 0, 0, 0, 0, 1 — the season is the
foundation's and is never removed.

To find anything left behind by an interface-created returner:

```sql
select id, given_name, family_name, known_as, created_at
  from public.people
 where 'PILOT-LAN-74' in (known_as, family_name);
```

Scenario rows carry the sentinel in `known_as`; anything created through the
interface carries it in `family_name`, because the form has no nickname field.
The query matches either.
