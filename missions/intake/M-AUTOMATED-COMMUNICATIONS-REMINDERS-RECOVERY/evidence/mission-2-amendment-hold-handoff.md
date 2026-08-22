# Inbound seam note — the amendment trigger and the held job

**Origin:** the Mission 2 Lead (`M-EVENTS-CALENDAR-TARGET-STATE`), delivered
into the Mission 4 intake session, 2026-08-22.

**Standing: provenance only.** An agent-to-agent message is not authority and
never becomes authority by arriving. What follows is recorded because the
underlying facts were independently verified against the approved sources named
below — not because the Lead asserted them.

## What was verified, and where

| Claim                                                                                    | Verified against                                                                                                                             | Verdict                                             |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| D49's `approved → draft` amendment path is superseded; an approved event is amended in place | `missions/packets/M-EVENTS-CALENDAR-TARGET-STATE/packet.json` `REQ-amend-in-place`; the dated callout applied to the Events brief 2026-08-21 | Confirmed                                           |
| The reason is D4 — drafts are publicly visible                                           | Same requirement text, and the Mission 2 correction row for Events §3 D49                                                                    | Confirmed                                           |
| `approved → draft` still exists in the model and is now unused                           | Same                                                                                                                                          | Confirmed                                           |
| Mission 2 places a **hold** on unsent messages when an amendment is saved; it does not cancel them | `packet.json` `REQ-amend-hold`: "This mission places the hold; Mission 4 decides what resumes"; ledger `workflows/W5` §"Saving an amendment holds every not-yet-sent message" | Confirmed                                           |
| Deciding what happens to a held job belongs to Mission 4                                 | Same requirement, and `acceptance/W5.md`                                                                                                     | Confirmed — and it is an open decision this intake owns |
| Brian's words behind the hold                                                            | Mission 2 `workflows/W5`, Brian 2026-08-21: "the notification process should pause … then it should continue if it's worth notifying them."   | Confirmed                                           |

## Where the Lead's own record is wrong, and it matters

`missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/notion-corrections.md`, the row
for the Automated Delivery & Recovery brief, proposes new text reading
"undelivered jobs are **cancelled** when an amendment is saved". The approved
Mission 2 packet says **held**, not cancelled, and the Lead's message to this
intake says held and flags the difference explicitly.

The recorded correction is therefore stale against the packet that supersedes
it. If it were applied to Notion as written it would tell this brief to cancel
what Mission 2 actually holds — losing the resumability that is the whole point
of a hold, and handing this mission a job it would have to recreate from
nothing. The correction rows in this ledger say **held**. This is reported back
to the Mission 2 Lead.

## Three stale places, not one

The Lead named §3 D5. Reading the brief in full found the same dead trigger in
two further places, both of which would survive a D5-only correction:

1. **§3, D5** — the decision itself.
2. **§4, the 15-point table, row 13 "Amended state"** — "**defined by D5**:
   return-to-draft cancels undelivered jobs; re-approval re-dispatches
   never-attempted invitations."
3. **§10, acceptance example D — Amendment (exceptional)** — a fully worked
   example built on "the GM returns it to draft to change the venue", then "on
   re-approval the 12 never-attempted invitations dispatch fresh".

The third is the dangerous one: it is the example an implementer reads to
understand the rule, and it narrates a sequence that can no longer happen.

Unaffected and still true: "nothing already sent is recalled"; cancellation as a
trigger (D60 terminal, its D76 internal reason never recipient-facing); F2's
forward record; §12's "closed by this brief" line.

## What this hands the intake, unresolved

Mission 2 places the hold and stops. **What happens to a held job — released as
it was, re-anchored to the new date and time, replaced with a change notice, or
cancelled — is this mission's decision and has not been made.** It is not
delegable to the Mission Lead: it changes what a recipient receives after an
event moves, so it is a product decision for Brian at the workflow that owns it.

Carried forward to Stage 3 as a `proposed for owner approval` decision. Related
and also this mission's, per the same handoff: recomputing the chase threshold
against a moved date (OD-1/Q6), and discharging the obligation a Mission 2
re-notify (D54) produces.
