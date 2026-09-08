# LAN-237 visual checks

Captured from the changed recruitment record through the real local login,
using the repository's synthetic seed. These are development checks, not Brian's
visual approval or independent review evidence.

| State                                          | Desktop                             | 375px                            |
| ---------------------------------------------- | ----------------------------------- | -------------------------------- |
| Engaged, sparse person facts, notes and events | [Desktop](engaged-desktop.png)      | [Phone](engaged-phone375.png)    |
| Identified, populated person facts             | [Desktop](identified-desktop.png)   | [Phone](identified-phone375.png) |
| Declined, send controls disabled               | [Desktop](declined-desktop.png)     | [Phone](declined-phone375.png)   |
| Recruitment questionnaire consent refusal      | [Desktop](consent-refusal-1440.png) | [Phone](consent-refusal-375.png) |

The browser measured 1440px and 375px respectively. On both widths the header-to-
metrics, metrics-to-Person and Person-to-Recruitment gaps were each 24px, and the
page's scroll width equalled its viewport width. The event table scrolls within
its own container on a phone. The consent refusal dialog remained reachable.

The send caption has 8px above it and section padding below it. The status, facts,
questionnaire buttons, consent gates, notes and history retain their existing
positions and controls. See the [behavior contract](../../tickets/LAN-237-recruitment-send-and-spacing.md)
for the timing amendment and the nudge/resend audit.
