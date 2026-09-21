# LAN-398 — the club's name and crest on every email

What an email the app sends through Resend looks like after this change. Brian's
decision of 18 September 2026: the bar is the club's university mailbox, which
arrives in iPhone Mail as "Oxford University Lancers American Football Club".

## The screenshots

| File                        | What it shows                                    |
| --------------------------- | ------------------------------------------------ |
| `invitation-600px.png`      | The RSVP invitation, desktop width               |
| `invitation-375px.png`      | The same message on a phone                      |
| `recruit_welcome-600px.png` | A recruit welcome — the Stop line, desktop width |
| `recruit_welcome-375px.png` | The same message on a phone                      |

Two kinds rather than fifteen, because there is one shell and the two chosen
differ in the only way any of them differ: whether the kind carries a Stop line.
The other thirteen are here in full as HTML.

## The fifteen HTML files

`<kind>.html` is exactly what `buildEmailBody` puts in Resend's `html` field for
that kind, rendered against `https://app.oxfordlancers.com` and a fixture
message with every field filled. They are written by the same code the send
uses, not transcribed.

Opening one locally shows the layout but **not** the crest: the `<img>` names
the production origin, which does not serve `/brand/crest-email.png` until this
is deployed. That is why the screenshots exist — they were taken with the
committed PNG served in that origin's place, so they show the bytes a recipient
will get.

The same fifteen, against an example origin, are committed as test fixtures at
`src/lib/delivery/__fixtures__/email/` and asserted on every run.

## What to look at

- **The From line.** Not shown here, because it is not part of the body: every
  email now arrives as
  `Oxford University Lancers American Football Club <events@oxfordlancers.com>`.
  `src/lib/delivery/email.test.ts` pins it.
- **The header** — the crest at 48px, "Oxford Lancers" in Oxford Blue, a gold
  rule under both. `docs/ux/design-system.md`'s palette throughout.
- **The message** — unchanged. Same copy, same line breaks, same order. Meta's
  classifier approved these exact bodies as Utility and a reworded one is a new
  submission (`docs/whatsapp-template-categories.md`).
- **The signature** — the crest at 32px, the club's name in full, the privacy
  notice.
- **The Stop line**, on `recruit_welcome`, `recruit_details_reminder`,
  `recruit_interest_ask` and `recruit_interest_reminder` and on no other kind.
  LAN-372: a recruit may ask the club to stop, and a roster player asking the
  same thing is asking to leave the team. It now sits in the signature block
  instead of at the end of the message — moved, never duplicated, and with its
  wording untouched.
- **The plain-text part**, which is not in these files because it did not
  change. All fifteen are byte-identical to what they were before this change,
  asserted against fixtures captured beforehand.

## Regenerating

The HTML fixtures under `src/lib/delivery/__fixtures__/email/`:

```bash
UPDATE_EMAIL_FIXTURES=1 npx vitest run src/lib/delivery/email-parts.test.ts
```

The crest PNGs:

```bash
node scripts/generate-brand-assets.mjs
```
