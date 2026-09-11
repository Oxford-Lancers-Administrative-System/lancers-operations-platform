# Local messaging test panel — LAN-222, SMS on LAN-330

Use the normal local app to create people, events and recruitment/onboarding
work. Open the separate testing panel to see what sends, to whom, at what time,
and whether it was intercepted or actually sent. This panel never runs in the
production application. LAN-263/286/287/288 remain separate application work.

## SMS on Twilio — LAN-330

This branch carries every message as a text through Twilio. There is no
WhatsApp code path on it. The panel, shared clock, per-person routing,
simulated receipts and manual audit index are LAN-222's, unchanged in shape;
the channel column reads `sms`, and the message dialog shows the exact text
sent, its sender and its character count.

### Private settings

Brian puts the Twilio values in `.env.test-box.local` in this worktree, by
hand, never in chat, a commit or an issue:

```
TWILIO_ACCOUNT_SID=
TWILIO_API_KEY_SID=
TWILIO_API_KEY_SECRET=
TWILIO_AUTH_TOKEN=            # callback signature validation only
TWILIO_ALPHA_SENDER=OxfLancers
TWILIO_FROM_TOLL_FREE=        # +1..., leave empty until toll-free verification clears
```

`configure.mjs --sink` writes stubs for all six into `.env.local` (the sink
never reaches Twilio; the stub toll-free number lets a +1 tester be intercepted
before verification clears). `configure.mjs --sms` copies the private values in
and points `APP_BASE_URL` at the tunnel; run it and restart the app before any
real send, because a real status callback is verified against the real Auth
Token. While `TWILIO_FROM_TOLL_FREE` is empty, a +1 destination is refused with
"US sender not verified yet", never sent from the alphanumeric sender.

### Senders and callbacks

`From` is chosen by destination: the toll-free number for +1, `OxfLancers` for
everything else. Every message carries `StatusCallback` =
`APP_BASE_URL/api/webhooks/twilio?kind=<message kind>`. The route verifies
`X-Twilio-Signature` over that exact URL, so `APP_BASE_URL` must be the tunnel
origin whenever real messages are sent; the loopback host the app itself sees
is never used for the signature. `queued` and `sent` are stored as evidence;
`delivered` becomes Delivered and `undelivered`/`failed` become Failed with
Twilio's error code in the reason. Simulated receipts for intercepted people
post the same signed form to the same route.

### Start

```bash
npm ci
npm run db:start -- --test-box
node scripts/test-box/configure.mjs --sink
node scripts/test-box/app.mjs
node scripts/test-box/panel-server.mjs
.lancers-runtime/bin/ngrok http http://127.0.0.1:<leased port> --url=https://marvel-indiscernible-daxton.ngrok-free.dev --inspect=false
```

The tunnel now forwards to this worktree's leased port, not LAN-222's 3101.

### Texts

All fourteen kinds are rendered by `SMS_BODIES` in `src/lib/delivery/templates.ts`
and measured by `sms-budget.test.ts`, which fails on any non-GSM-7 character or
a third segment. A Yes or No answer link is 114 characters on the production
host, so invitation, reminder and the recruit follow-up carry 240 characters of
links and about 66 of copy; the deadline and the attending count are on the
page each link opens rather than in the text.

## Owner walkthrough

The agent starts both processes and provides their addresses. The app currently
uses `http://localhost:3101`; the panel binds an automatically allocated loopback
port, saved in `.lancers-runtime/panel-runtime.json`. Neither requires the owner
to run setup commands once the environment is ready.

1. In **People**, find a person. Identify them as synthetic or real. Delivery
   defaults to **Intercept locally**, including for routable phone numbers.
2. For a synthetic person choose a response profile: prompt (one minute after
   simulated delivery), late (chosen hours), or non-responder. Choose attending
   or not attending for events, and all/partial/minimum/no event question answers. Save.
3. In the normal app, create/approve an event or start a recruitment/onboarding
   workflow. The panel processes due messages every ten seconds.
4. In **Message timeline**, filter by person or event. Inspect the actual
   captured values rendered into the owner-supplied submission text, buttons,
   destination, planned time, actual capture time and delivery result.
5. **Process due now** runs the normal scheduler. **Advance time** moves the
   shared test clock through each next due job and response, including onboarding
   chases not yet materialized as jobs. After the first advance time stays paused
   between advances; real wall time remains separate.
6. **Responses** shows scheduled and completed synthetic event RSVP and question actions. These
   call the same token-resolving application services as the forms; they are not
   chatbot replies. Real people are never answered for automatically.
7. **Workflow checklist** independently reconstructs event invitation/reminder
   rungs from frozen approval plans. It can identify missing jobs, due unsent
   work, failures, reminders after an answer, and correctly cancelled reminders.
   Other workflow families retain an explicit owner checklist; they are not
   automatically marked passed from captured messages alone.

Partial completion preserves existing answers: half of missing onboarding detail
fields, two football-background answers, half of event questions, or the recruit
required name/mobile set plus college. Minimum follows the app's required fields
and player checklist steps. “All” additionally supplies optional recruit fields
and the optional football-background note. Office-verified onboarding items
remain outstanding until the office acts; claiming BUCS/Hudl is not verification.
Synthetic missing-field samples use `example.test` addresses and the reserved
07700 900999 emergency contact. Existing contact destinations are preserved.

## Start and operate

From the LAN-222 worktree with its own database lease:

```bash
npm ci
npm run db:start -- --test-box
node scripts/test-box/configure.mjs --sink
node scripts/test-box/app.mjs
```

In another terminal in that worktree:

```bash
node scripts/test-box/panel-server.mjs
```

The reduced database profile retains PostgreSQL, Auth, PostgREST, Kong and local
mail, omitting optional services to fit alongside other stacks. It does not prove
Storage/Realtime/Edge Functions. Existing lease and local-target guards apply.
Do not run the older standalone ticker alongside the panel.

At Brian's request, the local test apparatus permits new valid phone and email
destinations without a recipient allowlist refresh. The development-only hook
checks the local database and process before bypassing recipient membership.
Unselected WhatsApp recipients and all emails remain intercepted; actual
WhatsApp delivery requires explicit per-person selection in the panel. Normal
configuration and eligibility checks still apply. Production restrictions and
LAN-287 are unchanged.

Import the actual owner submission records for readable previews:

```bash
node scripts/test-box/import-submissions.mjs /path/to/templates.json /path/to/onboarding-six.json
```

Later corrected records supersede earlier records by name. Production and held
records are excluded. This is private local presentation data, not a replacement
production manifest. LAN-286 owns the canonical manifest integration. The panel
flags differences between submitted parameter meanings/button counts and the
current sender; actual test egress refuses mismatched contracts. Meta approval
is not inferred from submission records.

## Clock and evidence boundaries

`next dev` can replace one inert seam module with local hooks. Turbopack's built-in
development/node conditions exclude that loader from production builds; the
production seam reads no flag or private configuration. Application SQL and the
small number of messaging Date calls use test time only through this seam.
Authentication timing, network timeouts and scheduler execution budgets use wall
time.

On first advancement the apparatus temporarily instruments timestamp defaults
and time-dependent views/functions in the leased local database. Each expression
uses a transaction-local setting and otherwise falls back to the original wall
clock. No shared migration, grant, RLS setting, club entity or historical row is
changed. Original definitions and exact installed forms are saved privately in
`clock-schema.json`; drift refuses automatic overwrite. Advancement waits for
in-flight app transactions. A failed action leaves the current boundary intact.

Captured WhatsApp messages use the real sender and local sink. Simulated delivery
is applied through the normal signed **local** webhook and confirmed against
`delivery_results`. Accepted without delivery remains accepted. Real provider
records never receive simulated receipts. Raw capture and simulated-action files
are private, mode 0600, and never committed or put in issue comments.

Real recipient selection requires a real identity, a current confirmed number,
the configured test tunnel and matching template contracts. A changed number
reverts to interception. The test token stays in `.env.test-box.local`, which is
read server-side only for explicitly selected actual sends. There are no real
email sends. Real-phone acceptance still requires approved templates and an
actual Meta Delivered callback; local simulation is not that proof.

## Verification, restart and reset

Stop the panel and app before the full test suite, schema work or database reset.
The full suite requires a clean synthetic seed: an advanced run legitimately
contains future-dated answers, which the seed-integrity tests must reject. Save
the active local public schema/data with a private PostgreSQL snapshot, retain
its private configuration and panel evidence, and use the fenced `db:seed` for
verification. Restore that snapshot afterwards. Never retimestamp real test
history to satisfy a seed test. This backup/reseed/restore is agent setup work,
not an owner operation in the panel.

Restore instrumentation before taking that snapshot or checking the schema:

```bash
node --input-type=module -e 'import {restoreDatabaseClock} from "./scripts/test-box/database-clock.mjs"; await restoreDatabaseClock()'
node scripts/test-box/verify.mjs
```

Restart the app/panel after verification. If an advanced clock is being resumed,
prepare its database instrumentation before starting the app:

```bash
node --input-type=module -e 'import {prepareDatabaseClock} from "./scripts/test-box/database-clock.mjs"; await prepareDatabaseClock()'
```

A fresh run uses the existing fenced `npm run db:reset`, recreates local review
login and synthetic data, then reconfigures the sink. Clear that worktree's old
panel-state, clock-schema, capture and response files only after the reset has
succeeded. Never reset another worktree or a hosted database. The agent owns this
reset/setup procedure; there is no destructive reset button in the owner panel.

The older `fast-forward.mjs` remains a diagnostic queue-shift command. It is not
the shared clock and must not be mixed into an active panel run. The legacy
`count.mjs` counts only legacy sink files; use the panel for integrated transport
records. No repository PR, production deployment, Meta approval or owner visual
acceptance is implied by a successful local walkthrough.

## Small local walkthrough (LAN-297)

Brian approved replacing the LAN-222 local dataset on 10 September 2026 with 15
synthetic people (13 established active players, a President and a Head Coach),
13 usable fictional phone numbers, and 12 draft events over eight weeks. Ten
events are mandatory and two optional. The General Manager is also a player.
Escalations go to the President. Recruitment and onboarding forms are always
manual; automatic responses are limited to event RSVPs and event questions.

The dedicated `scripts/test-box/seed-small.mjs --replace-local-data` command
requires this worktree’s lease and stopped app/panel processes. It privately
archives the old public data and capture evidence, preserves the local login
links and static configuration, replaces domain rows in a transaction, and
resets simulator identities/time. It is separate from the standard test-suite
seed. Run `configure.mjs --sink` afterwards and restart the test app. Audiences
are prepared with `saveEventAudience`; approval is left to the manual tester.
The local HTML guide and manifest are under `.lancers-runtime/small-squad/`.
Standard `db:start`, `db:reset` and `db:seed` restore the large general-purpose
dataset; do not run those during this walkthrough. New valid contacts work in
the local simulator without refreshing recipient allowlists.

## Public access through the provisioned tunnel (LAN-222)

The owner-provisioned app origin is
`https://marvel-indiscernible-daxton.ngrok-free.dev`. It forwards to this test
box's app on `http://127.0.0.1:3101`; the control panel remains local.
`APP_BASE_URL` is set to that public origin so newly generated links work for
remote testers. Existing captured message bodies are historical evidence and
are not rewritten. A sink-mode contact refresh preserves this exact approved
public origin, without selecting actual WhatsApp delivery.

The installed ngrok 3.19 agent was rejected by the account's minimum-version
requirement. An updated private copy lives in `.lancers-runtime/bin/ngrok`
(version 3.39.11 at setup). Start the tunnel with:

```bash
.lancers-runtime/bin/ngrok http http://127.0.0.1:3101 \
  --url=https://marvel-indiscernible-daxton.ngrok-free.dev --inspect=false
```

The existing machine-local ngrok configuration supplies authentication. No
credential belongs in this document or command. Keep the app, tunnel and
computer running while testers use it. Operator access still requires an
existing login; personal forms use their normal scoped links. Public access
alone does not provision operator accounts or enable actual message sending.
The exact ngrok hostname is allowed for development assets only when the local
test-box process is enabled; no wildcard origin was added.

Public verification: login page and JavaScript assets returned 200; submitting
an empty login form returned the expected validation; unauthenticated operator
access redirected to login. Person-specific remote submission remains an owner
walkthrough check; no existing private form token was transmitted for agent QA.

## Mixed synthetic and real local roster reset (LAN-222 / LAN-297)

When real panel identities exist, the small-squad reset requires
`--replace-local-data --preserve-real-people`. It archives the completed run and
preserves their person IDs, names, person fields, aliases and contact rows in the
same reset transaction. It clears workflow history for the new season. Real
identities remain real, with actual delivery intercepted and automatic responses
disabled. Add their new-season player memberships through normal roster intake;
leave missing facts and onboarding items for humans to complete. Onboarding
players do not automatically qualify for the active-player event audience.

## Sender alignment for real-phone testing (LAN-286 / LAN-263)

The sender now follows the owner-supplied test submission records for all 14
message kinds: ordered body parameters, zero/one/two URL buttons, and the
escalation event ID as the query suffix. Parameterless recruitment reminders
omit the body component. Onboarding welcome/chase carry one personal-page
button; recruitment retains its form and Stop messages pair. Cancellation
WhatsApp parameters exclude the private cancellation reason. This is payload
alignment, not proof of current Meta approval or successful phone delivery.

`configure.mjs --whatsapp` prepares matching outbound and webhook settings from
the private local configuration. Email remains configured for intercepted
capture, and real phone routing still requires explicit per-person selection.
Restart both app and panel after changing configuration so simulated receipts
and the app share the same signing configuration. Do not dispatch questionnaires
as a configuration check; Brian triggers the first real recruitment send.

On 11 September, 210 targeted unit tests and type checking passed, and local
comparison matched all 14 saved submission records. Automatic approval review
blocked credential-backed Meta reads and activation of the real credential
configuration; those steps remain pending owner authorization. No live Meta
approval/subscription verification or actual phone-delivery proof is claimed.

### Real-test activation — 11 September 2026

After explicit owner authorization, local WhatsApp mode was configured and both
processes restarted. The real credential, phone ID and webhook secret match the
private test settings. Local and public empty signed webhook probes returned
200; Meta confirmed phone access and a valid token. No WhatsApp message was sent.
The app-subscriptions read returned no WhatsApp Business Account subscription.
Brian must configure the Meta callback to the provisioned test origin's
`/api/webhooks/whatsapp`, using the existing local verification token, and
subscribe to `messages` before real delivery receipts can be observed. Approval
of templates alone does not configure that callback. Live template readback was
not available from the token's granular account scopes; the payload proof remains
a comparison against the owner-supplied submission records.

### Real delivery diagnosis — 11 September 2026

The app-level callback and `messages` field subscription were active, but a
read of the actual WABA's `subscribed_apps` returned an empty list. This separate
account subscription was missing. The previously approved test setup was
completed by subscribing OULAFC Test App, and readback confirmed it present.
Both checks are required for readiness; an empty signed webhook probe alone
proves reachability, not Meta-to-account event forwarding.

Live template readback now confirms all 14 test templates are approved with
language `en`, including the recruitment welcome classified as MARKETING. The
local test configuration uses `en` rather than `en_GB`.

After Brian explicitly authorized one questionnaire retry, Meta accepted the
request and then sent a signature-verified `failed` callback with error 131049.
The application matched and applied it to attempt 2; the panel now shows Failed.
The original attempt has no recorded receipt. Error 131049 establishes a Meta
marketing-delivery refusal, but is not uniquely specific to the US pause.
Private diagnostic evidence is in `.lancers-runtime/brian-delivery-diagnosis.json`.
No other recipient was messaged by this diagnostic.

## Analysis handoff — 11 September 2026

Brian paused the session for analysis and requested the work be saved on
`feat/lan-222-test-box`, referenced from LAN-222. This is a work-in-progress
checkpoint, not production readiness or completion of the QA issues. LAN-297
(the small-squad environment) is a child of LAN-222. LAN-291 groups the QA
findings; LAN-308 evaluates messaging alternatives for worldwide recipients.

The final owner-authorized Utility diagnostic used the existing approved
`lancers_event_cancellation_test` template, explicitly labelled as a test, to
the same US recipient whose recruitment Marketing template failed with 131049.
Meta returned a delivered callback for that single Utility message. This proves
the number can receive this Utility template; it does not prove unrestricted
Marketing delivery or general recruitment readiness.

The app and panel were stopped to freeze the run. The local database retains
four real recruits and 15 synthetic people, with 12 draft events. All four real
contacts are current from 11 September; template language is `en`. The active
Meta account subscription points to OULAFC Test App. No production database or
production app deployment was changed.

Private state remains in the worktree's ignored `.lancers-runtime/` directory:
`analysis-handoff-database.json` is the final database snapshot;
`brian-delivery-diagnosis.json` records the Marketing failure;
`utility-probe-result.json` and the database retain the Utility diagnostic;
`transport-evidence/`, `small-squad/` and its archives retain earlier captures
and reset snapshots. Credentials remain in ignored environment files. None of
these private files is part of the branch push. The database clock remains
instrumented for this local simulation; follow the existing clock restoration
procedure before schema work or general database tests.

Restart the preserved run with `node scripts/test-box/app.mjs` and
`node scripts/test-box/panel-server.mjs`. Read the new panel URL from
`.lancers-runtime/panel-runtime.json` and regenerate the HTML guide with
`node scripts/test-box/build-small-guide.mjs`. Do not run a database reset to
resume this saved state. The generic small-squad reset preserves identities
but defaults real delivery back to interception and does not recreate the
four recruitment records; inspect those settings explicitly after any future
reset. Rewinding simulation time must also account for preserved contact
validity dates.

Checkpoint verification: 243 targeted delivery/test-box unit tests passed,
type checking passed, and changed-file formatting and lint checks passed.
Full `npm run verify`, a fresh database rebuild, and production build were not
run for this analysis checkpoint. It is not merge-ready evidence.
