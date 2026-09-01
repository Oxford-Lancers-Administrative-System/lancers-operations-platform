# What recruitment can honestly observe about a recruit

Research record, `main@c69d544`, 2026-08-28. Commissioned by Brian at Stage 1:
_"If we maybe do a research sprint where we know what signals they have versus
not, that might be helpful. But for now, let's just err on the side of 'we can't
know that information'."_

This is the evidence behind the signal set. It records what the platform can see
today, what it could see with work, and what it can never see. Nothing here is a
design decision.

## A. Observable now, already modelled

Usable as a signal with no new capability and no model change.

| Signal                     | Where it lives                                                     |
| -------------------------- | ------------------------------------------------------------------ |
| Message queued / attempted | `notification_jobs.status`, carrying `person_id`                   |
| Message delivered          | `delivery_outcome = 'delivered'`, set from the provider callback   |
| Message failed or rejected | `delivery_outcome`, with a digit-redacted reason                   |
| Invited to an event        | `invitation_status = 'issued'`, at `recruit` capacity              |
| Answered an invitation     | `invitation_status = 'responded'`                                  |
| What they said             | `rsvp_value` (`yes`/`no`), with the reason text kept on a `no`     |
| How they answered          | `rsvp_source` — in practice `signed_link` or `operator`            |
| Turned up                  | `attendance_presence` — `present`, `absent`, `late`, `excused`     |
| Turned up uninvited        | an attendance row with no invitation, which is what a walk-up is   |
| Capture facts              | `recruitment_prospects.source`, `first_contact_on`, `committed_on` |

## B. Captured but not modelled

The provider already sends these and the platform already stores them verbatim.
Using them is a **model change, not provider work** — no new integration, no new
permission, no dependency on LAN-101 beyond what messaging already needs.

| Signal           | Evidence                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Message **read** | Meta sends `read`. `outcomeFor()` in `whatsapp-cloud.ts:421` maps it to `null` — the code's own comment says `sent` and `read` "are real transitions with no `delivery_outcome` value. Widening that enum is a frozen-model change, so they are stored as evidence and applied to nothing." The raw value is kept in `delivery_callbacks.provider_status` with an `ignored_reason`. |
| Message **sent** | Same path, same storage, same reason.                                                                                                                                                                                                                                                                                                                                               |

## C. Not observable today, but buildable

Each needs a build decision, and each is ours to build because we own the
surface.

| Signal             | Why it is absent                                                                                                                                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Link opened**    | `player-answer-tokens.ts` records no open. Nothing anywhere writes an `opened` fact. Task 09 §2.1 names an `opened` state for verification links, but it belongs to the LAN-85 work that moved to Mission 7, and nothing implements it. We own the link, so recording an open is straightforward.                                          |
| **Form submitted** | The recruit-stage form does not exist yet. When it is built, its submission is ours to record.                                                                                                                                                                                                                                             |
| **Replied to us**  | The webhook parses **only** `entry[].changes[].value.statuses[]`. It never reads `messages[]`, so no inbound message is captured anywhere. `rsvp_source = 'channel_reply'` exists in the enum and **is never written by any code path** — an intent that was never built. Buildable, but it is real work and Meta's messaging rules apply. |

## D. Not observable at all

No amount of building reaches these. They are outside what the WhatsApp Business
Cloud API exposes.

- **Joining the community group.** Group and community membership is not exposed.
  There is no event, no query, and no callback for "this person joined".
- **Messages inside the group.** Not delivered to a business webhook.
- **A human's own WhatsApp message** to a recruit, sent from their own phone.

## The finding that matters

Brian named two signals as known-good at Stage 1: _"we can know if they accepted
the WhatsApp… and if they filled out the information, that's a good signal."_

The second holds — the form is ours and its submission is recordable.

**The first does not, as stated.** If "accepted the WhatsApp" means joining the
community group, it is in category D and cannot be known. The closest true
statements are that the message was **delivered**, which is available now, and
that it was **read**, which the provider already tells us and which the platform
already stores but deliberately does not model.

This is also the answer to the WhatsApp community-join door: there is no
observable join, so that door is a link posted in the group rather than a door
the system watches.
