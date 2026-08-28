# LAN-78 — secure RSVP links and automated delivery

Hand-run pilot scenario for the delivery surface: UX-50, UX-51 and UX-52 at
`/operate/events/[id]/delivery`.

Read [`docs/pilot-data-runbook.md`](../../../docs/pilot-data-runbook.md) first.
Nothing here is run by a migration, a seed, CI, a deploy or the application.

## What this scenario is for

To let you see the five provider-neutral delivery states against real rows, and
to exercise the two repair controls, without anything reaching a person.

It creates three synthetic invitees on one approved event, each sitting in a
different state. The names below are what the screen shows — the display alias carries
the sentinel and is what both the delivery read model and the dispatcher
display, so the sentinel is part of the name rather than hidden behind it:

| Invitee                         | State         | Why it is in that state                       |
| ------------------------------- | ------------- | --------------------------------------------- |
| PILOT-LAN-78 Delivery Queued    | **Queued**    | pending, never attempted                      |
| PILOT-LAN-78 Delivery Retryable | **Retryable** | one failed attempt, four remaining, transient |
| PILOT-LAN-78 Delivery Failed    | **Failed**    | terminal refusal, attempt ceiling reached     |

**Delivered** and **Attempted** are deliberately absent, and cannot be
manufactured: both require the provider to have accepted a message, and a script
cannot make Meta do that. Reaching them means pressing **Retry delivery** on a
deployment where WhatsApp is configured.

## Ownership marker: sentinel only

Six of this scenario's cleanup statements delete rows the **application**
created — the RSVP access tokens a retry mints, the further delivery attempts
and results it produces, the callbacks Meta sends, and the audit rows both
write. PostgreSQL generated their identifiers inside a transaction no script
took part in, so no deterministic key exists to delete by.

Those six use the sentinel-only shape permitted by
[ADR 0019](../../../docs/adr/0019-application-created-pilot-rows.md). Each is
pinned literally in `tests/pilot-data-contract.test.ts`, and each is doubly
qualified — the scenario's own event identifier **and** the `PILOT-LAN-78`
sentinel in `events.name`. Everything setup.sql wrote is deleted by its own
deterministic key instead.

This is a genuine relaxation of an ownership rule against the one production
database, and it is Brian's decision, taken in the pull request that adds this
scenario.

## Can this send anything to a real person?

**No.** Two independent reasons, and both hold:

- All three recipients carry numbers from Ofcom's reserved `07700 900xxx` drama
  range, which is never allocated to anybody. A fully configured deployment
  attempting these reaches no one.
- On a deployment where WhatsApp is not configured, an attempt is recorded as
  failed with the **names** of the missing settings and nothing leaves the
  building.

Setup itself sends nothing at all. It creates no deliverable work: dispatch
happens at approval, and this event arrives already approved.

## Do not leave this installed in a local database that runs the test suite

Hosted is unaffected, and this is worth knowing anyway because it cost an hour.

`scripts/seed-local.mjs` stamps its people with a **future** `created_at`, so
this scenario's three people become the oldest rows in `public.people`.
`src/lib/services/roster.test.ts` resolves its acting operator as "the oldest
person", adopts one of them, and writes an audit row naming a scenario person as
the actor — at which point `cleanup.sql` correctly refuses to delete a person who
appears in audit history, and the scenario cannot be removed without deleting
that row by hand.

On hosted this cannot happen. The scenario's people have no operator account and
no auth user, so nothing can ever act as them, and no test suite runs there. The
scripts are therefore left truthful — `created_at` is the time the rows were
really created — rather than distorted to suit a local test.

If you do install it locally, run `cleanup.sql` before `npm run test`.
`tests/pilot-scenario-lan-78.test.ts` installs and rolls back its own copy and is
unaffected either way.

## Order of operations

1. Confirm you are connected to the intended database, as the intended user.
2. Run `setup.sql`. **Read the first result set before committing** — it names
   the database, the user, and what is already present.
3. Confirm you hold President, Vice-President, Secretary or General Manager. The
   delivery screen is refused to every other role, and this script grants
   nothing.
4. Work through the matrix below.
5. Run `cleanup.sql`. **Read its first result set before committing** too.

## The matrix

| #   | Do this                                                               | Expect                                                                                                                                                  |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Open the event, then **Delivery**                                     | UX-50: Audience 3, Delivered 0, Queued 1, Failed 2                                                                                                      |
| 2   | Read the standing note                                                | "Operators never copy, send or post invitations manually. Delivery telemetry does not imply an RSVP."                                                   |
| 3   | **View diagnostics**                                                  | UX-51: three invitees, one per state, each with its channel and last attempt                                                                            |
| 4   | Filter to **Needs attention**                                         | Only Retryable and Failed remain                                                                                                                        |
| 5   | Search `Retryable`                                                    | The list narrows to one row as you type, with no Enter needed                                                                                           |
| 6   | **Open selected issue** on the Retryable invitee                      | UX-52: Latest result **Retryable**, Retry **1 attempt of 5 used**, Token **Not yet issued**                                                             |
| 7   | Read the reason shown                                                 | A plain sentence. No phone number, no provider body, no raw error                                                                                       |
| 8   | **Retry delivery**                                                    | An attempt is made. Unconfigured: fails naming the missing settings. Configured: the provider refuses the drama-range number                            |
| 9   | **Open selected issue** on the Failed invitee                         | Retry is shown **disabled**, with a note that somebody has to fix the cause first                                                                       |
| 9b  | **Revoke and reissue link** on the Retryable invitee, giving a reason | The old link is withdrawn and a replacement is sent. Where WhatsApp is not configured you are told plainly that this person now has **no working link** |
| 10  | Look for any way to hand this off yourself                            | There is none. The screen offers exactly two controls, and both are auditable system actions                                                            |
| 11  | Check the RSVP column                                                 | Independent of delivery state. Delivered never means responded                                                                                          |
| 12  | Repeat at 375px                                                       | Cards rather than a table; every state and both actions still reachable                                                                                 |

Sign in as an operator **without** one of the four roles and open the same
route: the screen is refused and no delivery data appears in the response.

## Verifying by hand

```sql
-- Everything this scenario owns, and what state it is in.
select j.id,
       p.family_name as invitee,
       j.status,
       j.attempt_count,
       j.last_error,
       (select count(*) from public.delivery_attempts a
         where a.notification_job_id = j.id) as attempts,
       (select count(*) from public.rsvp_access_tokens t
         where t.invitation_id = j.invitation_id
           and t.revoked_at is null and t.superseded_at is null) as live_tokens
  from public.notification_jobs j
  join public.invitations i on i.id = j.invitation_id
  join public.season_memberships m on m.id = i.season_membership_id
  join public.people p on p.id = m.person_id
 where j.event_id = '00780078-0078-4078-8078-000000000050'
 order by p.family_name;

-- No plaintext token is stored anywhere. Every hash is 64 hex characters.
select count(*) filter (where token_hash ~ '^[0-9a-f]{64}$') as hashed,
       count(*) as total
  from public.rsvp_access_tokens
 where invitation_id in (select id from public.invitations
                          where event_id = '00780078-0078-4078-8078-000000000050');
```

## What Brian has to do, and what no agent may do

**Yours:** run both scripts, hold one of the four roles, and decide when the
scenario is finished with.

**Never an agent's:** running either script against hosted Supabase, creating or
inviting a hosted Auth user, granting or end-dating access, configuring Meta
assets, or sending to a real player.
