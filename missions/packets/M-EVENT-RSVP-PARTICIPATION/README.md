# M-EVENT-RSVP-PARTICIPATION v1

**Status:** `not_ready` — draft intake packet. Brian has authorized preparation of the
draft pull request, but the visual review is still in progress and mission execution is not
authorized.

## Outcome

The existing Events area becomes the coherent operational home for event creation, audience
approval, scheduled WhatsApp invitations, player RSVP completion, live response visibility,
attendance and person-first follow-up. Players respond to individual events quickly through
WhatsApp links, can finish required questions on the existing private RSVP page, and have a
season-linked backup page for missed or incomplete RSVPs. Operators can see exactly what will
happen before approval and exactly what is happening after invitations begin.

## Product direction already locked

- Extend the existing Material UI application and canonical event route. Do not replace the
  current shell or introduce isolated administration pages.
- Individual WhatsApp event interaction remains primary. There is no weekly RSVP bundle.
- The normal event flow has two messages: the first invitation and one follow-up. Short-notice
  events may collapse to one message when the follow-up no longer fits.
- Event-type templates provide default RSVP timing and questions. Every event shows its copied
  plan and permits an authorized event-specific override.
- Event approval and invitation release are separate decisions. RSVP invitation is enabled by
  default, and approval shows when the first invitation will go out.
- Sending the invitation now re-anchors the remaining sequence to now; a step that cannot fit
  before the event is removed rather than sent at a nonsensical time.
- After invitations begin, the canonical event page shows full fixture details, large response
  totals, the next automated send, every invited person, role, delivery state, RSVP state,
  messages sent, private reason/detail when authorized, and attendance when available.
- Required and optional follow-up questions are part of the event RSVP page. Yes or No is saved
  immediately; a Yes with required answers missing is visibly incomplete and receives a
  **Finish your RSVP** action and reminder.
- A permanent season-linked **My RSVPs** page is a backup, not the primary interaction. It shows
  outstanding, incomplete and completed event responses and links back to each event RSVP.
- The live **Player attention** view is person-first: each person appears once, future No,
  nonresponse and incomplete RSVP issues lead, recent RSVP and attendance history provide
  context, the most problematic people sort first, and the phone number is immediately callable.
- Past events are context, never open RSVP tasks. A completed past No does not become an
  outstanding item.
- The existing Monday report remains an immutable weekly snapshot. The live Player attention
  view is a separate operational queue.

## Current-application route map

| Surface | Current state | Mission treatment |
| --- | --- | --- |
| `/operate/events` | Existing event list | Modify: add next-send and attention context; add Player attention view |
| `/operate/events/calendar` | Existing Gregorian/Oxford calendar | Preserve |
| `/operate/events/new` and edit | Existing fixture editor | Modify: show RSVP defaults, questions and invitation plan |
| `/operate/events/[id]` | Existing canonical draft, approval and occurrence route | Modify: keep it canonical through queued/live response states |
| `/operate/events/[id]/delivery` | Existing per-invitee delivery diagnostics | Preserve and link clearly from event overview |
| `/operate/events/[id]/attendance` | Existing attendance board with standing RSVP | Preserve; surface resulting attendance in event visibility and follow-up context |
| `/operate/report` | Existing immutable Monday report | Preserve |
| `/rsvp/[token]` | Existing private event RSVP | Modify: required/optional follow-up questions and incomplete completion state |
| `/rsvp/me/[token]` | Absent | New season-linked backup RSVP page |
| Event-type RSVP defaults | Absent | New protected configuration surface; final route placement remains under review |

## Visual review

The current comprehensive review build is:

<https://lancers-comprehensive-design-review.schuster.chatgpt.site>

It deliberately labels every surface **Existing**, **Modified** or **New** and allows direct
navigation without recording decisions. It is a working review artifact, not final visual
acceptance. The earlier isolated RSVP-schedule prototype is superseded and must not be used as
implementation authority.

The final reviewed prototype source and route-level visual acceptance record must be committed
to this packet before it can become `approved`.

## Still open before approval

1. Finish desktop and 375px visual review of every modified/new surface.
2. Confirm the exact default offsets and response deadlines for each event type.
3. Confirm final placement and name of the event-type default editor.
4. Define the first transparent Player-attention scoring/sorting rules and recent-history window;
   a future problem score may influence the view, but the UI cannot depend on an undefined score.
5. Confirm the precise authorized roles that may see private RSVP reasons and question answers.
6. Reconcile the final reviewed prototype back into repository-native mockup code and update this
   packet's source digest.

## Approval path

1. Keep this pull request in draft while visual and rule review continues.
2. Amend this packet in the same draft PR as decisions close.
3. Set `status` to `approved` only after Brian explicitly approves the final packet and visual
   reference.
4. Brian's merge authorizes the exact packet and commit.
5. Only then may the Mission Lead initialize, decompose and execute the mission.

Observed implementation baseline: `a6747a04d8c00024cfd65a774cdc06857bbc0d8c`.
