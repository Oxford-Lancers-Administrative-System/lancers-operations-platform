# LAN-110 — the coach attendance recorder

Two SQL files, run **by hand**, against hosted Supabase, by Brian and nobody
else. Nothing in this repository runs them: not a migration, not the seed, not
CI, not the deploy, not the application.

- `setup.sql` — installs the scenario.
- `cleanup.sql` — removes it again, and only it.

Read `docs/pilot-data-runbook.md` first if you have not run one of these before.
`tests/pilot-scenario-lan-110.test.ts` proves both files against the **local**
stack, so their behaviour is checked before either goes near production.

## What this scenario is for

LAN-110 gives an active Head Coach, Offensive Coordinator or Defensive
Coordinator one screen — the register for an event somebody else has said took
place — and withholds everything else in the operator shell.

Two halves of that need a person to look at them, which is what this scenario is
for:

- **The narrow surface.** Attendance-only navigation, all four states, immediate
  save feedback, the latest committed value with who put it there, and the
  minimal walk-up. None of it is a judgment a test can make.
- **The boundary.** A coach who cannot mark an event occurred, cannot open the
  roster, and cannot reach event administration — proved by trying, as the coach,
  on the deployed application rather than only in the suite.

Everything is synthetic. No person, event, answer or venue here corresponds to
anybody real, and the scenario creates no contact point, no notification job and
no delivery work of any kind — so it can send nothing to anybody, ever.

## Before you run anything

Two prerequisites, both of which `setup.sql` checks and refuses without.

1. **The role catalogue must exist.** `setup.sql` grants a `head_coach`
   assignment, and it will not create the role: the club's own vocabulary is
   reference data, and inserting reference data into production is your action
   rather than a scenario's. LAN-73's production handoff recorded that hosted has
   no `public.roles` rows at all, so on a first run this is the stop you should
   expect. Seed the catalogue — `code`, `name`, `scope`, `is_constitutional_office`
   as `scripts/seed-local.mjs`'s `ROLE_SPEC` lists them — and run setup again.
   `head_coach` must be `season`-scoped: coaching hangs off the season, not the
   committee year.
2. **One open season**, from the permanent pilot foundation (LAN-93). The script
   creates none and refuses if there are none or more than one.

## What setup installs

| Row                    | Count | Sentinel carried in                  |
| ---------------------- | ----- | ------------------------------------ |
| People                 | 5     | `known_as`                           |
| Role assignments       | 2     | `note`                               |
| Season memberships     | 3     | (parent chain)                       |
| Events                 | 1     | `name`                               |
| Event audience members | 3     | (parent chain)                       |
| Invitations            | 3     | (parent chain)                       |
| RSVP responses         | 2     | `reason`, on the one negative answer |

The two coaching seats:

| Person                                | `head_coach` assignment        | In effect |
| ------------------------------------- | ------------------------------ | --------- |
| `PILOT-LAN-110 Authorized head coach` | yesterday → 30 days from today | Yes       |
| `PILOT-LAN-110 Coach out of post`     | 30 days ago → yesterday        | No        |

Both seats carry an end date, including the one that has to work. A pilot grant
is time-bounded at the moment it is made — `effective_to` is nullable and the
database would accept an open-ended grant in silence, so the end date is the only
control. If the review runs past it, run cleanup and install the scenario again
rather than extending the seat by hand.

The second is the unauthorized coach. The role catalogue has no assistant-coach
seat and LAN-108 forbids inferring permission from a broad "coach" label, so a
real coaching seat that is no longer in effect is what an unauthorized coach
honestly looks like in this schema.

The event:

| Event                                     | When       | Status     | Invitees |
| ----------------------------------------- | ---------- | ---------- | -------- |
| `PILOT-LAN-110 Coach attendance scenario` | 2 days ago | `approved` | 3        |

It arrives `approved`, not `occurred`, and that is the point: the coach cannot
open it until an operator has said the practice happened, and watching that gate
open is half the exercise.

The three invitees:

| Person                      | Standing RSVP     | Note                                            |
| --------------------------- | ----------------- | ----------------------------------------------- |
| `PILOT-LAN-110 Said yes`    | **Attending**     |                                                 |
| `PILOT-LAN-110 Said no`     | **Not attending** | Carries a synthetic reason. Step 8 looks for it |
| `PILOT-LAN-110 No response` | **No response**   | Never answered; its deadline has passed         |

## The logins you have to create

`setup.sql` creates no auth user and no `operator_accounts` row. Creating or
inviting a login is a supported Supabase Auth administrator action and is yours
alone.

Create **two**, through the Supabase dashboard's Auth section, and link each to a
`public.operator_accounts` row pointing at the person named:

| Login           | Link to person                        | What it proves     |
| --------------- | ------------------------------------- | ------------------ |
| A coach login   | `PILOT-LAN-110 Authorized head coach` | The narrow surface |
| A refused login | `PILOT-LAN-110 Coach out of post`     | UX-96, the denial  |

**Do not use your own account for the coach login.** You hold committee seats,
and an operator who holds a committee seat _and_ a coaching seat keeps the
operator's board — deliberately, because LAN-110 narrows a coach's surface and
never takes away authority a recorded decision granted. Signing in as yourself
with `head_coach` added would show you the operator's attendance board and prove
nothing about this ticket. The narrow surface belongs to an account whose only
authority is coaching, which is what the first login above is.

Use your own account for the operator steps in the matrix — marking the event
occurred is an authorized-operator action and you already hold it.

## The matrix

Work through it in order. Steps 1 and 2 must be done **before** step 3, because
the gate closing is what they demonstrate.

| #   | Sign in as        | Do this                                                      | Expect                                                                                    |
| --- | ----------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 1   | The coach login   | Open the shell                                               | One destination, **Attendance · Occurred events only**. No Roster, no Events, no Report   |
| 2   | The coach login   | Open the attendance URL for the scenario event               | **Attendance is not open**, and a line saying coach access does not include Mark occurred |
| 3   | The coach login   | Type `/operate/roster` into the address bar                  | Refused, with no roster on the screen. Navigation was never the boundary                  |
| 4   | You (operator)    | Open the event and press **Mark occurred**                   | The assertion is recorded against you                                                     |
| 5   | The coach login   | Open **Attendance**                                          | The scenario event is now listed                                                          |
| 6   | The coach login   | Open it, and press **Present** for the player who said no    | `Saving…`, then the committed value with your coach's name and the time                   |
| 7   | The coach login   | Press **Late** for the same person                           | The correction commits; the earlier value stays in the audit trail                        |
| 8   | The coach login   | Look for the reason behind the **Not attending**             | It is not on the screen, and not in the page source                                       |
| 9   | The coach login   | Press **Add walk-up**, type `PILOT-LAN-110 Devon Skye`, save | Recorded, flagged for reconciliation, no membership created                               |
| 10  | The coach login   | Look for a way to remove a record                            | There is none. Removal unwinds the occurrence assertion, which is not a coach's           |
| 11  | The refused login | Open the same attendance URL                                 | **You cannot record attendance for this event**, no board, no names                       |
| 12  | Both coach logins | Do steps 5 to 9 again at phone width (375px)                 | Everything reachable, nothing scrolling sideways                                          |

**The one thing this asks of you.** In step 9, type the sentinel as the **first
word** of the walk-up's name. That person is minted from what you type and the
name is the only marker available; cleanup aborts on a walk-up without it rather
than guess whether it is a real member.

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
`PILOT-LAN-110` sentinel. `docs/adr/0019-application-created-pilot-rows.md`
records the rule.

## Can this send anything to a real person?

No. The scenario creates no notification job, no delivery result and no RSVP
access token, and its five people have no contact point to send to. The one
contact point that can come into existence is the one you may type on the
walk-up form, and nothing in this slice delivers to a walk-up.

## After acceptance

In this order:

1. **Disable the two logins you created.** Cleanup aborts while an
   `operator_accounts` row points at one of this scenario's people, deliberately:
   withdrawing access is a decision, not teardown, and a script should not make
   it quietly. Set `is_active = false` — or delete the `operator_accounts` row
   and the auth user, if you would rather not keep them.
2. **Run `cleanup.sql`.** It removes this scenario's rows and nothing else: the
   open season, the role catalogue, the durable pilot identities, every other
   access grant and all unrelated audit history are untouched. It is safe to run
   twice, and its final result set must show five zeroes.

Unlike LAN-80's, this cleanup **does** remove two role assignments — its own
two, by identifier and by the sentinel in `note`. It aborts on any third, because
a seat it did not write is a grant somebody made deliberately.

If it aborts, read the message — every guard in it names what is in the way and
what to do about it. None of them is safe to work around by editing the script.
