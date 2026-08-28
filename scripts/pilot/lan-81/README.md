# LAN-81 — the Monday exception and action report

Two SQL files, run **by hand**, against hosted Supabase, by Brian and nobody
else. Nothing in this repository runs them: not a migration, not the seed, not
CI, not the deploy, not the application.

- `setup.sql` — installs the scenario.
- `cleanup.sql` — removes it again, and only it.

Read `docs/pilot-data-runbook.md` first if you have not run one of these before.
`tests/pilot-scenario-lan-81.test.ts` proves both files against the **local**
stack, so their behaviour is checked before either goes near production.

## Before you start: this scenario needs a migration

`supabase/migrations/20260814200000_mismatch_view_sees_walk_ups.sql` must be
applied to hosted first, and applying it is a deliberate human action —
`docs/migration-runbook.md`. It corrects `public.rsvp_attendance_mismatches` so
that a walk-up is reported at all; without it, one row of the matrix below is
simply missing and the rest is still correct. `setup.sql` refuses to install
until the migration is there, so you cannot get a half-right rehearsal by
accident.

## What this scenario is for

The Monday report answers one question — what went wrong last week that somebody
has to do something about — and its whole value is that the answer is **frozen**.
Generate it twice and you get two versions; the first is unchanged, byte for
byte, forever.

So this scenario gives you a complete synthetic week that has already happened,
with one instance of every exception the report leads with. You then generate,
read, change nothing, generate again, and check that the first snapshot is
exactly where you left it.

Everything is synthetic. No person, event, answer, reason or venue here
corresponds to anybody real, and the scenario creates no contact point, no
notification job and no delivery work of any kind — so it can send nothing to
anybody, ever.

## The reporting date, and where to find it

The report's window is the seven days ending the day before the reporting date.
This scenario puts its events in a week **four weeks ago** — `current_date - 28`
is the date to report on — and both of `setup.sql`'s result sets print that date
as `reporting_date`. **Read it off the script rather than working it out**, and
type it into the reporting-date field on `/operate/report`.

Four weeks back rather than the week just gone, because the window has to belong
to this scenario alone and the recent past is where real operational events
actually are. `setup.sql` refuses to install if any event that is not this
scenario's already sits in the window. That is not fussiness: a real event would
make the numbers below wrong, and `cleanup.sql` identifies the snapshots you
generate by the sentinel inside their stored content, which is only unambiguous
while the whole window is this scenario's.

## What setup installs

| Row                    | Count | Sentinel carried in                  |
| ---------------------- | ----- | ------------------------------------ |
| People                 | 6     | its display alias                    |
| Season memberships     | 6     | (parent chain)                       |
| Events                 | 3     | `name`                               |
| Event audience members | 6     | (parent chain)                       |
| Invitations            | 5     | (parent chain)                       |
| RSVP responses         | 2     | `reason`, on the one negative answer |
| Attendance records     | 2     | (parent chain)                       |

The three events:

| Event                                  | When                | Status     | Solicits a response |
| -------------------------------------- | ------------------- | ---------- | ------------------- |
| `PILOT-LAN-81 Reporting week practice` | `current_date - 32` | `occurred` | yes                 |
| `PILOT-LAN-81 Empty register session`  | `current_date - 31` | `occurred` | yes                 |
| `PILOT-LAN-81 Committee briefing`      | `current_date - 34` | `approved` | **no**              |

The six people, and which section of the report each one produces:

| Person                                     | Set up as                               | Where they appear          |
| ------------------------------------------ | --------------------------------------- | -------------------------- |
| `PILOT-LAN-81 Said yes, marked absent`     | Answered Attending, recorded **Absent** | RSVP/attendance mismatches |
| `PILOT-LAN-81 Said no, with a reason`      | Answered Not attending, with a reason   | Not attending              |
| `PILOT-LAN-81 Never answered`              | Asked, deadline passed, no answer       | Nonresponses               |
| `PILOT-LAN-81 Confirmed but never invited` | In the audience, no invitation          | Uninvited audience defects |
| `PILOT-LAN-81 Turned up uninvited`         | Recorded **Present**, no invitation     | RSVP/attendance mismatches |
| `PILOT-LAN-81 Briefing audience only`      | Invited to the non-soliciting briefing  | **nowhere** — invariant E6 |

The last one is the only person here you verify by their **absence**. Invariant
E6 keeps a non-soliciting event's invitations out of the response stream
entirely, so they must appear in no response breakdown and in no nonresponse
queue, however hard you look.

## The matrix

Sign in as yourself. LAN-81 requires President, Vice-President, Secretary or
General Manager; the durable pilot foundation gave you the roles.

| #   | Do this                                                                   | Expect                                                                                                                                             |
| --- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Open `/operate/report`, set the reporting date to the one setup printed   | **No stored report for this date**, and the sentence that an absent snapshot is not an all-clear                                                   |
| 2   | Press **Preview report**                                                  | That date, the seven days it covers, and four tiles: 2 nonresponses, 1 not attending, 2 mismatches, 2 missing attendance                           |
| 3   | Read the six numbered cards                                               | 1 Nonresponses · 2 Not attending · 3 RSVP / attendance mismatches · 4 Absences / missing attendance · 5 Onboarding exceptions · 6 Audience defects |
| 4   | Read card 6                                                               | 1 approval defect, labelled **Approved but never invited — requires review**, and never as a chase                                                 |
| 5   | Read **Availability by level**                                            | Three counts and the words **No narrative or diagnosis**. No note, no reason, no injury anywhere                                                   |
| 6   | Press **Generate report**                                                 | The stored report opens: **v2**? No — **v1**, `LAN-81.1`, generated by you, with a data-as-of stamp                                                |
| 7   | Open **Not attending** → **Open stored list**                             | The one declining person, and their reason. This is the most sensitive line in the slice                                                           |
| 8   | Open **RSVP / attendance mismatches** → **Open stored list**              | Two: **Attending but absent**, and **Turned up without an invitation**                                                                             |
| 9   | Open **Absences / missing attendance** → **Open stored list**             | One absence, and `PILOT-LAN-81 Empty register session` flagged as a register nobody completed                                                      |
| 10  | Press **Preview report**, then **Generate report** again                  | The stored report now says **v2**                                                                                                                  |
| 11  | Press **View report versions**                                            | Two rows: v2 **Current** superseding **v1**, v1 **Superseded** superseding **—**, each with its own stamps                                         |
| 12  | Run the first verification query below                                    | v1's content is byte for byte what it was, and its `generated_at` has not moved                                                                    |
| 13  | Sign out, sign in as somebody with no report role, open `/operate/report` | **You do not have access to this action**, and not one name, count or reason in the page                                                           |

Step 6 is the one to read carefully. It is **v1**, because nothing was generated
before it — and step 10 is where 2 appears. If you see v2 at step 6, a previous
run of this scenario was not cleaned up, and `setup.sql` should have refused.

### Verification queries

Run these in the SQL editor. They read; they change nothing.

```sql
-- 1. Version 1 is untouched by version 2's existence.
--    Run once at step 6 and again at step 12; both columns must be identical.
select version,
       md5(content::text) as content_digest,
       generated_at,
       data_as_of,
       supersedes_id
  from public.weekly_reports
 where content::text like '%PILOT-LAN-81%'
 order by version;

-- 2. Every section came from the view that owns it.
select
  (select count(*) from public.nonresponse_queue
    where scheduled_on between current_date - 35 and current_date - 29) as nonresponses,
  (select count(*) from public.invitation_response_state s
     join public.events e on e.id = s.event_id
    where e.scheduled_on between current_date - 35 and current_date - 29
      and s.response_state = 'responded_no') as not_attending,
  (select count(*) from public.rsvp_attendance_mismatches
    where scheduled_on between current_date - 35 and current_date - 29) as mismatches,
  (select count(*) from public.uninvited_audience_members
    where scheduled_on between current_date - 35 and current_date - 29) as approval_defects;

-- 3. Invariant E6. The briefing solicits nothing, so this must be zero —
--    even though it has an audience and an invitation.
select count(*) as must_be_zero
  from public.invitation_response_state
 where event_id = '00810081-0081-4081-8081-000000000023';

-- 4. The walk-up mismatch the corrected view now emits. Before the migration
--    this was zero for every event that had any invitations at all.
select mismatch, count(*)
  from public.rsvp_attendance_mismatches
 where scheduled_on between current_date - 35 and current_date - 29
 group by mismatch;
```

## Ownership marker: sentinel only

Three of this scenario's deletes cannot be keyed on a deterministic identifier,
because the rows were created by the **application** rather than by `setup.sql`:

| Table                   | Created by                                                   |
| ----------------------- | ------------------------------------------------------------ |
| `public.weekly_reports` | every press of **Generate report**                           |
| `public.audit_events`   | the generation itself, and this scenario's own event history |

Each delete is doubly qualified — the open season or this scenario's own event
identifiers, **and** the `PILOT-LAN-81` sentinel — and each predicate is pinned
literally in `tests/pilot-data-contract.test.ts`, so widening one is a line in a
diff. `docs/adr/0019-application-created-pilot-rows.md` records the rule.

**The one thing this asks of you.** Generate only for the date `setup.sql`
printed. If `cleanup.sql` meets a weekly report filed anywhere in this scenario's
date range whose content does not carry the sentinel, it **aborts** rather than
guess — that row might be real leadership history, and deleting a real snapshot
to tidy up a test is the outcome the whole ownership rule exists to prevent.

## Can this send anything to a real person?

No. The scenario creates no notification job, no delivery result and no RSVP
access token, and its six people have no contact point to send to. The report
itself is read on a screen: nothing in this slice emails, exports or distributes
one, which is explicitly out of LAN-81's scope.

## Cleanup

Run `cleanup.sql`. It removes this scenario's rows and nothing else: the open
season, the durable pilot identities, every access grant and all unrelated audit
history are untouched. It is safe to run twice, and its final result set must
show three zeroes and the open season still there.

It has to be run within about a month of `setup.sql`, because its guard and its
report delete are bounded to this scenario's own date range. Leaving a scenario
installed for longer than that is outside what either script is built for.

If it aborts, read the message — every guard in it names what is in the way and
what to do about it. None of them is safe to work around by editing the script.
