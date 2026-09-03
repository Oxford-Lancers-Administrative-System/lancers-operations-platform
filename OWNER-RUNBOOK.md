# Owner runbook — tester week

**For Brian.** Everything here is yours to run; no agent does any of it. Work
top to bottom and tick as you go.

Every command is one line. Copy it whole. They are written for **zsh**, which is
the shell on your Mac.

> **This runbook replaces the Monday-showcase one.** The 17 August 2026
> walkthrough happened, went well, and its dataset — 42 real players by your
> decision of 15 August — is still installed in production. Tester week
> (LAN-221) replaces it with an invented squad, a full term, and every state the
> workflow map names, loaded by the same tool. **Step 4 removes the old
> dataset first.** What was learned on 17 August about Meta tokens, templates
> and the allowlist is kept in § 12.

---

## 1. What you end up with

The deployed application, against the hosted database, holding:

- **40 invented players** across every membership status, with positions,
  jersey numbers, availability in every colour, contact details in every shape
  the club actually types, first-name-only records, two near-duplicates, one
  merged pair, aliases, emergency contacts and consent in every state. Nobody
  real. Every number is in the Ofcom drama range; every address ends
  `.example`.
- **14 invented recruits** at every funnel stage — a QR sign-up, a walk-up
  captured at a taster, a possible duplicate, exits, and one flipped to joined
  and sitting in onboarding — with notes, questionnaire answers, the cycle's
  messages as delivered, and spent links.
- **A full term of events**: every type, every lifecycle state, a term-card
  import already applied, questions, alternatives, an amendment everyone was
  told about and one nobody was, a cancellation with its notices, a session
  called off, registers with walk-ups, and reminders on hold.
- **The messaging ladder in every state**, as if it had been working all
  term: invitations delivered, reminders, the email rung, a terminal failure,
  a WhatsApp failure carried by email, somebody with no usable route, a held
  job, cancelled jobs, flags raised and the President's escalation recorded.
  Frozen plans agree with all of it.
- **Onboarding at every stage** with history, an activity log, signed
  documents and a disputed fact — and, once Mission 7's remaining packages
  merge, the chase, the nudge and the exhaustion (§ 10).
- **A persisted Monday report** whose numbers reconcile with the pages, and its
  follow-ups.
- **Nothing that can send.** No job the sweep would dispatch, no live link for
  anybody but you and Stewart. `verify` fails closed otherwise (§ 7).
- **Three checklists and a coach's**, one per tester, every link resolving
  (§ 8).

**What it is not.** It is not the real-roster cutover. The dataset is removable
in one command (§ 10), apart from the residue § 10 explains.

---

## 2. Before you load — in this order

- [ ] **Mission 7 merged** (`/finish-mission M-ONBOARDING-AND-INFORMATION-COMPLETION`),
      and the LAN-221 draft PR's follow-up commit for the Mission 7 states is
      in. Until then the loader still runs and § 10 lists what is missing.
- [ ] **Migrations applied to hosted**, per `docs/migration-runbook.md`,
      including `20260903090000_onboarding_substrate.sql`. Preflight refuses
      without it.
- [ ] **Deployed**: `gh workflow run deploy.yml`, then

```
curl -s https://app.oxfordlancers.com/api/health
```

      Expect `"status":"ok"`, `"databaseConfigured":true`, `"schemaCompatible":true`.

- [ ] **Connection smoke test** (`scripts/production/README.md`).
- [ ] **Accounts**: the LAN-138 bootstrap, dry run then real — Clint
      (President), Stewart (General Manager), you (IT Officer). Note each
      person's **Auth user UUID** from the Supabase dashboard. If Garrett or
      Glenn are testing, invite them through `/operate/admin/operators/new`
      after the load; an invitation that does not arrive is finding #1.
- [ ] **The coach seat**: an Auth user for `brian.daniel.schuster+coach@gmail.com`
      if you want the coach checklist run on a phone.
- [ ] **WhatsApp stays off.** `WHATSAPP_PHONE_NUMBER_ID` must not be set on the
      service until § 11 is done. Check:

```
gcloud run services describe lancers-operations-platform --region REGION --format='value(spec.template.spec.containers[0].env)' | tr ';' '\n' | grep -i whatsapp
```

---

## 3. The private parameter file

This holds real telephone numbers, real Auth identifiers and the secret every
live link is derived from. **It never goes in the repository.** Put it outside
your clone.

- [ ] Create `~/lancers-tester-week-params.json`:

```json
{
  "brian": {
    "givenName": "Brian",
    "familyName": "Schuster",
    "phone": "+44 7xxx xxxxxx",
    "authUserId": "PASTE-YOUR-AUTH-UUID",
    "roles": ["it_officer"]
  },
  "stewart": {
    "givenName": "Stewart",
    "familyName": "SURNAME",
    "phone": "+44 7xxx xxxxxx",
    "authUserId": "PASTE-STEWARTS-AUTH-UUID",
    "roles": ["general_manager"]
  },
  "clint": {
    "givenName": "Clint",
    "familyName": "SURNAME",
    "authUserId": "PASTE-CLINTS-AUTH-UUID",
    "roles": ["president"]
  },
  "coach": {
    "givenName": "Brian",
    "familyName": "Schuster",
    "authUserId": "PASTE-COACH-AUTH-UUID",
    "roles": ["head_coach"]
  },
  "liveLinksFor": ["brian", "stewart"],
  "tokenSecret": "PASTE-A-LONG-RANDOM-STRING",
  "accessEndsOn": "2026-12-31",
  "formUrl": "https://www.notion.so/PASTE-THE-QA-FORM-LINK",
  "logins": {
    "brian": "your usual address",
    "stewart": "his address",
    "clint": "his address",
    "coach": "the +coach address"
  },
  "strays": { "personIds": [] }
}
```

- [ ] Put a real secret in `tokenSecret`. It is what makes your and Stewart's
      live links uncomputable from the public repository:

```
node -e 'console.log(require("crypto").randomBytes(24).toString("base64url"))'
```

- [ ] Lock it down:

```
chmod 600 ~/lancers-tester-week-params.json
```

**What each field does.** `roles` seats the person; a seat somebody else already
holds is left alone and noted. `liveLinksFor` names who gets a live RSVP link
and a live player page — everyone else's links are already spent or expired.
`accessEndsOn` end-dates every seat the loader makes, including the fictional
committee. `strays.personIds` are the Person rows created on 2026-08-21 while
testing operator invitations (LAN-196 item 2): preflight prints a hint with
how many candidates it can see, and § 10 removes exactly the ids you list.

---

## 4. Remove the Monday showcase first

The 17 August dataset is still installed. It shares reference rows with the
new one and must go before the new load.

- [ ] Get the connection string into your shell without it reaching history:

```
export DATABASE_URL="$(gcloud secrets versions access latest --secret=database-url)"
```

- [ ] Roll it back with the **previous** loader, from the commit before
      LAN-221 merged, using your old parameter file and the two workbooks:

```
git worktree add /tmp/showcase-lan124 4a3efa9 && node /tmp/showcase-lan124/scripts/production/showcase.mjs rollback --force --confirm-target fggbgeraiadetyiyjlvb --roster "$HOME/Downloads/OULAFC Master Table.xlsx" --termcard "$HOME/Downloads/260720 OULAFC MT26 Term Card v0.xlsx" --params ~/lancers-showcase-params.json
```

      If it stops with `permission denied for table …`, the old runbook's
      § 11 "Three tables `--force` cannot remove" applies: delete those rows
      as the owner in the SQL editor, then re-run. Finish with

```
git worktree remove /tmp/showcase-lan124
```

- [ ] **Snapshot.** Supabase dashboard → Database → Backups → take a manual
      backup, or confirm today's exists. Note the time. This is your recovery
      point.

---

## 5. Preflight — writes nothing

```
node scripts/production/showcase.mjs preflight --confirm-target fggbgeraiadetyiyjlvb --params ~/lancers-tester-week-params.json
```

**Expect**, roughly:

```
Target: hosted project fggbgeraiadetyiyjlvb
Roles already present: 20
Seasons already present: …
Parameters supplied:
  brian: auth user, telephone number, roles: it_officer
  stewart: auth user, telephone number, roles: general_manager
  clint: auth user, roles: president
  coach: auth user, roles: head_coach
  live links for: brian, stewart
  strays to remove on rollback: N
  token secret: present
Durable identities: 4 of 4 supplied Auth users already resolve to a Person. Those are adopted, not duplicated.
Privileges: the connected role cannot DELETE from 25 table(s) the plan writes; rollback will write residue SQL for those. Expected on hosted.
Term card: 36 entries (synthetic — no workbook supplied)
Anchor: 2026-09-XX. Plan: ~25,000 rows, ~170 states, ~120 examples.

Preflight passed. Nothing was written.
```

Add `--termcard "$HOME/Downloads/260720 OULAFC MT26 Term Card v0.xlsx"` to every
command if you want the club's real Michaelmas drafts instead of the synthetic
ones. Add `--anchor 2026-09-XX` (the Monday tester week starts) to every
command if you are loading on a different day; the dataset is placed around
the anchor and the report is dated to it.

### Stop conditions

| If                                   | Then                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `STOP. Preflight found:` appears     | Read the list. Every entry is a refusal to proceed, not a warning.                       |
| `Durable identities: 0 of 4`         | The bootstrap has not run, or the UUIDs are wrong. Stop.                                 |
| A seat is "already held by somebody" | Fine — that person keeps it; the loader does not contest seats. Read who, and decide.    |
| The hint names 2026-08-21 candidates | Put their ids in `strays.personIds` now, so § 10 removes them. The loader never guesses. |
| It asks for `--confirm-target`       | You are pointed somewhere unexpected. Stop.                                              |

---

## 6. Preview, then load, then file the report

- [ ]

```
node scripts/production/showcase.mjs preview --confirm-target fggbgeraiadetyiyjlvb --params ~/lancers-tester-week-params.json
```

**Expect** a table of proposed rows, `create: ~25,000 update: 0`, and
`Nothing was written.` If you see `update` on a database you believe is clean
of the old showcase, stop and find out why.

- [ ]

```
node scripts/production/showcase.mjs load --confirm-target fggbgeraiadetyiyjlvb --params ~/lancers-tester-week-params.json
```

**Expect:** `Created <n>, updated 0, skipped 0. Nothing else was touched.` It
runs in one transaction; if it fails partway, nothing is written and the error
names the constraint — send it to me rather than retrying blind. It takes a
minute or two over the pooler.

- [ ]

```
node scripts/production/showcase.mjs report --confirm-target fggbgeraiadetyiyjlvb --params ~/lancers-tester-week-params.json
```

**Expect:** `Filed the 2026-09-XX report (8 new rows): …` with every section
counted. This runs the same queries the report page runs, against what was
just loaded, and files version 1 and version 2.

---

## 7. Verify — fails closed

```
node scripts/production/showcase.mjs verify --confirm-target fggbgeraiadetyiyjlvb --params ~/lancers-tester-week-params.json
```

**Expect** every line `PASS`, some `LATER` (Mission 7 states not yet
producible), and `Everything reconciles.`

The lines that matter most, and on hosted they cover the **whole database**:

- `notification jobs the automatic sweep would dispatch, whole database (0 expected): 0`
- `notification jobs pending or ready and not held, whole database (0 expected): 0`
- `live RSVP links for anybody but the named testers, whole database (0 expected): 0`
- `live player-page links for anybody but the named testers, whole database (0 expected): 0`
- `single-use answer links neither spent nor revoked, whole database (0 expected): 0`
- `report reconciles: …` — the filed report against a fresh computation
- one `state …` line per data state the map names, each `PASS`

Those are what say tester week's queue cannot start sending the day
`WHATSAPP_PHONE_NUMBER_ID` is set.

- [ ] Keep the manifest — row identifiers, states and provenance, no names, no
      numbers, no links:

```
node scripts/production/showcase.mjs manifest --confirm-target fggbgeraiadetyiyjlvb --params ~/lancers-tester-week-params.json --out ~/tester-week-manifest.json
```

### Stop conditions

| If                    | Then                                                                     |
| --------------------- | ------------------------------------------------------------------------ |
| Any `FAIL` line       | Do not hand out the checklists. Roll back (§ 10) and send me the output. |
| `verify` says `STOP.` | Same.                                                                    |

---

## 8. The checklists

- [ ] Make the Notion QA form live and put its link in the parameter file's
      `formUrl`, or pass `--form-url` here.
- [ ] Generate them:

```
node scripts/production/showcase.mjs checklists --confirm-target fggbgeraiadetyiyjlvb --params ~/lancers-tester-week-params.json --base-url https://app.oxfordlancers.com --out ~/tester-week-checklists
```

Four files: `stewart.md`, `clint.md`, `brian.md`, `coach.md`. Each is a list of
"open this link — you should see this — tick it, or report it", the form link
at the top, covering that person's slice of the map so the four together cover
every workflow. **Your file and Stewart's carry live links.** Hand each file to
its tester only; never commit them, never paste them into Linear.

- [ ] Open three links from your own file before handing anything out — a
      person, an event, your RSVP link — and confirm each resolves.
- [ ] Hand out: each tester gets their login and their checklist. The
      browsable map is `docs/tester-week/index.html` in the repository, if
      anybody wants the whole picture.

---

## 9. During the week

- [ ] Read the form daily. Triage into Linear under `qa`.
- [ ] Blocked items: fix on a `fix/` branch, deploy end of day. Merging
      deploys nothing; `gh workflow run deploy.yml` does.
- [ ] Everything else goes to LAN-146 for the simplification pass (LAN-219).
- [ ] **Do not re-run `load`** during the week. It rewrites loader-owned rows
      and would revert what testers changed. If a tester breaks something,
      that is a finding.
- [ ] If a tester invites an operator or approves a draft, that creates live
      rows — invitations, jobs, tokens. Fine: WhatsApp is off. They are the
      application's rows and § 10's `--force` is what removes them.

---

## 10. Afterwards — leave it, or remove it

**Leave it installed** if the club wants to keep looking at it. Record that
choice in Linear on LAN-221. Then skip to § 11.

**Remove it:**

- [ ]

```
node scripts/production/showcase.mjs rollback --confirm-target fggbgeraiadetyiyjlvb --params ~/lancers-tester-week-params.json --residue ~/tester-week-residue.sql
```

**Expect** a table of removed rows and `Removed <n> rows.` It deletes only
identifiers it computed itself, plus the strays you named. Running it twice is
safe.

### If it refuses instead

**This is the normal case after a week of testing, not a fault.** Approvals,
answers, invitations, corrections and reports the testers made are rows the
application created, hanging off rows the loader did. Rollback stops and names
them. Keep any evidence you want, then:

```
node scripts/production/showcase.mjs rollback --force --confirm-target fggbgeraiadetyiyjlvb --params ~/lancers-tester-week-params.json --residue ~/tester-week-residue.sql
```

### The residue

On hosted the loader connects as the application's own login, which is
deliberately granted no `DELETE` on the history tables — results, attempts,
status events, notes, answers, tokens, the report, and so on. Rollback deletes
everything it may and writes the rest to `~/tester-week-residue.sql`: those
rows, **and everything they still point at** (jobs, invitations, events,
memberships, people), as exact `delete … where id in (…)` statements in the
right order. Identifiers only, no personal data. Expect it to be long.

- [ ] Open the Supabase dashboard's **SQL editor**, which runs as the owner,
      paste the file whole, and run it. It is one transaction.
- [ ] Confirm:

```
node scripts/production/showcase.mjs verify --after-rollback --confirm-target fggbgeraiadetyiyjlvb --params ~/lancers-tester-week-params.json
```

**Expect** `loader rows remaining outside residue tables (0 expected): 0`,
`stray Person rows remaining (0 expected): 0`, and `Everything reconciles.`
(Before the SQL editor step, the same command with
`--residue ~/tester-week-residue.sql` on the end reports those rows as
`RESIDUE` rather than `FAIL`, so you can check the loader itself left nothing
else behind.)

**What is never removed:** identities the loader adopted rather than created
(you, Stewart, Clint, the coach seat), reference rows that were already there,
and history the **application** wrote — a tester's approval, a correction, a
generated report — together with whatever that history names. History that
can be deleted to tidy up is not history. The loader's own audit rows are not
history; they go with the dataset.

**Auth users are not removed by rollback.** Deleting a tester's login is a
dashboard action and yours to decide.

---

## 11. Before anyone switches WhatsApp on

Whether the dataset was left installed or removed:

- [ ]

```
node scripts/production/showcase.mjs verify --confirm-target fggbgeraiadetyiyjlvb --params ~/lancers-tester-week-params.json
```

      (or `--after-rollback` if you removed it) and read the five
      **whole database** lines in § 7. All five must be `0`.

- [ ] If any is not, the rows it counts are the application's — an approved
      draft nobody rolled back, a live invitation. Cancel them in the
      application, or run `rollback --force`, and verify again.
- [ ] Only then is LAN-168's cutover — setting `WHATSAPP_PHONE_NUMBER_ID` and
      the access token on the service — safe to begin.

---

## 12. What 17 August taught, kept

- **The Meta console token expires within the hour.** Regenerating invalidates
  the previous one, and Cloud Run pins secret versions at instance start: add
  the version **and** roll a revision. Check a token is live before relying on
  it.
- **Meta accepted a marketing template and silently dropped it — error
  `131049`.** A **Utility** template is not throttled that way. The club's
  `lancers_event_invitation` template, category Utility, language English (UK),
  four variables, not ending on a variable.
- **Free-form text needs `WHATSAPP_ALLOW_FREE_FORM=true` and
  `WHATSAPP_MESSAGE_MODE=text`** and a 24-hour window the recipient opens.
  Both were removed after the walkthrough and stay removed.
- **`DELIVERY_DEFAULT_CALLING_CODE` must be `44`**, or unset.
- **The delivery page never shows "Delivered"** without an inbound webhook.
  Accepted is the provider taking the message, not the phone receiving it.
- **`DELIVERY_RECIPIENT_ALLOWLIST`** stays the control that limits who the
  application can message. During tester week it does not matter — nothing is
  configured to send — but set it to your number and Stewart's before LAN-168.

---

## 13. If something goes wrong

| Problem                                     | What to do                                                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Preflight refuses                           | Read the reason. Every refusal names a fix; none is a warning.                                                          |
| `load` fails partway                        | Nothing was written. Send me the constraint name.                                                                       |
| A checklist link 404s                       | The load and the checklist were made with different `--anchor` or parameters. Regenerate the checklists; do not reload. |
| `verify` fails a `state …` line             | A row the loader wrote was changed or removed — by a tester, or by a migration. Send me the line.                       |
| `verify` fails a whole-database line        | Something live exists. § 11.                                                                                            |
| `permission denied for table …` on rollback | Cannot happen: rollback checks its privileges first and writes residue instead. If it does, send me the output.         |
| Rollback refuses                            | Expected after testing — § 10 "If it refuses instead". Nothing was deleted.                                             |
| Application is broken                       | `gh workflow run deploy.yml -f image_tag=<previous-commit-sha>`. Safe — no schema changed.                              |
| Something is very wrong                     | Restore the § 4 backup. That is what it is for.                                                                         |

---

## 14. Evidence worth keeping

- [ ] The `preflight`, `verify`, `rollback` and `verify --after-rollback`
      output (no personal data in any of them)
- [ ] `~/tester-week-manifest.json`
- [ ] The residue file, after it was run
- [ ] Which testers had which checklist, and when
- [ ] Whether you left it installed or rolled it back, and when — on LAN-221
