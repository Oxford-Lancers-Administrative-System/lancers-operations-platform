# LAN-79 — the no-login RSVP page

Hand-run pilot scenario for the player's own RSVP: UX-60, UX-61, UX-62, the
uniform terminal response (UX-63/64/65) and the cancelled event (UX-66), all at
`/rsvp/[token]`.

Read [`docs/pilot-data-runbook.md`](../../../docs/pilot-data-runbook.md) first.
Nothing here is run by a migration, a seed, CI, a deploy or the application.

## What this scenario is for

To let you answer a real RSVP link against the deployed application — the only
unauthenticated page in the slice — and to see each way a link can stop working,
without anything reaching a person.

It creates five synthetic invitees across three synthetic events. The names
below are what the page shows: the display alias carries the sentinel and the page
prefers it, so the sentinel is part of the name rather than hidden behind it.

| Link | Invitee                | Event                           | What it demonstrates                                        |
| ---- | ---------------------- | ------------------------------- | ----------------------------------------------------------- |
| 1    | PILOT-LAN-79 Valid     | PILOT-LAN-79 Response scenario  | The ordinary case: answer, change it, answer again          |
| 2    | PILOT-LAN-79 Late      | PILOT-LAN-79 Response scenario  | Deadline passed, invitation `expired` — a late answer works |
| 3    | PILOT-LAN-79 Revoked   | PILOT-LAN-79 Response scenario  | A withdrawn link — the uniform terminal response            |
| 4    | PILOT-LAN-79 Started   | PILOT-LAN-79 Started scenario   | The event began — no write, same terminal response          |
| 5    | PILOT-LAN-79 Cancelled | PILOT-LAN-79 Cancelled scenario | A valid link to a cancelled event (UX-66)                   |

Links 1, 2 and 3 are three invitees of **one** event, which is what makes the
privacy check meaningful: each must show its own holder and no one else.

## Before you run setup: generate five links

An RSVP link is a 256-bit secret and the database stores only its SHA-256
digest. Nothing can recover a link from a digest — that is LAN-78's design and
it is not worked around here. So `setup.sql` ships with five placeholders and
you generate the secrets yourself.

Run this once, in your own terminal, and keep the output somewhere you can read
it while you test:

```
node -e "const c=require('crypto');for(let i=1;i<=5;i++){const t=c.randomBytes(32).toString('base64url');console.log(i, t, c.createHash('sha256').update(t).digest('hex'))}"
```

It prints five lines of `number token hash`, using exactly the algorithm
`src/lib/services/rsvp-tokens.ts` uses. In `setup.sql`, replace each
`__TOKEN_HASH_n__` with the matching **hash**. They sit together in one block
immediately below `begin;`, and each appears exactly once, so there is no second
copy to miss. Keep the **tokens** — they are the links. Visit
`https://<the deployed host>/rsvp/<token>`.

The tokens never go into this repository, into Linear, into Notion, or into any
log. Throw them away when you have finished; the rows are removed by
`cleanup.sql` either way.

A placeholder you forget cannot reach the database: `setup.sql` refuses to run,
and `rsvp_access_tokens.token_hash` would refuse it again.

## The matrix

Work through it in order. Every row is a thing the issue's acceptance criteria
name.

1. **Link 1 — the invitation.** The page shows the event, its date and time, the
   venue, your name, the response deadline and "No response". It shows no other
   player and no counts.
2. **Link 1 — Attending in one tap.** Press **I'm attending**. The page confirms
   the answer is saved and says you can change it until the event starts.
3. **Link 1 — a reason is required.** Press **Change response**, then **I'm not
   attending**, then **Save Not attending** with the Reason box empty. The
   browser refuses to submit. Type a reason and save; it is accepted.
4. **Link 1 — the previous answer survives.** Ask for the response history (the
   query below). Both answers are there, newest last. Nothing was overwritten.
5. **Link 2 — a late answer is still an answer.** Its deadline passed two days
   ago and its invitation is `expired`. Answer anyway. It is accepted, and the
   invitation becomes `responded`.
6. **Link 3 — a withdrawn link.** "This RSVP link can't be used", `404`, and
   nothing about the event, the player or why.
7. **Link 4 — the event has started.** Exactly the same page as link 3. That is
   the point: you cannot tell the two apart, and neither can anybody else.
8. **A link that never existed.** Change a few characters of any token. Again
   the same page.
9. **Link 5 — a cancelled event.** "This event has been cancelled", naming the
   event and its date, with no way to answer.

### Verification queries

Run these in the SQL editor after step 5.

```sql
-- Every answer this scenario has recorded, newest last.
select e.name,
       (select da.alias from public.person_aliases da
          where da.person_id = p.id and da.is_display_name limit 1) as display_alias,
       r.response, r.reason, r.source, r.responded_at
  from public.rsvp_responses r
  join public.invitations i on i.id = r.invitation_id
  join public.events e on e.id = i.event_id
  join public.season_memberships m on m.id = i.season_membership_id
  join public.people p on p.id = m.person_id
 where e.name like 'PILOT-LAN-79%'
 order by r.responded_at;

-- Where each invitation ended up. Links 1 and 2 must read `responded`.
select (select da.alias from public.person_aliases da
          where da.person_id = p.id and da.is_display_name limit 1) as display_alias,
       i.status, i.expires_at
  from public.invitations i
  join public.season_memberships m on m.id = i.season_membership_id
  join public.people p on p.id = m.person_id
  join public.events e on e.id = i.event_id
 where e.name like 'PILOT-LAN-79%'
 order by display_alias;
```

Expected after the matrix: every response carries `source = 'signed_link'`;
link 1 has two rows and link 2 has one; links 1 and 2 are `responded`; links 3,
4 and 5 have no response at all.

## Ownership marker: sentinel only

Three of this scenario's cleanup statements delete rows the **application**
created — the RSVP responses you give through the page, the audit rows those
write, and any notification job the response path cancelled. PostgreSQL
generated their identifiers inside a transaction no script took part in, so no
deterministic key exists to delete by.

Those three use the sentinel-only shape permitted by
[ADR 0019](../../../docs/adr/0019-application-created-pilot-rows.md). Each is
pinned literally in `tests/pilot-data-contract.test.ts`, and each is doubly
qualified — the scenario's own event identifiers **and** the `PILOT-LAN-79`
sentinel in `events.name`. The other twenty-three rows, which `setup.sql` wrote,
are deleted by their own deterministic identifiers instead.

This is a genuine relaxation of an ownership rule against the one production
database, and it is Brian's decision, taken in the pull request that adds this
scenario.

## Can this send anything to a real person?

**No**, and by a stronger argument than LAN-78's. This scenario creates no
notification job and no delivery work of any kind, so nothing is ever queued to
be sent. Its five people have **no contact point at all** — not a reserved
number, not an unroutable address, nothing — because a scenario that never
sends does not need one, and a number it does not need is a number that could
be dialled by mistake.

The links reach you because you generated them in your own terminal.

## Cleanup

Run `cleanup.sql` once the matrix is accepted. It removes the five people, five
memberships, three events, five audience rows, five invitations, five tokens,
and every response and audit row those acquired. It touches no season, no
operator, no role assignment and no record belonging to anybody else. Its final
result set must show zeroes.

Running it twice is safe and removes nothing the second time.
