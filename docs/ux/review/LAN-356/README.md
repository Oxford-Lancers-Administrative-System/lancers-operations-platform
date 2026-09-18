# LAN-356 — visual evidence

Screenshots for LAN-356, which loads the club's own approved 2026 Code of
Conduct into the versioned onboarding slot in place of the LAN-214 placeholder.
Every capture was taken by Playwright against a **production build**
(`npm run build` then `next start`, served on port 3020 — never 3010, which
carries a live peer environment), at a measured 1440×900 for desktop and
375×812 for the phone. The onboarding link is Lysander Croft's seeded, real
`/onboarding/[token]` link; the data is the synthetic local seed. No real
member data appears in any of them.

| Folder     | Issue   | What it shows                                                                                     |
| ---------- | ------- | ------------------------------------------------------------------------------------------------- |
| `LAN-356/` | LAN-356 | The Code of Conduct step rendering the club's real 2026 document, and the terms page's link to it |

## LAN-356 — the club's 2026 document

Ten screenshots: the onboarding Code of Conduct step, in both Playwright
engines (Chromium and WebKit, following LAN-363's own precedent — WebKit is
Safari's own engine, and iOS Safari is the one that hands a framed PDF to its
own single-page viewer), at both measured viewports, with one capture at the
top of the document and one scrolled to its own last page (page two of two);
plus the terms page in Chromium at both viewports.

| File                            | Engine   | Viewport | What it shows                                                         |
| ------------------------------- | -------- | -------- | --------------------------------------------------------------------- |
| `desktop-chromium-top.png`      | Chromium | 1440×900 | The document's own title and point 1, in the viewer                   |
| `desktop-chromium-page-two.png` | Chromium | 1440×900 | Scrolled to the end — points 11–16                                    |
| `desktop-webkit-top.png`        | WebKit   | 1440×900 | Same as above, WebKit                                                 |
| `desktop-webkit-page-two.png`   | WebKit   | 1440×900 | Same as above, WebKit                                                 |
| `375-chromium-top.png`          | Chromium | 375×812  | The document at phone width                                           |
| `375-chromium-page-two.png`     | Chromium | 375×812  | Scrolled to the end, phone width                                      |
| `375-webkit-top.png`            | WebKit   | 375×812  | Same as above, WebKit                                                 |
| `375-webkit-page-two.png`       | WebKit   | 375×812  | Same as above, WebKit                                                 |
| `desktop-chromium-terms.png`    | Chromium | 1440×900 | The terms page, "club's Code of Conduct" linking to the committed PDF |
| `375-chromium-terms.png`        | Chromium | 375×812  | Same, phone width                                                     |

`capture.json`, beside them, is what the run measured for the onboarding
step: the viewport width the browser reported, whether the page overflowed
horizontally, how many pages pdf.js drew into canvases, and the console's own
record of Content-Security-Policy violations and errors. Both engines, both
viewports: no horizontal overflow, **two** canvas pages (the document is two
pages, not LAN-363's five-page synthetic sample), no CSP violation, no
console error.

The document in every screenshot is the real committed
`public/documents/oulafc-code-of-conduct-2026.pdf` — sha256
`ab082021d715fd6bc171fe487192b3eadcf201ade1ce50346f757746c5ff68f1`, the same
file Brian supplied — served as the current `code_of_conduct` version
(`2026-v1`). The step shows no placeholder warning, because `2026-v1` is not a
placeholder label.

The terms page link ("does not replace the **club's Code of Conduct**")
resolves to the same committed path.
