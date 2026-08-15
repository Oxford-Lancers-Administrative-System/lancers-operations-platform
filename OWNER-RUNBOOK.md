# Owner runbook — the Monday showcase

**For Brian. Monday 17 August 2026.** Everything here is yours to run; no agent
does any of it. Work top to bottom and tick as you go.

Every command is one line. Copy it whole.

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

**Optional, and the only thing with a queue.** If you want Stewart to _tap a
link and answer_, rather than just receive a message, create the club's own
template now:

- [ ] Meta dashboard → **Manage templates → Create**. Name
      `lancers_event_invitation`, language **English (UK)**, category
      **Utility**. Body, exactly four variables, and it **must not end on a
      variable** or Meta rejects it:

      Hi {{1}}, the Oxford Lancers have {{2}} on {{3}}. Please tell us whether you can make it: {{4}} — thanks, Lancers.

Utility templates usually clear in minutes. If it has not cleared by Monday, use
`hello_world` instead — § 4 covers both, and they are one environment variable
apart.

### 2b. Supabase Auth — three users

Supabase dashboard → **Authentication → Users → Add user**. Create each with a
password you choose. **Confirm the email** on each one.

- [ ] `brian.daniel.schuster@gmail.com` — you, if it does not already exist
- [ ] Stewart's email address
- [ ] `brian.daniel.schuster+coach@gmail.com` — the coach seat

Copy each user's **UUID** from the dashboard. You need all three in § 3.

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
> application, including role management — which nobody held before, meaning
> nobody could add an operator through the app at all. Whoever holds it can
> grant themselves anything, so it is time-bounded here on purpose.

---

## 4. Configure the deployed application

All of this is Cloud Run and Secret Manager. Replace `PROJECT` and `REGION` with
your own.

- [ ] Put the Meta token in Secret Manager. **Do not paste it into a file, a
      commit, Linear, or a prompt.** This reads it from your clipboard via a
      prompt, so it never lands in shell history:

```
read -rs -p "Meta token: " T && printf '%s' "$T" | gcloud secrets versions add whatsapp-access-token --data-file=- && unset T
```

If the secret does not exist yet:

```
read -rs -p "Meta token: " T && printf '%s' "$T" | gcloud secrets create whatsapp-access-token --data-file=- && unset T
```

- [ ] Set the rest. **`DELIVERY_RECIPIENT_ALLOWLIST` is the control that stops
      the application messaging the 42 real students** — put only your number
      and Stewart's in it:

```
gcloud run services update lancers --region REGION --update-env-vars APP_BASE_URL=https://YOUR-CLOUD-RUN-URL,WHATSAPP_PHONE_NUMBER_ID=YOUR-TEST-NUMBER-ID,WHATSAPP_TEMPLATE_NAME=hello_world,WHATSAPP_TEMPLATE_LANGUAGE=en_US,WHATSAPP_TEMPLATE_PARAMETERS=none,"DELIVERY_RECIPIENT_ALLOWLIST=+447xxxxxxxxx,+447yyyyyyyyy"
```

**If the club's own template cleared approval**, use these three instead of the
`hello_world` trio above — same command, same everything else:

```
WHATSAPP_TEMPLATE_NAME=lancers_event_invitation,WHATSAPP_TEMPLATE_LANGUAGE=en_GB,WHATSAPP_TEMPLATE_PARAMETERS=invitation
```

- [ ] Point the secret at the service:

```
gcloud run services update lancers --region REGION --update-secrets WHATSAPP_ACCESS_TOKEN=whatsapp-access-token:latest
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
   - With `hello_world`, the message is Meta's boilerplate and carries **no
     link**. Say so plainly — it proves the path, not the RSVP loop.
   - With the club's template, the message carries his RSVP link. Have him tap
     it and answer. Then press **Show report** again and show his answer
     counted.
9. **What it cannot do.** Worth saying out loud: no reminders, no escalation, no
   email or SMS, no export, no season close.

---

## 11. Afterwards — leave it, or remove it

**Leave it installed** if the club wants to keep looking at it. Then:

- [ ] Remove the Meta token, which expires in 24 hours anyway:

```
gcloud run services update lancers --region REGION --remove-env-vars WHATSAPP_TEMPLATE_PARAMETERS --update-secrets WHATSAPP_ACCESS_TOKEN=whatsapp-access-token:latest
```

- [ ] Decide whether the role assignments should still end on `accessEndsOn`.

**Remove it** — the default, and what LAN-86 expects until the real-data gate
passes:

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

| Problem                            | What to do                                                                                                                                                                                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Message does not arrive            | Check the delivery page's failure reason first. `132000` means the template's parameters do not match — check `WHATSAPP_TEMPLATE_PARAMETERS`. `131030` means the recipient is not verified in Meta. "approved list of recipients" means your allowlist is wrong. |
| Application is broken              | `gh workflow run deploy.yml -f image_tag=<previous-commit-sha>`. Safe — no schema changed.                                                                                                                                                                       |
| Data is wrong                      | Roll back (§ 11), fix, load again. It is idempotent.                                                                                                                                                                                                             |
| Rollback refuses                   | Expected after a walkthrough — see § 11 "If it refuses instead". Nothing was deleted.                                                                                                                                                                            |
| Live edits vanished after a reload | Re-running `load` rewrites loader-owned rows, so it reverts what you changed in § 10 step 6. Roll back and reload only when you no longer need those edits.                                                                                                      |
| Something is very wrong            | Restore the § 5 backup. That is what it is for.                                                                                                                                                                                                                  |

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
