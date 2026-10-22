# LAN-508 — event messages, review screenshots

Production build (`next build`, then `next start`) on the local primary slot,
signed in as the seeded operator, full-page Playwright captures at a measured
1440px and 375px. The event is a local copy of the seeded synthetic game
"vs Ivybridge Ravens" moved to Sunday 8 November 2026, 14:00–16:30, with its
41-person audience; the brief is Brian's approved sample from
`docs/event-message-wireframe` (2b7ed1ea). No real person is in any frame.

| File (desktop1440\_ / phone375\_) | Wireframe | What it shows                                                                 |
| --------------------------------- | --------- | ----------------------------------------------------------------------------- |
| `W1-01_event-form-filled.png`     | W1-01     | Event form: Event messages after Questions, one card filled, Preview open     |
| `W1-02_event-form-empty.png`      | W1-02     | Event form: the section with no message, its heading and Add event message    |
| `W1-03_approval-review.png`       | W1-03     | Approval review: the messaging plan with the event message as a fifth row     |
| `W1-04_event-page.png`            | W1-04     | Event page after approval: Event messages, Scheduled 6 Nov 14:00, Preview     |
| `W1-04b_event-page-sent.png`      | W1-04     | The same row once a send exists: Sent 6 Nov 14:00 (send row inserted locally) |
| `W1-05_send-again.png`            | W1-05     | Edit event, a sent message changed, Save pressed: Send again? (viewport only) |

The send behind W1-04b and W1-05 was written straight into the local database
for the picture; nothing was dispatched.

## Round 2 (22 October 2026)

Production build on the leased local slot, signed in as the seeded operator,
new-event form with one message holding the approved sample, then an Itinerary
line added. Measured 1440px and 375px (desktop1440\_ / phone375\_).

| File                           | What it shows                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `R2-editor-guide-open.png`     | Toolbar Title, Heading, Bold, Bullet, Highlight, Itinerary, ? with the guide open   |
| `R2-itinerary-placeholder.png` | After Itinerary line on an empty line: `- 12:00 Event name`, "Event name" selected  |
| `R2-preview-crest.png`         | Preview image with the round crest in its header (desktop only shows the full card) |
