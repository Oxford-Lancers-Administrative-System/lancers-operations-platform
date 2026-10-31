# LAN-513 — move existing college and degree values onto the lists

Two files that **Brian runs by hand against hosted**, after the deploy that
adds LAN-512's lists. No agent runs either there. Read
[`docs/pilot-data-runbook.md`](../../../docs/pilot-data-runbook.md) first.

- `review-sheet.sql` — read-only. One row per person with a college, degree or
  subject on file: name, the three values now, the three it proposes, and how
  sure the match is. This is the sheet for Stewart.
- `apply-approved.sql` — the update. Takes exactly the rows Stewart approved,
  pasted in, and is a **dry run** unless its last line is changed to `commit;`.

## Why it exists

LAN-512 made college and degree fixed lists from 29 October 2026, on input
only: the values typed before then stay as they were ("St. Catz", "Christ
church", "Biochemistry"). Stewart should not fix about 55 records by hand
(Brian, 29 October: "here's what I'm moving it to, and then you can come back
and tell me that's correct or not"). This is a one-off correction, not a
scenario: it creates no person, so it has no sentinel and no cleanup file.

## The mapping, certain matches only

The lists are LAN-512's (`src/lib/services/oxford-academic.ts`, sources cited
there); both files carry a copy, kept equal to the application's by
`tests/lan-513-cleanup.test.ts`. A value is matched after folding: case,
apostrophes, full stops and spacing ignored, "Saint" read as "St", a trailing
"Oxford" dropped.

| On file                                                                                                                                                                            | Becomes                        | Confidence       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ---------------- |
| A listed college, letters or subject in another case or punctuation ("st anne's college")                                                                                          | the listed spelling            | certain          |
| A college without "College" ("Balliol", "St Catherines"), except University College and New College                                                                                | the college                    | certain          |
| One of the research's informal names (LAN-512 comment 1: "St Catz", "Teddy Hall", "LMH", "BNC", "Univ", "Christchurch", "The House", …)                                            | the college it names           | certain          |
| LAN-494's "MSc by Research"                                                                                                                                                        | MSc                            | certain          |
| No letters, and a subject that starts with them ("BA Geography", "MSc in Education", "MSc by Research in Biology", "BA (Hons) History")                                            | those letters and that subject | certain          |
| Letters on file, and the subject repeating them ("MSc in Learning and Teaching" beside MSc)                                                                                        | the subject                    | certain          |
| No letters, and a subject the University offers with one set of letters only ("Human Sciences")                                                                                    | those letters, and the subject | likely - confirm |
| Anything else — including "CCC" (Christ Church or Corpus), "UC", "SJC", "Manchester", "Magdalene", a subject offered with several letters ("Biochemistry", "Geography", "History") | left as it is                  | fix by hand      |

A row's confidence is its least sure part: one unmatched value makes the row
**fix by hand**, while its other columns still carry what did match.
**No change** means everything on file is already on the lists.

## Run order

1. **Deploy first.** Both files stop with an exception unless LAN-512's
   migration (`20261029090100_person_degree_lists.sql`) is applied.
2. **The sheet.** Open the hosted SQL editor, paste the whole of
   `review-sheet.sql` and run it. Read the first result (the database and
   user; stop if either is wrong). Export the last result as a CSV. It names
   people: keep it with Brian and Stewart, never in this repository.
3. **Stewart's answer.** He confirms or corrects each row. Rows marked fix by
   hand are corrected on the person record by whoever knows the answer, or
   given values here if Stewart supplies them.
4. **The approved rows.** Copy the `approved_line` of every row Stewart
   approved into `apply-approved.sql`, between `-- BEGIN APPROVED` and
   `-- END APPROVED`, one per line. Where Stewart gave a different value,
   change the last three values of that line (college, degree, subject) to
   his. Remove the comma after the last line. A value to write must be on
   the lists; a value left as it was on file is not changed.
5. **Dry run.** Paste the whole file into the SQL editor and run it as it is.
   It refuses the whole run, writing nothing, if a row names a person who has
   been merged or erased, if any of the three values on file has changed
   since the sheet was taken (take a fresh sheet), or if a value to write is
   not on the lists. Read the preview: one row per column it changes, from
   and to. The last result counts what changed, with `not_as_approved` at 0.
   It then rolls back.
6. **Apply.** Change the last line from `rollback;` to `commit;` and run it
   again. Keep the preview output as the record of the change. Each column
   changed carries an audit row (`person_college_updated` and so on, by
   "owner: LAN-513 college and degree cleanup"), so the person record's
   history shows it.
7. **Check.** Run `review-sheet.sql` again: the approved rows now read
   **no change**.

## Proof

`tests/lan-513-cleanup.test.ts` runs both files against the local database,
inside transactions it rolls back, over synthetic people: certain matches of
each kind, an inferred one, ambiguous names left alone, a clean record, a
correction from Stewart, a row not approved, and the two refusals (changed
since the sheet; a value not on the lists).
