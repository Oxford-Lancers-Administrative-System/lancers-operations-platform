# LAN-277 — branding and link previews

Evidence for LAN-278 (the application mark), LAN-269 (icons, manifest, link
previews, safe token links) and LAN-279 (the recruit sign-up card).

Captured through the real login at the measured viewports the gate requires —
1440×900 and 375×812 — against the local overflow slot. `before/` is the same
application with the previous mark and favicon restored, so the pairs differ
only in what this pull request changes.

## What to judge

1. **`marks/header-mark-on-navy-before-after.png`** — the header mark, before
   and after, in the 48px desktop box and the 32px phone box, magnified 6×. The
   boxes are unchanged; only the crop and the mark changed. The new mark is 1.183
   wide to tall, so it draws 48×41 and 32×27 inside them. Regenerated on
   10 September with the three-crown mark (see `public/brand/README.md` for why
   the 9 September export had one crown).
2. **`marks/header-mark-on-paper-before-after.png`** — the same pair for
   `crest-blue.svg`, the light-ground variant. The football keeps its brown.
3. **`marks/tab-icon-light-chrome-before-after.png`** and
   **`…-dark-chrome-before-after.png`** — the favicon at 16, 32 and 48px, on a
   pale and a dark browser chrome. Before is the generic icon this repository
   shipped with; after is the gold-outline Ops mark on the club navy. 16px is
   the hard case and the navy ground is what makes it a badge rather than a
   smudge.
4. **`join-link-preview-card.png`** — the 1200×630 card `/join/[code]` unfurls
   with, fetched from the running server. Drawn in code from `crest.svg`, so it
   follows the logo. Wording is LAN-279's default, "Join the Lancers"; Brian
   floated "Sign up" as the alternative and it is one constant to change.
5. **`after/desktop_operate_recruitment_qr.png`** — the QR page now shows that
   same generated card under the printed link, so the poster and the chat card
   are one design. The QR itself is untouched: same component, same 320px
   maximum, same matrix.
6. **`after/…`** at both viewports — the mark on every branded surface: sign-in,
   public calendar, policy pages, the sign-up door, and the operator shell.

## What is not here, and why

- **The WhatsApp and iMessage cards.** They need a phone and a real send, and
  the tags they are built from cannot be exercised any other way. That is
  Brian's morning task. `tags.txt` is what those crawlers will read.
- **The "Add to Home Screen" prompt.** It is a browser affordance on a device,
  not something the page can screenshot. `manifest.webmanifest.json` is the
  document the prompt is built from, served from the running application.

## Files

| File                         | What it is                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `before/`, `after/`          | Full-page captures, `desktop_` at 1440 and `phone375_` at 375                                          |
| `marks/`                     | The mark and the tab icon at the sizes they are actually drawn                                         |
| `join-link-preview-card.png` | `/join/[code]/opengraph-image`, as served                                                              |
| `manifest.webmanifest.json`  | `/manifest.webmanifest`, as served                                                                     |
| `tags.txt`                   | Every route's `<title>`, `og:`, `twitter:`, icon and manifest tags, fetched with a WhatsApp user agent |
