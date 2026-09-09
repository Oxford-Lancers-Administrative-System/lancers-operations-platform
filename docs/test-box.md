# Messaging test box — LAN-222

This apparatus runs the existing application on a leased local Supabase stack.
It adds no application sending policy, changes no hosted setting, and does not
deploy anything. Application corrections, including LAN-263's onboarding button
fix, remain dependencies of the affected real-phone tests.

## Start the local sink

Run from the LAN-222 worktree, which must hold its own database lease:

```bash
npm ci
npm run db:start -- --test-box
node scripts/test-box/configure.mjs --sink
npm run dev:slot
```

The test-box profile keeps PostgreSQL, Auth, PostgREST, the API gateway and local
mail. It omits optional services to fit alongside other stacks. It does not
prove Storage, Realtime, Edge Functions or Studio behavior. Normal lease checks,
health checks, migrations, synthetic seeding and review-account setup still run.
`npm run db:status` prints this lease's ports. LAN-222's current application port
is 3101; the local database is 56342. The app is not automatically started by
`db:start`.

The sink configuration reads the seeded contacts for the application's existing
recipient lists, uses placeholder provider credentials, and assigns all registry
templates their `_test` names with language `en_GB`. Its loopback base URL selects
the existing local sink. No Meta credentials or internet connection are needed
for message delivery in this mode. Adding new contacts requires rerunning sink
configuration and restarting the app so its recipient lists include them.

Sign in at the printed `/login` URL with the existing local review account. Its
password remains in protected machine-local state. No new hosted user is created.

## Advance a queued event ladder

Approve a synthetic event with a small synthetic audience. Keep the ticker
stopped while inspecting and advancing schedules. Copy the event UUID from its
local URL and substitute it below:

```bash
node scripts/test-box/fast-forward.mjs --hours 24 --event EVENT_UUID --dry-run
node scripts/test-box/fast-forward.mjs --hours 24 --event EVENT_UUID
node scripts/test-box/count.mjs
```

The dry run rolls back all changes and sends nothing. The actual command moves
unfinished jobs' scheduled/retry times and the selected event's frozen invitation,
recruit follow-up and escalation anchors back by the given hours. It then POSTs
one authenticated sweep to this lease's loopback application. It does not change
event dates, response deadlines, completed jobs or delivery evidence. A processing
job in the selected scope or a competing database writer causes a refusal.

Omitting `--event` selects all jobs and approved-event plans in the local database,
including recruit-cycle jobs. Seeded processing examples can cause that broad
operation to refuse; prefer one event when testing an event ladder. The subsequent
sweep is the application's normal global sweep, not an event-filtered dispatch.
Other due synthetic jobs can therefore send to the local sink as well.

A sweep failure after the transaction commits does **not** undo the shift. The
command says so: inspect delivery, then resume the ticker; do not repeat the time
shift to retry dispatch. Existing recipient restrictions, consent checks,
retry rules and message caps still apply.

For normal wall-clock operation, use a second terminal:

```bash
APP_BASE_URL=http://127.0.0.1:3101 npm run messaging:ticker
```

Use the port assigned to the worktree if it differs. The override applies only
to the ticker process. The ticker never follows redirects away from its local
target. Stop it with Ctrl-C before another fast-forward operation.

## What the count proves

The counter reads accepted sink records from `.lancers-runtime/delivery-sink/`.
It reports recipient address, channel, kind, count, and first/last timestamp.
Malformed records and duplicate provider IDs refuse the report instead of silently
undercounting. It displays no message bodies or bearer-link tokens.

These are local acceptances, not evidence of real phone delivery. Phone and email
addresses are counted separately; the tool does not infer that two addresses
belong to one person. The current sink labels all email records as invitations,
so the counter explicitly reports them as `unclassified_email` rather than
claiming an incorrect breakdown by kind. Use only synthetic counts in issue evidence.

## Known limits of advancing time

This is a queue-shifting tool, not an application-wide simulated clock. Onboarding
declares its next chase from membership join time or the last actual delivery
time; those facts are deliberately preserved. It cannot compress the full
onboarding chase cycle into minutes. Use the existing seeded mid-chase/exhaustion
scenarios to inspect those states. A complete accelerated onboarding cycle needs
a separately agreed test-clock mechanism; do not rewrite completed evidence to
make the test appear to pass.

## Prepare the real WhatsApp test

Keep real values only in the owner-readable, git-ignored `.env.test-box.local`:

```dotenv
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
DELIVERY_RECIPIENT_ALLOWLIST=
# Optional email fallback, all three needed together:
EMAIL_API_KEY=
EMAIL_FROM_ADDRESS=
DELIVERY_EMAIL_ALLOWLIST=
```

The phone ID identifies the registered sender. The access token authorizes sends;
the test app's App Secret verifies webhook signatures. The verify token is a
separate value chosen locally; configuration generates it if absent. The current
application still requires explicit recipient lists: enter only the owner-approved
test phones/emails. Their removal is an application change, not part of this apparatus.

`db:start` generates `.env.local`; the private staging file above survives it.
Configuration writes the runtime file but does not start the app or send messages.
The existing token must be copied privately into this staging file before real mode
can be configured. Never paste a token or App Secret in Linear, a PR or chat.

After the relevant Meta templates are approved and the application payloads match
them, stop the app and ticker, then run:

```bash
node scripts/test-box/configure.mjs --whatsapp
npm run dev:slot
ngrok http 3101 --url=marvel-indiscernible-daxton.ngrok-free.dev
```

The app uses `https://marvel-indiscernible-daxton.ngrok-free.dev` for its links.
Configure the **test app's** callback as:

```text
https://marvel-indiscernible-daxton.ngrok-free.dev/api/webhooks/whatsapp
```

Brian enters the runtime file's verify token in Meta and subscribes the correct
WhatsApp business account to messages. App publication alone does not configure
that subscription. Meta configuration and live phone tests remain owner actions.
Use the ticker's loopback override above. A real-mode fast-forward additionally
requires `--real-messages`; otherwise it refuses before changing the database.

Run the same small scenarios on the approved test phones. Confirm actual receipt,
correct buttons and callbacks changing Accepted to Delivered. The counter cannot
prove this; real-mode sends do not write sink records. Do not assume a Read display
exists merely because Meta supplies a read callback.

## Stop and reset

For repository verification while this worktree has sink or real-test settings:

```bash
node scripts/test-box/verify.mjs
```

This runs the complete `npm run verify` with messaging settings cleared in the
child process, so tests receive their own fixtures rather than the app's `_test`
names, tokens or configured origin. It preserves the leased database settings and
uses two workers to limit resource pressure. Neither `.env.local` nor the running
app changes. All verification stages and both test projects still execute.

Stop the ticker, ngrok and app processes first. For a clean synthetic database:

```bash
npm run db:reset
node scripts/test-box/configure.mjs --sink
```

Archive or remove this worktree's old sink transcripts privately when beginning a
new count session; resetting the database does not delete those files. The counter
otherwise counts every surviving transcript. Preserve the private staging file.
Lease release and worktree cleanup belong to the normal issue closeout procedure.
