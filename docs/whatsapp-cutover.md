# WhatsApp, email and scheduler cutover — owner runbook

LAN-168's remaining items, in click/paste form. Item 0 — wiring
`WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `SCHEDULER_TRIGGER_TOKEN`,
`EMAIL_API_KEY`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME`,
`WHATSAPP_TEMPLATE_LANGUAGE`, `EMAIL_FROM_ADDRESS` and the Cloud Scheduler job
into `deploy.yml` — is this
pull request; everything below it is Brian's, run against the hosted project,
never an agent's. No command here prints a secret value: presence is checked,
never contents. See [`docs/deployment.md`](deployment.md) for what each
variable does and why it is shaped this way.

## What is already done, as of 2026-09-14

**All eight Secret Manager secrets exist and are bound** to the Cloud Run
runtime service account: `supabase-secret-key`, `database-url`,
`club-link-secret`, `whatsapp-access-token`, `whatsapp-app-secret`,
`whatsapp-webhook-verify-token`, `scheduler-trigger-token`, `resend-api-key`.

**Five repository variables are set:** `WHATSAPP_PHONE_NUMBER_ID`,
`EMAIL_FROM_ADDRESS`, `RECRUITMENT_WHATSAPP_GROUP_LINK`,
`PLAYER_WHATSAPP_GROUP_LINK`, `HUDL_JOIN_LINK`. `WHATSAPP_TEMPLATE_NAME` and
`WHATSAPP_TEMPLATE_LANGUAGE` are not among them — they use `deploy.yml`'s
defaults, `lancers_event_invitation_v3` (LAN-348) and `en` (LAN-351), and only
need a variable if Meta ever forces resubmission under a new name or
language.

Confirm either list yourself, at any time — this only checks names, never
values:

```
gcloud secrets list --project=oxford-lancers-operations --format='value(name)'
gh variable list --repo Oxford-Lancers-Administrative-System/lancers-operations-platform
```

## 1. Merge and deploy this pull request

Brian merges by hand — see AGENTS.md's merge rule. Then:

```
gh workflow run deploy.yml --repo Oxford-Lancers-Administrative-System/lancers-operations-platform
gh run watch --repo Oxford-Lancers-Administrative-System/lancers-operations-platform
```

Watch the run summary for the _Ensure the messaging scheduler job_ step's
outcome. If it printed a `::warning::` naming two IAM grants, do item 2 below
before continuing; otherwise skip to item 3.

## 2. Grant the deploy identity Cloud Scheduler access (only if item 1 warned)

One-time, and the same shape as every other grant in
`scripts/gcp-bootstrap.sh`:

```
gcloud projects add-iam-policy-binding oxford-lancers-operations \
  --member="serviceAccount:$(gh variable get GCP_DEPLOY_SERVICE_ACCOUNT --repo Oxford-Lancers-Administrative-System/lancers-operations-platform)" \
  --role="roles/cloudscheduler.admin"

gcloud secrets add-iam-policy-binding scheduler-trigger-token \
  --member="serviceAccount:$(gh variable get GCP_DEPLOY_SERVICE_ACCOUNT --repo Oxford-Lancers-Administrative-System/lancers-operations-platform)" \
  --role="roles/secretmanager.secretAccessor"

gcloud services enable cloudscheduler.googleapis.com --project=oxford-lancers-operations
```

Then re-run item 1's `gh workflow run deploy.yml` once — the step is
create-or-update, so this is safe to repeat.

## 3. Confirm the revision serves the new configuration

```
curl -s https://app.oxfordlancers.com/api/health
```

Expect `"status":"ok"`, `"secretsLoaded":true`, `"databaseConfigured":true`,
`"schemaCompatible":true`, and `"commit"` matching the SHA `deploy.yml` just
built.

## 4. Confirm the scheduler job exists and works

```
gcloud scheduler jobs describe lancers-messaging-sweep --location=europe-west2
gcloud scheduler jobs run lancers-messaging-sweep --location=europe-west2
```

Expect the `run` to return `200` and, against today's empty queue,
`accepted 0, refused 0`. A `401` means the job's header token does not match
the revision's `SCHEDULER_TRIGGER_TOKEN`; a `503` means the revision has no
token configured — re-check item 1.

## 5. Subscribe Meta's webhook

**Only after item 3 passes** — `/api/webhooks/whatsapp` answers `503` to
Meta's handshake until `WHATSAPP_APP_SECRET` and
`WHATSAPP_WEBHOOK_VERIFY_TOKEN` are on the _running_ revision.

In Meta's developer console, on the club's WhatsApp Business app:

1. **WhatsApp → Configuration → Webhook**.
2. **Callback URL**: `https://app.oxfordlancers.com/api/webhooks/whatsapp`
3. **Verify token**: the same value stored in the `whatsapp-webhook-verify-token`
   Secret Manager secret. Paste it from wherever you recorded it when you
   created that secret — never retype a guess.
4. **Verify and save**. Meta calls back immediately; a green check means the
   handshake succeeded.
5. **Webhook fields**: subscribe `messages`. This is what lets Meta deliver
   delivery-status callbacks (sent/delivered/read/failed) back to the
   application.

## 6. Send one real end-to-end message

Approve one real event for a small, known audience (yourself), and confirm
on the event's **Delivery** screen that the tile moves from Queued to
Delivered within the next scheduler tick (up to five minutes) and that the
message actually arrives on the recipient's phone.

## 7. Confirm no local-only override reached production

None of these should be set as a Cloud Run environment variable on the
revision — they exist for the loopback test path only and `deploy.yml` never
sets them:

```
gcloud run services describe lancers-operations-platform --region=europe-west2 \
  --format='value(spec.template.spec.containers[0].env[].name)' | tr ';' '\n' \
  | grep -E 'WHATSAPP_ALLOW_FREE_FORM|WHATSAPP_MESSAGE_MODE|WHATSAPP_TEST_RECIPIENT|EMAIL_TEST_RECIPIENT'
```

Expect no output. If any of these prints, stop and ask before sending
anything further — `resolveLocalTestOverrides` in
[`src/lib/delivery/config.ts`](../src/lib/delivery/config.ts) already refuses
them off loopback, but an unexpected match here means something upstream of
that guard is not what this runbook assumes.

## 8. Declare the cutover complete

Once items 3 through 7 all pass: update this section's "What is already done"
list, tell Brian's own record of LAN-168 that every item is closed, and note
the date. Nothing in this repository needs to change to reflect that — the
application already behaves the same whether cutover happened five minutes
ago or five months ago.
