# LAN-353 batch 3 — visual evidence

Screenshots for the third owner-authorised batch, one folder per issue that
changes something a person looks at. Every one was taken by Playwright against
this branch, on the local synthetic seed. No real member data appears in any of
them.

| Folder     | Issue   | What it shows                                                              |
| ---------- | ------- | -------------------------------------------------------------------------- |
| `LAN-363/` | LAN-363 | The Code of Conduct step's PDF viewer at 375 px, in Chromium and in WebKit |

## LAN-363 — the Code of Conduct as a PDF

Four screenshots, two per engine, all at a measured 375 px viewport against a
**production build** (`npm run build` then `next start`), not `next dev`:

| File                         | Engine              | Scroll position           |
| ---------------------------- | ------------------- | ------------------------- |
| `375-chromium-top.png`       | Playwright Chromium | the top of the document   |
| `375-chromium-last-page.png` | Playwright Chromium | scrolled to the last page |
| `375-webkit-top.png`         | Playwright WebKit   | the top of the document   |
| `375-webkit-last-page.png`   | Playwright WebKit   | scrolled to the last page |

WebKit is Safari's own engine, which is the one that matters here: iOS Safari
hands a framed PDF to its own viewer and shows a player one page with no way
through the rest. These prove the renderer draws every page into the page
itself and that the document scrolls end to end on both.

`capture.json`, beside them, is what the run measured: the viewport width the
browser reported, whether the page overflowed horizontally, how many pages were
drawn, and the console's own record of Content-Security-Policy violations and
errors. Both engines: 375 px, no horizontal overflow, five canvas pages, no CSP
violation, no console error.

The document in the screenshots is the synthetic five-page sample committed at
`public/documents/sample-conduct-document.pdf`. Nothing in it is a club rule.
