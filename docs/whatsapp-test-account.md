# Sending a real WhatsApp test message — the test account

How to put a real message on a real handset without any credential for the
club's WhatsApp account existing on a developer machine. LAN-507 replaced the
`whatsapp-test-box` branch and its stored system-user token with this
procedure; that token could send from the club's number and manage its
templates, and it never expired.

## What the test account is

Meta attaches a free test WhatsApp Business Account to every developer app.
The club's is on the **OULAFC Test App** (app id `1601380075107239`):

| Thing                     | Value               |
| ------------------------- | ------------------- |
| Test number               | +1 (555) 672-7410   |
| Phone number id           | `1382549608281651`  |
| WhatsApp Business Account | `28245377358425534` |

It is a separate account from the club's. It has its own templates (none of
the club's approved ones are visible from it), can message only the handsets
registered on its recipient list (five at most, each verified by a code sent to
that phone), and shows no business name on the recipient's phone. Nothing sent
through it can reach a player who is not on that list.

The page that controls it: **Meta for Developers → OULAFC Test App → WhatsApp →
Step 1. Try it out** (https://developers.facebook.com/apps/1601380075107239/whatsapp-business/wa-dev-console/).
Its template list in WhatsApp Manager:
https://business.facebook.com/wa/manage/message-templates/?waba_id=28245377358425534.

## The token

The "Try it out" page has **Generate token**. It opens a Facebook login popup
asking you to confirm the app may act as you; approving it fills the Access
token field with a token that **expires after 24 hours** and reaches only the
test account. Copy it with the field's copy button.

Hand it to the script through the environment of the one terminal you run it
in, and nothing else:

```bash
export WHATSAPP_TEST_TOKEN=<paste>
```

Never put it in `.env.local`, a file in the repository, a commit, a ticket or a
chat transcript. When the terminal closes the token is gone, and it dies on its
own a day later regardless. Two 24-hour tokens from the page are the same
identity; generating a second does not revoke the first.

## The script

`npm run whatsapp:test` runs `scripts/diagnostics/whatsapp-test-send.mjs`. The
account, number and app are literals in the file; there is no flag to point it
at the club's account. It never deletes anything.

```bash
# What templates the test account has, and their review status
npm run -s whatsapp:test -- status

# Create a copy of a production template on the test account, as <name>_test
npm run -s whatsapp:test -- create lancers_event_invitation_v3

# Create the event-brief wrapper (image header) with a sample image
npm run -s whatsapp:test -- create-brief --image brief.png

# Send an approved template to a registered handset
npm run -s whatsapp:test -- send --template lancers_event_brief_image_v1_test \
  --to 13177711900 --image brief.png \
  --param Brian --param "Varsity Bowl XVII vs Cambridge" --param "Saturday 7 November, 2:00 PM"
```

`--to` is digits with the country code and no `+`. `--param` is repeated once
per body slot, in slot order. `--image` or `--document` supplies the media
header for a template that declares one; the file is uploaded to Meta's media
endpoint, so no public URL or tunnel is needed.

## Templates

Templates belong to an account. A template the club has approved on its own
account does not exist on the test account and has to be created there and
reviewed by Meta again. `create` copies a production template's body and
buttons from `scripts/production/whatsapp-templates.json` under the same name
with `_test` appended, submitted as Utility; `create-brief` creates the
event-brief wrapper. Review on the test account is the same classifier and
usually takes minutes. A send against a template that is not yet approved is
refused by Meta with error `132001`.

Deleting a template locks its name for thirty days; the script offers no delete
and none is needed.

## Recipients

A number must be on the test number's recipient list before anything can be
sent to it. On the "Try it out" page, open the **Recipient** dropdown → **Manage
phone number list** → add the number; Meta sends a verification code to that
phone over WhatsApp, which the owner of the phone reads back. If a message to a
registered number does not arrive, send any message from that phone to the test
number first; Meta notes this on the page.

## What this does not cover

- **Delivery status callbacks.** The test app's webhook subscription is whatever
  is configured on the app; this procedure does not set one up, and the phone
  itself is the proof of delivery.
- **The club's real sender name.** Messages come from the Meta test number. For
  a check that must show the club's name, the production app on a synthetic
  event is the route, under `docs/pilot-data-runbook.md`.
- **The test box.** `docs/local-development.md` no longer points at it; the
  branch, its worktree and its private runtime folder are being removed under
  LAN-507.

## Worked example — the event brief, 16 October 2026

The event-brief experiment (Event Messages work request) proved a Utility
template with an image header on the club's account, then repeated it here:
`create-brief` with the rendered brief as the sample, approval from Meta, then
`send` with the same image to Brian's registered handset from the test number.
