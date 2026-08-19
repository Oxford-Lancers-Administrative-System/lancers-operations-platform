# Source manifest

The machine-readable source list and pinned versions are in `packet.json`. This file records why
each source controls or informs the draft.

| Source | Authority and use |
| --- | --- |
| Mission intake conversation, 19 August 2026 | Brian's current decisions about WhatsApp-first event interaction, two messages, no weekly bundle, required/optional questions, the personal RSVP page, approval scheduling, live visibility and the person-first follow-up queue |
| [Comprehensive design review](https://lancers-comprehensive-design-review.schuster.chatgpt.site) | Working route-by-route visual review grounded in the current application; not yet owner-approved |
| [Repository baseline](https://github.com/Oxford-Lancers-Administrative-System/lancers-operations-platform/tree/a6747a04d8c00024cfd65a774cdc06857bbc0d8c) | Implemented reality and the exact baseline against which this mission is drafted |
| [`docs/ux/slice-ux.md`](../../../docs/ux/slice-ux.md) | Existing approved route, shell, RSVP privacy, event, delivery, attendance and report boundaries |
| [`docs/operating-the-slice.md`](../../../docs/operating-the-slice.md) | Current end-to-end workflow and explicit known gaps |
| [`/operate/events/[id]`](../../../src/app/operate/events/%5Bid%5D/page.tsx) | Current canonical event detail, audience, approval and occurrence implementation |
| [`/operate/events/[id]/delivery`](../../../src/app/operate/events/%5Bid%5D/delivery/page.tsx) | Current per-invitee delivery and RSVP diagnostics |
| [`/operate/events/[id]/attendance`](../../../src/app/operate/events/%5Bid%5D/attendance/page.tsx) | Current attendance board and RSVP/attendance separation |
| [`/operate/report`](../../../src/app/operate/report/page.tsx) | Current immutable report and existing RSVP-versus-attendance chase grid |
| [`/rsvp/[token]`](../../../src/app/rsvp/%5Btoken%5D/page.tsx) | Current private player RSVP route and security boundary |
| `7-22-26-Team-Strategy-Discussion.txt` | Supporting discovery evidence; does not override Brian's current decisions or the approved UX contract |
| `Lancer Football Discussion - 2026_07_22 10_58 EDT - Notes by Gemini.docx` | Supporting event, coach and participation discovery evidence; does not expand scope by itself |

The prior standalone RSVP-schedule prototype is deliberately excluded because it was not
grounded in the current application and Brian rejected it as a design authority.
