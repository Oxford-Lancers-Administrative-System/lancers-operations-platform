# LAN-80 — the occurrence assertion and attendance

Two SQL files, run **by hand**, against hosted Supabase, by Brian and nobody
else. Nothing in this repository runs them: not a migration, not the seed, not
CI, not the deploy, not the application.

- `setup.sql` — installs the scenario.
- `cleanup.sql` — removes it again, and only it.

Read `docs/pilot-data-runbook.md` first if you have not run one of these before.
`tests/pilot-scenario-lan-80.test.ts` proves both files against the **local**
stack, so their behaviour is checked before either goes near production.

## What this scenario is for

LAN-80 puts two decisions in front of an operator and one screen behind them.

The decisions are **Mark occurred** and **Mark not held**, and the whole point
of invariant E5 is that neither is ever inferred: a date passing does not mean a
practice happened, and only a person can say that it did. So this scenario gives
you two events that are already in the past and still `approved`, waiting for
somebody to say what happened to each.

The screen behind them is attendance, which opens only for the event you marked
occurred. What makes it worth testing by hand rather than only in the suite is
the RSVP contrast: four invitees, three answers, and every one of the club's
mismatches one press apart.

Everything is synthetic. No person, event, answer or venue here corresponds to
anybody real, and the scenario creates no contact point, no notification job and
no delivery work of any kind — so it can send nothing to anybody, ever.

## What setup installs

| Row                    | Count | Sentinel carried in                  |
| ---------------------- | ----- | ------------------------------------ |
| People                 | 5     | `known_as`                           |
| Season memberships     | 5     | (parent chain)                       |
| Events                 | 2     | `name`                               |
| Event audience members | 5     | (parent chain)                       |
| Invitations            | 5     | (parent chain)                       |
| RSVP responses         | 3     | `reason`, on the one negative answer |

The two events:

| Event                              | When       | Status     | Invitees |
| ---------------------------------- | ---------- | ---------- | -------- |
| `PILOT-LAN-80 Occurrence scenario` | 3 days ago | `approved` | 4        |
| `PILOT-LAN-80 Not-held scenario`   | 4 days ago | `approved` | 1        |

The four invitees on the occurrence event, and what each is for:

| Person                                  | Standing RSVP | What to do with them        | Resulting mismatch                |
| --------------------------------------- | ------------- | --------------------------- | --------------------------------- |
| `PILOT-LAN-80 Said yes, mark absent`    | Attending     | Mark **Absent**             | `said_yes_marked_absent`          |
| `PILOT-LAN-80 Said no, mark present`    | Not attending | Mark **Present**            | `said_no_but_attended`            |
| `PILOT-LAN-80 Said yes, leave unmarked` | Attending     | Leave alone                 | `said_yes_no_attendance_recorded` |
| `PILOT-LAN-80 No response`              | No response   | Mark **Late**, then correct | none — this one is the correction |

The fifth person, `PILOT-LAN-80 Uninvited roster match`, is invited to the
**not-held** event and to nothing else. On the occurrence event they are
uninvited, which is what puts them under **Possible roster match** on the
walk-up form.

## The matrix

Sign in as yourself. You hold the President, Vice-President, Secretary or
General Manager role through the durable pilot foundation, which is what the
occurrence assertion requires.

1. **Attendance is closed before the assertion.** Open the occurrence event, and
   from it go to `/operate/events/<id>/attendance` directly in the address bar.
   Expect **Attendance is not available yet**, no names, and no way to record
   anything. This is UX-71 and it is the refusal invariant P5 exists for.
2. **The decision is offered, and is a decision.** On the event, expect **Confirm
   what happened**, both buttons, and the three facts beside them — including
   **Start time has passed**, which is displayed and is not a condition.
3. **Mark not held.** Do this on the _not-held_ event. Expect **Event marked not
   held**, the note that attendance remains unavailable, and no route through to
   a board. Visit its attendance URL directly: still closed, permanently.
4. **Mark occurred.** Do this on the _occurrence_ event. Expect a route through
   to **Attendance · PILOT-LAN-80 Occurrence scenario**.
5. **Record the four states.** Work through the table above. Each press should
   show `Saving…` and then `Saved · <your name> · <time>`. Do this at phone
   width — this is recorded at the side of a pitch, and 375px is the size that
   matters.
6. **Correct one.** Press a different state for `PILOT-LAN-80 No response`. The
   committed line must change to the new value and the new time. Nothing on
   screen should suggest the earlier value was lost; it is in the audit trail.
7. **Walk-up, roster match.** **Add walk-up**, choose `PILOT-LAN-80 Uninvited
roster match` under **Possible roster match**, mark them Present. Expect the
   row to appear flagged **Walk-up · to reconcile**, and no membership, no
   onboarding and no recruitment record to have been created.
8. **Walk-up, not on the roster.** **Add walk-up** again, and type the name
   **`PILOT-LAN-80 Devon Skye`** — the sentinel first, which is what lets
   cleanup find them. Leave **Possible roster match** as **None selected**. Mark
   them Present. Expect the same flag, and the note that this creates no
   membership.
9. **The mismatches are shown and nothing is reconciled.** Read the counts at
   the top of the board. Nothing you did should have changed anybody's RSVP.
10. **The reason is not on this screen.** `PILOT-LAN-80 Said no, mark present`
    gave a reason when they declined. It must appear nowhere on the attendance
    board — not in the row, not in a tooltip, not in the page source.

### Verification queries

Run these against hosted after the matrix, before cleanup.

```sql
-- What was asserted, by whom, and when. Both events, one row each.
select name, status, outcome_recorded_at, outcome_recorded_by_person_id
  from public.events where name like 'PILOT-LAN-80%' order by name;

-- The attendance you recorded, with its anchor and its recorder.
select p.known_as, a.capacity, a.presence, a.recorded_at, a.recorded_by_person_id
  from public.attendance_records a
  join public.events e on e.id = a.event_id
  left join public.season_memberships m on m.id = a.season_membership_id
  left join public.people p on p.id = coalesce(a.person_id, m.person_id)
 where e.name like 'PILOT-LAN-80%'
 order by a.recorded_at;

-- The mismatches, computed by the club's own view and reconciled by nothing.
select mismatch, count(*) from public.rsvp_attendance_mismatches
 where event_id in (select id from public.events where name like 'PILOT-LAN-80%')
 group by mismatch order by mismatch;

-- Every audited assertion and attendance write for this scenario.
select action, from_state, to_state, actor_person_id, occurred_at
  from public.audit_events
 where entity_id in (select id from public.events where name like 'PILOT-LAN-80%')
    or entity_id in (select a.id from public.attendance_records a
                       join public.events e on e.id = a.event_id
                      where e.name like 'PILOT-LAN-80%')
 order by occurred_at;
```

**A known gap, and what you will see because of it.** The mismatch query above
will **not** return `attended_without_invitation` for either walk-up, and that
is not a fault in this scenario. `public.rsvp_attendance_mismatches` defines
that classification and cannot emit it for any event that has at least one
invitation, which is every approved event. The board still flags both walk-ups,
because it derives the flag from the absence of an invitation rather than from
the view. Correcting the view is a migration against the domain baseline and is
your decision — LAN-80's pull request reports it and does not author one.

## Ownership marker: sentinel only

Five of this scenario's deletes cannot be keyed on a deterministic identifier,
because the rows were created by the **application** rather than by `setup.sql`:

| Table                       | Created by                                           |
| --------------------------- | ---------------------------------------------------- |
| `public.audit_events`       | the occurrence assertion, and every attendance write |
| `public.attendance_records` | every attendance press and every walk-up             |
| `public.contact_points`     | a contact typed into the walk-up form                |
| `public.people`             | a walk-up who is not on the roster                   |

Each delete is doubly qualified — this scenario's own identifiers **and** the
`PILOT-LAN-80` sentinel — and each predicate is pinned literally in
`tests/pilot-data-contract.test.ts`, so widening one is a line in a diff.
`docs/adr/0019-application-created-pilot-rows.md` records the rule.

**The one thing this asks of you.** A walk-up who is not on the roster is a
person minted from a name you typed, and the name is the only marker available.
Type the sentinel as its first word. If cleanup meets a walk-up without it, it
**aborts** rather than guess — the row might be a real member, and deleting a
real identity to tidy up a test is the outcome the whole ownership rule exists
to prevent.

## Can this send anything to a real person?

No. The scenario creates no notification job, no delivery result and no RSVP
access token, and its five people have no contact point to send to. The one
contact point that can come into existence is the one you may type on the
walk-up form, and nothing in this slice delivers to a walk-up.

## Cleanup

Run `cleanup.sql`. It removes this scenario's rows and nothing else: the open
season, the durable pilot identities, every access grant and all unrelated audit
history are untouched. It is safe to run twice, and its final result set must
show four zeroes.

If it aborts, read the message — every guard in it names what is in the way and
what to do about it. None of them is safe to work around by editing the script.
