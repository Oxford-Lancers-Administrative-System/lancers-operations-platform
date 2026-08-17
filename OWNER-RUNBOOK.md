# Owner runbook — the Monday showcase

**For Brian.** Everything here is yours to run; no agent does any of it. Work
top to bottom and tick as you go.

Every command is one line. Copy it whole. They are written for **zsh**, which is
the shell on your Mac — `read -rs "T?prompt"` is zsh's form and `read -rs -p`
is bash's, and the difference is not cosmetic: zsh reads `-p` as _from the
coprocess_ and the command does something else entirely.

> **The 17 August 2026 walkthrough happened, and went well.** The showcase is
> **still installed** in the production database by your decision. This document
> is no longer a plan; it is the reference for re-running it, changing it, or
> removing it, and § 2a, § 4, § 10 and § 11 now record what actually worked
> rather than what was expected to. See **§ 0** first.

---

## 0. What actually happened on 17 August

Four things the first run of this runbook got wrong. They are corrected in
place below; they are collected here because each one costs an hour to
rediscover.

- **The Meta console token expires within the hour, not in 24 hours.** It is a
  _user_ token, and regenerating it invalidates the previous one. Cloud Run also
  pins secret versions at instance start, so a new version of
  `whatsapp-access-token` does nothing until a **new revision** rolls. Adding the
  version and redeploying are two steps, and both are needed. Check a token is
  live before relying on it, not after a message fails to arrive.
- **Meta accepted the message and silently dropped it — error `131049`.** That
  is the per-recipient throttle Meta applies to **marketing**-category
  templates, and the sample template is marketing. The API returned a message id
  and the delivery page showed an accepted attempt, so everything looked correct
  and the phone stayed silent. A **Utility** template is not throttled this way.
- **What was actually sent was free-form text, not a template.** Free-form has
  no category and no review queue, and Meta permits it inside a 24-hour service
  window that the _recipient_ opens by messaging the business number first. That
  is a thing two people can do and forty-two cannot, which is exactly why it was
  acceptable for a demonstration and is not a delivery mechanism. It needed
  `WHATSAPP_ALLOW_FREE_FORM=true` **and** `WHATSAPP_MESSAGE_MODE=text` on the
  service. **Both have since been removed, and should stay removed.** The
  durable answer is an approved Utility template — § 2a.
- **`DELIVERY_DEFAULT_CALLING_CODE` was set to `1` on the service** to work
  around a defect in the allowlist comparison, since fixed. **Set it back to
  `44`, or remove it** — the club's roster is United Kingdom numbers, and with
  `1` in place a number written `07700900123` normalises to the wrong country.

```
gcloud run services update lancers-operations-platform --region REGION --remove-env-vars DELIVERY_DEFAULT_CALLING_CODE
```

Two more things worth knowing, which were right but not obvious:

- **The delivery page never shows "Delivered".** That needs an inbound webhook
  and no public callback URL is configured. LAN-101. "Accepted" is as far as it
  goes, and — see `131049` above — accepted is not delivered.
- **A local `docker build` on your Mac needs**
  `--platform linux/amd64 --provenance=false --sbom=false`, or Cloud Run rejects
  the image as an OCI index. Only relevant if GitHub Actions is down, which it
  was.

---

## 1. What you end up with

The deployed application, against the hosted database, holding:

- **42 real players** from the Players Databank, each with an archived 2025–26
  membership and a current 2026–27 one. Positions and kit signal come from the
  workbook; every other detail is illustrative.
- **43 real Michaelmas events** from the term card, dated 30 September to
  2 December 2026 — all **drafts**, none approved, none invited.
- **Ten illustrative events** around 17 August: three that occurred with
  registers, a committee meeting, a draft Leadership Walkthrough for the live
  demonstration, two approved, one draft with no audience, one not held, one
  withdrawn.
- **Three logins:** you as IT Officer (full administrative access), Stewart as
  General Manager, and a coach seat on your `+coach` address.
- **Nothing deliverable.** No notification job, no live RSVP link. The only
  message sent on Monday is the one you send, in front of Stewart.

**What it is not.** It is not the real-roster cutover and it is not the start of
live operations. The showcase is removable in one command.

---

## 2. Before Monday

### 2a. Meta — do this first, it needs Stewart

- [ ] Meta dashboard → **WhatsApp → API Setup** → add Stewart's WhatsApp number
      as a verified test recipient. He receives a code and has to confirm it.
- [ ] Send yourself Meta's `hello_world` from that screen, to check the number
      is live.

**Do this properly rather than optionally.** On 17 August the sample template
was refused with `131049` — Meta's per-recipient throttle on **marketing**
templates — after the API had already returned success. A **Utility** template
is not throttled that way, and it is the only route that both carries an RSVP
link and works more than once:

- [ ] Meta dashboard → **Manage templates → Create**. Name
      `lancers_event_invitation`, language **English (UK)**, category
      **Utility**. Body, exactly four variables, and it **must not end on a
      variable** or Meta rejects it:

      Hi {{1}}, the Oxford Lancers have {{2}} on {{3}}. Please tell us whether you can make it: {{4}} — thanks, Lancers.

Utility templates usually clear in minutes. **`hello_world` is not a fallback**
— it is the template that was refused, and it carries no link in any case. If
the club's template has not cleared, the honest options are to wait, or to
demonstrate everything except the message.

### 2b. Supabase Auth — three users

Supabase dashboard → **Authentication → Users → Add user**. Create each with a
password you choose. **Confirm the email** on each one.

- [ ] `brian.daniel.schuster@gmail.com` — you, if it does not already exist
- [ ] Stewart's email address
- [ ] `brian.daniel.schuster+coach@gmail.com` — the coach seat

Copy each user's **UUID** from the dashboard. You need all three in § 3.

- [ ] **If any of those Auth users already exists**, check the telephone number
      already recorded against them. The loader adopts an existing person rather
      than duplicating them, and leaves the club's own number preferred — so a
      stale number on file is the one Monday's message goes to, not the one you
      put in the parameter file.

> No agent creates a hosted Auth user. This step is yours and cannot be
> automated away.

### 2c. The two workbooks

- [ ] `OULAFC Master Table.xlsx` — note its full path
- [ ] `260720 OULAFC MT26 Term Card v0.xlsx` — note its full path

They stay outside the repository. Nothing commits them.

---

## 3. The private parameter file

This holds real telephone numbers and real Auth identifiers. **It never goes in
the repository.** Put it somewhere outside your clone — your home directory is
fine.

- [ ] Create `~/lancers-showcase-params.json`:

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
  "coach": {
    "givenName": "Brian",
    "familyName": "Schuster",
    "knownAs": "Coach seat",
    "authUserId": "PASTE-COACH-AUTH-UUID",
    "roles": ["head_coach"]
  },
  "accessEndsOn": "2026-09-30"
}
```

- [ ] Lock it down:

```
chmod 600 ~/lancers-showcase-params.json
```

**`accessEndsOn` matters.** It end-dates every role assignment the loader makes,
including your own administrative seat. Leave it in.

> **Why the IT Officer seat is wide.** It now holds every capability in the
> application, including role management, which nobody held before. Whoever
> holds it can grant themselves anything, so it is time-bounded here on purpose.
>
> **It does not let you add an operator through the app.** No screen implements
> that yet. Operator accounts and role assignments still reach the database
> through this loader or by hand — which is why § 2b has you create the Auth
> users in the Supabase dashboard.

---

## 4. Configure the deployed application

All of this is Cloud Run and Secret Manager. Replace `PROJECT` and `REGION` with
your own.

- [ ] Put the Meta token in Secret Manager. **Do not paste it into a file, a
      commit, Linear, or a prompt.** This reads it from your clipboard via a
      prompt, so it never lands in shell history. **Do it last, immediately
      before you need it** — the console token expires within the hour (§ 0):

```
read -rs "T?Meta token: " && printf '%s' "$T" | gcloud secrets versions add whatsapp-access-token --data-file=- && unset T
```

If the secret does not exist yet:

```
read -rs "T?Meta token: " && printf '%s' "$T" | gcloud secrets create whatsapp-access-token --data-file=- && unset T
```

- [ ] Set the rest. **`DELIVERY_RECIPIENT_ALLOWLIST` is the control that stops
      the application messaging the 42 real students** — put only your number
      and Stewart's in it:

```
gcloud run services update lancers-operations-platform --region REGION --update-env-vars APP_BASE_URL=https://YOUR-CLOUD-RUN-URL,WHATSAPP_PHONE_NUMBER_ID=YOUR-TEST-NUMBER-ID,WHATSAPP_TEMPLATE_NAME=hello_world,WHATSAPP_TEMPLATE_LANGUAGE=en_US,WHATSAPP_TEMPLATE_PARAMETERS=none,"DELIVERY_RECIPIENT_ALLOWLIST=+447xxxxxxxxx,+447yyyyyyyyy"
```

**If the club's own template cleared approval**, use these three instead of the
`hello_world` trio above — same command, same everything else:

```
WHATSAPP_TEMPLATE_NAME=lancers_event_invitation,WHATSAPP_TEMPLATE_LANGUAGE=en_GB,WHATSAPP_TEMPLATE_PARAMETERS=invitation
```

- [ ] Point the secret at the service. **Run this again after every new token
      version**, even though nothing about the command changes — Cloud Run pins
      the secret version when an instance starts, so `:latest` only means the
      newest one as of the revision that is running. Adding a version without
      rolling a revision changes nothing:

```
gcloud run services update lancers-operations-platform --region REGION --update-secrets WHATSAPP_ACCESS_TOKEN=whatsapp-access-token:latest
```

- [ ] Check it came up:

```
curl -s https://YOUR-CLOUD-RUN-URL/api/health
```

Expect `"status":"ok"` and `"secretsLoaded":true`.

### Stop conditions

| If                                                               | Then                                                                                                                                      |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/health` is not `ok`                                        | Stop. Roll back the revision (§ 12) and do not load data.                                                                                 |
| `DELIVERY_RECIPIENT_ALLOWLIST` is unset or empty                 | The application sends to **nobody**. That is deliberate — it never means "send to everybody" — but nothing will arrive on Monday. Set it. |
| The allowlist contains any number other than yours and Stewart's | Stop and fix it before loading.                                                                                                           |

---

## 5. Snapshot before you write anything

- [ ] Supabase dashboard → **Database → Backups** → take a manual backup, or
      confirm today's automatic one exists. Note the time.

This is your recovery point. Rolling the showcase back (§ 11) is faster and is
usually the right answer; this is the one that always works.

---

## 6. Preflight — writes nothing

- [ ] Get the connection string into your shell without it reaching history:

```
export DATABASE_URL="$(gcloud secrets versions access latest --secret=database-url)"
```

- [ ] Run it:

```
node scripts/production/showcase.mjs preflight --confirm-target fggbgeraiadetyiyjlvb --roster "$HOME/Downloads/OULAFC Master Table.xlsx" --termcard "$HOME/Downloads/260720 OULAFC MT26 Term Card v0.xlsx" --params ~/lancers-showcase-params.json
```

**Expect**, roughly:

```
Target: hosted project fggbgeraiadetyiyjlvb
Roles already present: 0
Seasons already present: none
Parameters supplied:
  brian: auth user, telephone number, roles: it_officer
  stewart: auth user, telephone number, roles: general_manager
  coach: auth user, roles: head_coach
Roster: 42 players
Term card: 43 entries

Preflight passed. Nothing was written.
```

### Stop conditions

| If                                         | Then                                                               |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `STOP. Preflight found:` appears           | Read the list. Every entry is a refusal to proceed, not a warning. |
| Roster is not 42                           | The workbook changed. Do not continue until you know why.          |
| Term card is not 43                        | Same.                                                              |
| Any term-card entry "is not in the future" | The year is wrong. Stop.                                           |
| It asks for `--confirm-target`             | You are pointed somewhere unexpected. Stop.                        |

---

## 7. Preview — still writes nothing

- [ ]

```
node scripts/production/showcase.mjs preview --confirm-target fggbgeraiadetyiyjlvb --roster "$HOME/Downloads/OULAFC Master Table.xlsx" --termcard "$HOME/Downloads/260720 OULAFC MT26 Term Card v0.xlsx" --params ~/lancers-showcase-params.json
```

**Expect** a table of proposed rows, a line reading `create: … update: 0`, and
`Nothing was written.` at the end.

On a hosted database with no reference data yet, the total is about **1,140
rows** — 42 players, 43 term-card events, 53 events in all. The exact number
moves with the workbooks, so check the shape rather than the digits:

**How to read it.** `create` is a row that does not exist. `update` is a row the
loader already owns from an earlier run — reruns converge rather than
duplicate. `adopted` counts reference rows that were already there and are left
alone, which on a fresh hosted database is 0 and on a database that has been
loaded before is not.

If you see `update` on a database you believe is fresh, stop and find out why.

---

## 8. Load

- [ ]

```
node scripts/production/showcase.mjs load --confirm-target fggbgeraiadetyiyjlvb --roster "$HOME/Downloads/OULAFC Master Table.xlsx" --termcard "$HOME/Downloads/260720 OULAFC MT26 Term Card v0.xlsx" --params ~/lancers-showcase-params.json
```

**Expect:** `Created <n>, updated 0. Nothing else was touched.` — the same
number `preview` just showed you, with `updated 0`. Anything else means the
database changed between the two commands.

It runs in one transaction. If it fails partway, nothing is written and the
error names the constraint — send it to me rather than retrying blind.

- [ ] Verify:

```
node scripts/production/showcase.mjs verify --confirm-target fggbgeraiadetyiyjlvb --roster "$HOME/Downloads/OULAFC Master Table.xlsx" --termcard "$HOME/Downloads/260720 OULAFC MT26 Term Card v0.xlsx" --params ~/lancers-showcase-params.json
```

**Expect** every line to read `PASS`, ending `Everything reconciles.`

The four that matter most:

- `term-card events that are not draft (0 expected): 0`
- `term-card events carrying an audience (0 expected): 0`
- `notification jobs against showcase invitations (0 expected): 0`
- `live RSVP tokens against showcase invitations (0 expected): 0`

Those four are what say the loader has created nothing that can message anybody.

- [ ] Keep the manifest, which records which workbook cell produced which row.
      It contains no names and no telephone numbers:

```
node scripts/production/showcase.mjs manifest --confirm-target fggbgeraiadetyiyjlvb --roster "$HOME/Downloads/OULAFC Master Table.xlsx" --termcard "$HOME/Downloads/260720 OULAFC MT26 Term Card v0.xlsx" --params ~/lancers-showcase-params.json --out ~/showcase-manifest.json
```

### Stop conditions

| If                    | Then                                                                 |
| --------------------- | -------------------------------------------------------------------- |
| Any `FAIL` line       | Do not run the walkthrough. Roll back (§ 11) and send me the output. |
| `verify` says `STOP.` | Same.                                                                |

---

## 9. Click through, on your own, before Stewart arrives

Sign in at `https://YOUR-CLOUD-RUN-URL/login` as yourself.

- [ ] **Roster** — 42 people. Filter by status: roughly 32 active, 3 inactive,
      3 onboarding, 2 confirmed, 1 carried forward, 1 departed.
- [ ] **A membership** — open one. Positions and kit reflect the workbook.
- [ ] **Events list** — 53 events. The Michaelmas ones are all drafts.
- [ ] **Calendar** — both the Gregorian and Oxford term-card views.
- [ ] **An occurred event** → **Attendance** — a register with present, late,
      excused and absent, and one walk-up on the 15 August field session.
- [ ] **Report** → set the date to `2026-08-17` → **Show report**. Every
      section populates: last week, the chase grid, availability, next week,
      walk-ups, recruitment, onboarding, the week in numbers.
- [ ] Sign out. Sign in as **`+coach`**. You should see the narrow coach
      surface and be refused the roster, approval and the report.
- [ ] Sign out. Sign in as **Stewart** (borrow his password, or set it
      yourself). He should see everything an officer sees.

If any of this is wrong, stop here — it is much better to find it now.

---

## 10. The Monday walkthrough, with Stewart

A suggested order. Roughly twenty minutes.

1. **Sign in together.** Stewart signs in on his own phone or laptop. He is the
   General Manager and the application says so.
2. **Roster.** Show the 42. Open one membership.
3. **Calendar.** Show Michaelmas already in the system, as drafts, straight from
   the term card he wrote.
4. **Last week.** Open the 15 August field session, show the register and the
   walk-up.
5. **The report.** Show the stored 17 August report.
6. **Now change something live.** Open a membership and change its status, or
   correct one attendance record. Go back to the report, press **Show report**,
   and show that a _new version_ reflects the change and the old one is kept.
7. **The invitation.** Open **Leadership Walkthrough** (17 August, draft).
   Confirm the audience — it is you and Stewart, nobody else. Approve it.
8. **His phone buzzes.** Show him the delivery page: the invitation, the job,
   the provider's response.
   - With the club's Utility template, the message carries his RSVP link. Have
     him tap it and answer. Then press **Show report** again and show his answer
     counted. This is the version worth showing.
   - Without it, expect nothing to arrive: `hello_world` was refused with
     `131049` on 17 August, and carries no link even when it is not (§ 0). Say
     so plainly rather than pressing Approve and hoping.
   - The delivery page will say **accepted**, never **delivered** — there is no
     inbound webhook. Accepted is the provider taking the message, not the
     phone receiving it.
9. **What it cannot do.** Worth saying out loud: no reminders, no escalation, no
   email or SMS, no export, no season close.

---

## 11. Afterwards — leave it, or remove it

**Leave it installed** if the club wants to keep looking at it. **This is what
was chosen on 17 August 2026** — the showcase is still in the production
database. Then:

- [ ] Close the relaxed guards, if you opened them. Both were needed to send
      free-form text and neither should outlive the walkthrough
      (§ 0). **Done on 17 August:**

```
gcloud run services update lancers-operations-platform --region REGION --remove-env-vars WHATSAPP_ALLOW_FREE_FORM,WHATSAPP_MESSAGE_MODE
```

- [ ] Put `DELIVERY_DEFAULT_CALLING_CODE` back to `44`, or remove it — § 0.
- [ ] Take the token out of the service. It has expired by now regardless: the
      console token lasts under an hour, so leaving it configured only means the
      delivery page reports `190` rather than reporting nothing configured.

```
gcloud run services update lancers-operations-platform --region REGION --remove-env-vars WHATSAPP_TEMPLATE_PARAMETERS --update-secrets WHATSAPP_ACCESS_TOKEN=whatsapp-access-token:latest
```

- [ ] Decide whether the role assignments should still end on `accessEndsOn`.
- [ ] Note that `AGENTS.md` and `docs/pilot-data-runbook.md` still say real
      roster data is prohibited in every environment. Production now holds 42
      real students' names by your decision of 15 August. Until those two are
      reconciled, an agent reading them will refuse work that touches this data.
      That reconciliation is yours; it is governance-protected.

**Remove it** — what LAN-86 expects until the real-data gate passes, and not
what was chosen:

```
node scripts/production/showcase.mjs rollback --confirm-target fggbgeraiadetyiyjlvb --roster "$HOME/Downloads/OULAFC Master Table.xlsx" --termcard "$HOME/Downloads/260720 OULAFC MT26 Term Card v0.xlsx" --params ~/lancers-showcase-params.json
```

**Expect** a table of removed rows and `Removed <n> rows.`, where `<n>` matches
what the load created. Then: `Audit history and approved identities are
untouched.`

It deletes only identifiers it computed itself. It cannot remove a row it did
not create, because it cannot name one. Running it twice is safe — the second
run removes 0.

### If it refuses instead

**This is the normal case after a walkthrough, not a fault.** You will see:

```
STOP. Rows this loader did not create are attached to rows it did:

      1  public.notification_jobs.invitation_id → public.invitations   (for example …)
      2  public.audit_events.actor_person_id → public.people           (for example …)

Nothing was deleted.
```

Approving the event, sending the message, taking Stewart's answer and pressing
**Show report** all wrote rows the _application_ created. Some of them the
database refuses to orphan; two it would silently delete. Rollback stops rather
than doing either.

- [ ] Keep any evidence you want from those rows first — the report snapshot,
      the delivery record.
- [ ] Then re-run the same command with `--force` on the end, which removes them
      deliberately along with the showcase:

```
node scripts/production/showcase.mjs rollback --force --confirm-target fggbgeraiadetyiyjlvb --roster "$HOME/Downloads/OULAFC Master Table.xlsx" --termcard "$HOME/Downloads/260720 OULAFC MT26 Term Card v0.xlsx" --params ~/lancers-showcase-params.json
```

`--force` prints how many attached rows it is removing before it removes them.

**What it never removes**, with or without `--force`: reference rows it adopted
rather than created, and any Person or operator link that already existed before
the load.

### Three tables `--force` cannot remove either

If the walkthrough produced an availability change, an RSVP answer, or an
operator link, `--force` stops with:

```
permission denied for table availability_statuses
```

— or `rsvp_responses`, or `operator_accounts`. **This is the schema working, not
a bug in the loader.** Those three tables are append-only: the application's
database login is granted `select, insert` and no `delete`, deliberately, so
that "revoke an operator" or "correct an answer" cannot be implemented by a
future maintainer as a delete. `supabase/migrations/20260811090000_operator_accounts.sql`
says exactly that in a comment. The loader connects as that same login and
inherits the same refusal.

Nothing is deleted when this happens — the whole rollback runs in one
transaction.

**To finish a removal**, delete those rows first, by hand, in the Supabase
dashboard's **SQL editor**, which runs as an owner rather than as the
application:

- [ ] `~/showcase-manifest.json` holds every row identifier the loader created,
      with no names and no telephone numbers in it. The parents you need are the
      `season_memberships` (for availability), the `invitations` (for RSVP
      answers) and the `people` (for operator links).
- [ ] **List before you delete**, every time — run the `select` first, read the
      count, and only then change `select *` to `delete`:

```sql
select * from public.availability_statuses where season_membership_id = any (array[...]::uuid[]);
select * from public.rsvp_responses          where invitation_id        = any (array[...]::uuid[]);
select * from public.operator_accounts       where person_id            = any (array[...]::uuid[]);
```

- [ ] Then re-run `rollback --force`, which now succeeds.

**Why this is not fixed in the loader.** The two available fixes are to grant
the application `delete` on three append-only tables — which is the exact thing
the schema comment forbids, permanently, to make a demonstration easier — or to
give the loader its own owner-level credential. The second is right and is not a
one-line change: the target guard pins the connection to `app_runtime` on
purpose, and loosening it is a security change that deserves its own review
rather than a footnote in a runbook.

- [ ] Confirm:

```
node scripts/production/showcase.mjs verify --confirm-target fggbgeraiadetyiyjlvb --roster "$HOME/Downloads/OULAFC Master Table.xlsx" --termcard "$HOME/Downloads/260720 OULAFC MT26 Term Card v0.xlsx" --params ~/lancers-showcase-params.json
```

After a rollback the counts read 0, which is correct — you are checking nothing
was left behind.

**Auth users are not removed by rollback.** Deleting them is a dashboard action
and yours to decide.

---

## 12. If something goes wrong

| Problem                                     | What to do                                                                                                                                                                                                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Message does not arrive                     | Check the delivery page's failure reason first. `132000` means the template's parameters do not match — check `WHATSAPP_TEMPLATE_PARAMETERS`. `131030` means the recipient is not verified in Meta. "approved list of recipients" means your allowlist is wrong. |
| The page says accepted, and nothing arrives | `131049`. Meta took the message and dropped it: the per-recipient throttle on **marketing** templates, which is what the sample template is. A Utility template is not throttled this way. There is no retry that helps. § 0.                                    |
| `190`, or every send fails at once          | The token expired — it lasts under an hour. Add a new version **and roll a revision**; § 4's `--update-secrets` line does the second half. § 0.                                                                                                                  |
| `permission denied for table …`             | Three append-only tables cannot be deleted by the application, by design. § 11 "Three tables `--force` cannot remove either". Nothing was deleted.                                                                                                               |
| Application is broken                       | `gh workflow run deploy.yml -f image_tag=<previous-commit-sha>`. Safe — no schema changed.                                                                                                                                                                       |
| Data is wrong                               | Roll back (§ 11), fix, load again. It is idempotent.                                                                                                                                                                                                             |
| Rollback refuses                            | Expected after a walkthrough — see § 11 "If it refuses instead". Nothing was deleted.                                                                                                                                                                            |
| Live edits vanished after a reload          | Re-running `load` rewrites loader-owned rows, so it reverts what you changed in § 10 step 6. Roll back and reload only when you no longer need those edits.                                                                                                      |
| Something is very wrong                     | Restore the § 5 backup. That is what it is for.                                                                                                                                                                                                                  |

---

## 13. Evidence worth keeping

- [ ] The `preflight`, `verify` and `rollback` output (no personal data in any
      of them)
- [ ] `~/showcase-manifest.json`
- [ ] A screenshot of the report before and after your live change
- [ ] A photo of Stewart's phone showing the message
- [ ] Whether you left it installed or rolled it back, and when

---

## What is still true afterwards

Real roster data in the hosted database **precedes the LAN-86 gate**, which
`AGENTS.md` and `docs/pilot-data-runbook.md` still describe as prohibited. You
authorized this explicitly on 15 August 2026 for this walkthrough. That is a
recorded owner decision overriding a written policy — not an oversight — and the
documents should be reconciled with what is actually in the database, or the
next agent will read them and refuse.
