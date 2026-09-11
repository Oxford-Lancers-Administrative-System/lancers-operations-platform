# LAN-222 — Local WhatsApp test panel

Authority: Brian's 9 September 2026 conversation, recorded in LAN-222. This is a
separate local development application, never a route or navigation item in the
production application. Application fixes remain under LAN-285.

## Owner flow

Open the normal app and create events, onboard people or capture recruits. Open
the testing panel in another tab to see expected messages, actual messages and
recipient responses. The panel uses the same leased local database.

The page order is:

1. Local-only identity, link to normal app, runtime health and current test time.
2. Advance-hours control and currently enabled real destinations, with one action
   result at a time. Failed operations retain previous evidence.
3. Workflow checklist: events, onboarding, recruitment and delivery/withholding.
4. People: name, destination, explicitly identified synthetic/real state,
   intercepted/real transport, responder profile and completion variant.
5. Combined timeline, with person/event/workflow/status filters and counts.
6. Message detail: readable content and buttons, context/reason, expected time,
   actual time, transport evidence and response actions.

At 375px use stacked labelled cards; no full-page horizontal table scrolling.
Dates are readable in club time. Pending state and unavailable evidence are
explicit. No pre-existing LAN-222 wireframes exist; owner visual acceptance is
required against the implemented exact head before final review.

## Required distinctions

Identity classification is not delivery mode. Actual destinations require
explicit selection by person; unselected people are intercepted. Real people
answer for themselves. Simulated people can be prompt, late or nonresponding,
and complete everything, part, minimum required or nothing. Under Brian’s 10 September LAN-297 decision, only event RSVPs and event
questions are simulated; onboarding and recruitment forms are always manual.
These are simulated event actions, never chatbot replies or extra outbound message copy.

Expected, captured, accepted, delivered, failed, overdue/missing, unexpected and
correctly withheld are separate claims. Unknown expectation or missing capture
is not a pass. Simulated delivery is labelled and cannot serve as Meta proof.

The shared clock advances workflows and simulated actions together, in order.
Actual timestamps remain separately available. A queue shift alone does not
fulfil the clock contract. Reset/repeat remains simple; no scenario library.

## Boundaries

Dashboard binds loopback only, rejects foreign Host/Origin and authenticates
mutations. No PII, payload, token or secret appears in stdout, committed state,
URL query credentials, analytics, third-party assets or remote evidence.
Dashboard controls never weaken application eligibility or provider validation.
Production has no runtime path enabling this panel, simulated answers or clock.
