# QA sweeps

A **sweep** is several walkers exploring one build at the same time, each
taking a group of workflows, to find defects before humans meet them. LAN-239
was the first; it found 24 defects the day before tester week and missed one
that Brian found himself the next morning — a whole roster column that was
empty on all 65 rows, recorded by its walker as rendering correctly, because
nothing in the brief asked whether a seeded state was there at all
(LAN-261, LAN-262). The absence check in the brief exists because of that
morning.

Three documents, and they are meant to be used together:

| File                                           | Who reads it | What it is                                                                           |
| ---------------------------------------------- | ------------ | ------------------------------------------------------------------------------------ |
| [`sweep-environment.md`](sweep-environment.md) | The operator | The one-off recipe that puts a build and the tester-week dataset in front of walkers |
| [`group-assignments.md`](group-assignments.md) | The operator | How the workflows are cut into groups, and the cross-feature journey each group owns |
| [`walker-brief.md`](walker-brief.md)           | Each walker  | The brief itself — what to walk, what counts as a finding, and the exact output      |

## Running one

1. Build the environment from `sweep-environment.md`. Do it once; every walker
   shares it.
2. Fill in the group table in `group-assignments.md` for this sweep — the
   groups follow the mission boundaries and rarely change, the journeys are
   worth rewriting when the workflows have moved.
3. Give each walker `walker-brief.md`, its own group row, and the paths the
   recipe printed. Walkers run concurrently against one database and one app.
4. Collect the findings files, deduplicate across groups, and file what
   survives.

Walkers are read-mostly: they create records through the product like a tester
would, and they never reset, seed, stop or release the environment, edit the
repository, or touch anything hosted. The brief says so in the walker's own
words; this file says it here so the operator does not have to be asked.
