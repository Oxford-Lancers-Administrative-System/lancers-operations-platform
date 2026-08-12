# Lancers MVP UX contract — owner-review draft

Status: **Awaiting Brian’s dated Notion approval linked from LAN-90**  
Source reconciliation date: 12 August 2026  
Purpose: derived design contract for review; not application code and not yet implementation authorization

## 1. Authority and governance

The live Linear issues, acceptance criteria, comments, relationships and recorded owner decisions are authoritative. Repository `AGENTS.md`, more-specific architecture documentation and accepted ADRs are binding. This document translates those sources into a coherent UX; it cannot supersede them.

Authority order:

1. Current live Linear and recorded owner decisions.
2. Binding repository instructions and architecture documentation.
3. This shared UX contract.
4. The owning ticket contract.
5. The named SVG for information hierarchy and presentation.

When sources conflict or a required behavior is absent, stop and request/reconcile an owner decision. Do not resolve product policy in application code. The package remains an owner-review draft until Brian’s dated approval is recorded in Notion and linked from LAN-90.

## 2. MVP boundary

The MVP operational loop is:

**operator-entered returner → current-season membership → explicit event audience → designated approval → automated 1:1 delivery → private RSVP → occurred/not-held assertion → attendance → immutable Monday exception snapshot**

Included:

- authenticated operator shell at `/operate` with Roster, Events and Report navigation;
- exact, non-leaking unlinked-operator and inactive-operator states;
- operator-entered returning-person and membership flow with duplicate prevention;
- desktop-first roster and membership detail with useful 375px lookup;
- event draft, explicit audience, designated approval and post-approval invitations;
- official automated 1:1 WhatsApp delivery, safe diagnostics and automated fallback policy;
- private responsive RSVP at `/rsvp/[token]`;
- explicit occurrence assertion, one attendance model, immediate save feedback, audited correction and minimal walk-up capture;
- narrow, immutable Monday exception-and-action report at `/operate/report`;
- LAN-110 attendance-recorder capability for active Head Coach, OC and DC assignments only.

Excluded:

- player self-service returner verification through `/verify/[token]`;
- an operator Home destination;
- season administration, recruiting funnel, historical import UI or generalized settings;
- manual copying, sending, posting, WhatsApp group/Community publishing or ad-hoc link sharing;
- recurring event templates, calendar-first planning, bulk schedule management or detailed itineraries;
- broad analytics, performance statistics, disciplinary automation, repeated-response heuristics or a three-week planning horizon;
- full walk-up onboarding/reconciliation in the live attendance moment;
- blanket permissions inferred from an officer title;
- branding polish, custom visual language or a new design system in this slice.

## 3. Navigation architecture

### Operator

The `/operate` shell exposes only:

1. **Roster** — `/operate/roster`
2. **Events** — `/operate/events`
3. **Report** — `/operate/report`

There is no Home destination. After authentication, the shell opens the first destination permitted by the operator’s capability map. Hidden navigation improves clarity but never grants or revokes authorization.

### Coach attendance recorder

An active Head Coach, OC or DC assignment receives only the occurred-event attendance surface. No general operator navigation, roster editing, event administration, delivery, report, contact, RSVP-reason, or availability data is exposed.

### Player

RSVP is a direct scoped journey at `/rsvp/[token]`; it never enters `/operate` and never exposes peer responses.

## 4. Route contract

| Route                             | Purpose                                                                   |
| --------------------------------- | ------------------------------------------------------------------------- |
| `/login`                          | Operator authentication                                                   |
| `/operate`                        | Protected shell/account-state resolution; not a Home page                 |
| `/operate/roster`                 | Current-season roster                                                     |
| `/operate/roster/new`             | Operator-entered returning player                                         |
| `/operate/roster/[membershipId]`  | Membership detail and authorized transitions                              |
| `/operate/events`                 | Event list                                                                |
| `/operate/events/new`             | New event draft                                                           |
| `/operate/events/[id]`            | Event detail, audience, approval and occurrence decisions                 |
| `/operate/events/[id]/delivery`   | Delivery status and repair                                                |
| `/operate/events/[id]/attendance` | Shared LAN-80 attendance surface, capability-scoped for operators/coaches |
| `/operate/report`                 | Report date, preview, stored snapshot and version history                 |
| `/rsvp/[token]`                   | Private player response and all token/event terminal states               |

Routes do not authorize. Server/service actions enforce account, role, capability, record scope and transition rules.

## 5. Complete end-to-end workflow

1. **Access:** a user signs in. A linked active operator enters the first authorized `/operate` destination. Unlinked and inactive operator states expose no protected shell.
2. **Returner entry:** an authorized operator enters family name, given name, known-as, email and phone at `/operate/roster/new`; Returning is fixed.
3. **Duplicate decision:** the service checks before any write and presents candidates matching names or supplied contact. The operator explicitly selects one person or explicitly confirms a new person.
4. **Membership guard:** a current-season membership causes a clear refusal. Otherwise person/contact/membership changes commit together and confirmation links to the new membership and roster.
5. **Roster operation:** the operator searches current-season memberships, opens `/operate/roster/[membershipId]`, resolves onboarding items, and—only as Exec/GM—activates with a recorded override when needed. Subscription payment never gates activation.
6. **Event draft:** the operator records the required operational facts, saves a draft and resolves an explicit audience. Draft/pending states have no invitations, responses or attendance.
7. **Approval:** the designated approver, normally the President or delegated lead, reviews the named audience. Empty audience is refused. Approval creates resolved audience, invitations and notification jobs; rejection/return preserves the non-distribution boundary.
8. **Delivery:** the system performs official 1:1 WhatsApp delivery and records provider-neutral results. Operators can safely retry or revoke/reissue; automated fallback follows policy. There is no manual send or post control.
9. **RSVP:** the invited player sees only their event, identity, deadline and current answer. Attending saves directly; Not attending requires a reason. Changes remain open until start, including a late response after the deadline. Unknown, started/expired and revoked tokens remain distinct internally but produce the same non-leaking public response. A valid invitation for a cancelled event may show the cancelled event and date.
10. **Occurrence:** after an approved event’s scheduled time, an authorized operator explicitly chooses Mark occurred or Mark not held. Time alone never determines occurrence. A coach cannot assert it through LAN-110.
11. **Attendance:** only occurred events accept Present, Absent, Late or Excused. Every recorder uses the LAN-80 model. RSVP remains independent; mismatches remain visible. Minimal walk-up identity is flagged for later reconciliation.
12. **Save/correction:** each attendance change shows Saving, Saved or failed-save feedback, preserves the latest committed value, and identifies last actor/time. Later corrections are audited; latest committed wins while earlier entries remain history.
13. **Monday report:** the operator chooses a reporting date, previews computed exceptions, and generates an immutable versioned snapshot. The rendered report reads stored content only.

## 6. Interface vocabulary

| Concept              | Required language                                                   |
| -------------------- | ------------------------------------------------------------------- |
| Positive RSVP        | **Attending**                                                       |
| Negative RSVP        | **Not attending**                                                   |
| No received RSVP     | **No response** or **Outstanding**, by context                      |
| Attendance           | **Present**, **Absent**, **Late**, **Excused**                      |
| Occurrence assertion | **Mark occurred**, **Mark not held**                                |
| Delivery result      | **Queued**, **Attempted**, **Delivered**, **Failed**, **Retryable** |
| Membership entry     | **Returning**                                                       |
| Temporary attendee   | **Walk-up**                                                         |
| Weekly artifact      | **Monday exception and action report**                              |

Delivered never means responded. Attending is intent; Present is observed attendance. A walk-up is not automatically a roster member.

## 7. Responsive behavior

- Every registered screen has a standalone 375px phone SVG.
- Operator desktop is a wide MUI-oriented command view with persistent Roster/Events/Report navigation, scannable tables, visible filters and one clear primary action.
- Operator phone uses cards, a single search/filter entry point and no required horizontal scrolling. Roster phone is useful lookup, not dense editing.
- Forms preserve all required fields at 375px and keep the primary/secondary decision explicit.
- Attendance phone keeps the four states reachable, shows the committed/update line, and exposes Saving/Saved/failure without relying on color alone.
- RSVP is mobile-first and also has a clean centered desktop presentation, never operator chrome.
- Responsive reordering may not remove route context, permission boundary, data needed for the task, material alternate state or recovery action.
- Visual implementation follows repository MUI/theme guidance; these wireframes are deliberately low fidelity and do not authorize branding polish.

## 8. Authorization contract

| Capability                | Authorized scope                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------- |
| Ordinary operator actions | Only the role/capability mapping in LAN-73 and owning live issue                    |
| Membership activation     | Exec/GM only; recorded override allowed; subscription never a gate                  |
| Event approval            | Designated approver, normally President or delegated lead                           |
| Occurrence assertion      | Authorized operator only; not implied by attendance-recorder capability             |
| General attendance        | Authorized operator after `occurred`                                                |
| Coach attendance          | Active Head Coach, OC or DC assignment only, after `occurred`, through LAN-80 model |
| Report                    | Authorized report operator only                                                     |
| RSVP                      | Holder of valid scoped invitation token only                                        |

President and Secretary are not described as blanket full-MVP roles. GM is included where the live membership transition requires it. Authorization must be enforced independently of navigation, client state and route visibility.

Exact account-state copy:

- **Unlinked:** “You’re signed in, but this account is not connected to a Lancers operator profile. Contact the club administrator and provide the email address you used to sign in.”
- **Linked but inactive:** “Your Lancers operator access is inactive. Contact the club administrator if you believe access should be restored.”

Both states return no operator data, actions, navigation or role detail.

## 9. Shared state contract

| State                                          | Required behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Loading                                        | Stable shell/skeleton; no protected-data flash; duplicate actions disabled.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Empty                                          | Distinguish filter-empty, system-empty and no-generated-snapshot; offer the smallest authorized recovery.                                                                                                                                                                                                                                                                                                                                                                                                    |
| Validation                                     | Preserve entries, identify the field, state the correction, focus the first invalid control.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Error                                          | Preserve safe input, distinguish retryable from terminal, avoid raw provider/platform detail.                                                                                                                                                                                                                                                                                                                                                                                                                |
| Success                                        | Identify the resulting object, status and next route; explicitly say whether distribution began.                                                                                                                                                                                                                                                                                                                                                                                                             |
| Completed                                      | Show committed result, actor/time where relevant, and any permitted correction.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Unauthorized                                   | Return no protected data; show safe recovery only.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Saving                                         | Keep the selected attendance value visible and label `Saving…`.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Saved                                          | Show latest committed value with `Saved`, actor and time.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Failed save                                    | Keep unsaved selection visible, identify latest committed value, offer retry/restore.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Duplicate candidate                            | No write; explicit existing-person or new-person decision required.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Current membership refusal                     | No write; link to the current membership.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Event not occurred                             | Attendance action disabled and service write refused.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Event not held                                 | Attendance permanently unavailable for that occurrence decision.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Unknown RSVP token (UX-63)                     | Internal/test state only. Public response is the security-uniform terminal response below.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Event started / expired token (UX-64)          | Internal/test state only. No write. Public response is the security-uniform terminal response below.                                                                                                                                                                                                                                                                                                                                                                                                         |
| Revoked token (UX-65)                          | Internal/test state only. No write. Public response is the security-uniform terminal response below.                                                                                                                                                                                                                                                                                                                                                                                                         |
| Security-uniform public RSVP terminal response | UX-63, UX-64 and UX-65 use identical public content, presentation, HTTP `404 Not Found`, and non-distinguishable timing/response behavior. Copy: **This RSVP link can’t be used.** **Request the latest RSVP link from the club. If the event has already started, response changes are closed.** Actions: **Contact the club** and **Close**. Privacy note: **For privacy, we can’t provide more information about this link.** No player, event, invitation, time or token-history information is exposed. |
| Cancelled event (UX-66)                        | Only when the token resolves to a valid invitation. May identify the cancelled event and date; must not expose unrelated player or roster information. Explain that no response is needed.                                                                                                                                                                                                                                                                                                                   |

### LAN-79 / LAN-90 owner resolution — 12 August 2026

Brian selected the security-first uniform terminal response. UX-63, UX-64 and UX-65 are preserved as separate domain states for secure internal logs, tests and operational diagnostics only. Public clients cannot distinguish them by copy, layout, HTTP status, timing, redirects, headers, body shape or retry behavior. UX-66 remains visually distinct because a valid invitation has resolved before the cancelled-event state is evaluated. This recorded decision resolves the prior tension between LAN-79 non-leakage and LAN-90 visual-state coverage without weakening the domain/test distinctions.

## 10. Monday stored-snapshot contents

The report leads, in this order, with nonresponses; Not attending responses and reasons; RSVP/attendance mismatches; absences and missing attendance; relevant onboarding exceptions; and uninvited-audience approval defects.

The immutable snapshot also stores:

- events in the reporting window with status;
- per-event response breakdown derived from `invitation_response_state`;
- nonresponse queue;
- reasons for Not attending;
- attendance recorded;
- RSVP/attendance mismatches;
- current availability by level only, with no narrative or diagnosis;
- uninvited-audience approval defects;
- `version`, `supersedes`, `generated_at`, `data_as_of`, `generated_by` and `metric_definition_version`.

The report view reads stored JSON content only. Regeneration creates a new version and never rewrites a prior snapshot.

## 11. Screen registry and Linear traceability

| Screen ID | Screen/state                                        | Route                             | Audience                                           | Linear owner    | Wireframes                                                                                                                                                      |
| --------- | --------------------------------------------------- | --------------------------------- | -------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UX-01     | Sign in to Lancers Operations                       | `/login`                          | Operator                                           | LAN-73          | [`desktop`](wireframes/UX-01-sign-in-desktop.svg) / [`375px phone`](wireframes/UX-01-sign-in-phone.svg)                                                         |
| UX-02     | Lancers Operations                                  | `/operate/roster`                 | Authorized operator                                | LAN-73          | [`desktop`](wireframes/UX-02-operator-shell-desktop.svg) / [`375px phone`](wireframes/UX-02-operator-shell-phone.svg)                                           |
| UX-03     | Operator profile not connected                      | `/operate`                        | Signed-in user without linked operator profile     | LAN-73          | [`desktop`](wireframes/UX-03-operator-unlinked-desktop.svg) / [`375px phone`](wireframes/UX-03-operator-unlinked-phone.svg)                                     |
| UX-04     | Operator access inactive                            | `/operate`                        | Signed-in user with inactive operator profile      | LAN-73          | [`desktop`](wireframes/UX-04-operator-inactive-desktop.svg) / [`375px phone`](wireframes/UX-04-operator-inactive-phone.svg)                                     |
| UX-05     | You do not have access to this action               | `/operate`                        | Authenticated operator without required capability | LAN-73          | [`desktop`](wireframes/UX-05-operator-unauthorized-desktop.svg) / [`375px phone`](wireframes/UX-05-operator-unauthorized-phone.svg)                             |
| UX-10     | Add returning player                                | `/operate/roster/new`             | Authorized roster operator                         | LAN-74          | [`desktop`](wireframes/UX-10-returner-entry-desktop.svg) / [`375px phone`](wireframes/UX-10-returner-entry-phone.svg)                                           |
| UX-11     | Review possible matches                             | `/operate/roster/new`             | Authorized roster operator                         | LAN-74          | [`desktop`](wireframes/UX-11-returner-candidates-desktop.svg) / [`375px phone`](wireframes/UX-11-returner-candidates-phone.svg)                                 |
| UX-12     | This person already has a current-season membership | `/operate/roster/new`             | Authorized roster operator                         | LAN-74          | [`desktop`](wireframes/UX-12-returner-current-membership-refusal-desktop.svg) / [`375px phone`](wireframes/UX-12-returner-current-membership-refusal-phone.svg) |
| UX-13     | Returning player added                              | `/operate/roster/[membershipId]`  | Authorized roster operator                         | LAN-74          | [`desktop`](wireframes/UX-13-returner-created-desktop.svg) / [`375px phone`](wireframes/UX-13-returner-created-phone.svg)                                       |
| UX-20     | Roster                                              | `/operate/roster`                 | Authorized roster operator                         | LAN-75          | [`desktop`](wireframes/UX-20-roster-desktop.svg) / [`375px phone`](wireframes/UX-20-roster-phone.svg)                                                           |
| UX-21     | Chase Fellows                                       | `/operate/roster/[membershipId]`  | Authorized roster operator                         | LAN-75          | [`desktop`](wireframes/UX-21-membership-detail-desktop.svg) / [`375px phone`](wireframes/UX-21-membership-detail-phone.svg)                                     |
| UX-22     | Activate with outstanding onboarding                | `/operate/roster/[membershipId]`  | Exec or GM                                         | LAN-75          | [`desktop`](wireframes/UX-22-activation-override-desktop.svg) / [`375px phone`](wireframes/UX-22-activation-override-phone.svg)                                 |
| UX-23     | No memberships match these filters                  | `/operate/roster`                 | Authorized roster operator                         | LAN-75          | [`desktop`](wireframes/UX-23-roster-empty-desktop.svg) / [`375px phone`](wireframes/UX-23-roster-empty-phone.svg)                                               |
| UX-30     | Events                                              | `/operate/events`                 | Authorized event operator                          | LAN-76          | [`desktop`](wireframes/UX-30-event-list-desktop.svg) / [`375px phone`](wireframes/UX-30-event-list-phone.svg)                                                   |
| UX-31     | Create event                                        | `/operate/events/new`             | Authorized event operator                          | LAN-76          | [`desktop`](wireframes/UX-31-event-editor-desktop.svg) / [`375px phone`](wireframes/UX-31-event-editor-phone.svg)                                               |
| UX-32     | Team Practice                                       | `/operate/events/[id]`            | Authorized event operator                          | LAN-76          | [`desktop`](wireframes/UX-32-event-draft-desktop.svg) / [`375px phone`](wireframes/UX-32-event-draft-phone.svg)                                                 |
| UX-33     | Event submitted for approval                        | `/operate/events/[id]`            | Authorized event operator                          | LAN-76          | [`desktop`](wireframes/UX-33-event-submitted-desktop.svg) / [`375px phone`](wireframes/UX-33-event-submitted-phone.svg)                                         |
| UX-40     | Build event audience                                | `/operate/events/[id]`            | Authorized event operator                          | LAN-77          | [`desktop`](wireframes/UX-40-audience-builder-desktop.svg) / [`375px phone`](wireframes/UX-40-audience-builder-phone.svg)                                       |
| UX-41     | Approve Team Practice                               | `/operate/events/[id]`            | Designated event approver                          | LAN-77          | [`desktop`](wireframes/UX-41-approval-review-desktop.svg) / [`375px phone`](wireframes/UX-41-approval-review-phone.svg)                                         |
| UX-42     | This event cannot be approved                       | `/operate/events/[id]`            | Designated event approver                          | LAN-77          | [`desktop`](wireframes/UX-42-empty-audience-refusal-desktop.svg) / [`375px phone`](wireframes/UX-42-empty-audience-refusal-phone.svg)                           |
| UX-43     | Event approved                                      | `/operate/events/[id]`            | Authorized event operator                          | LAN-77          | [`desktop`](wireframes/UX-43-event-approved-desktop.svg) / [`375px phone`](wireframes/UX-43-event-approved-phone.svg)                                           |
| UX-50     | Delivery · Team Practice                            | `/operate/events/[id]/delivery`   | Authorized delivery operator                       | LAN-78          | [`desktop`](wireframes/UX-50-delivery-overview-desktop.svg) / [`375px phone`](wireframes/UX-50-delivery-overview-phone.svg)                                     |
| UX-51     | Delivery diagnostics                                | `/operate/events/[id]/delivery`   | Authorized delivery operator                       | LAN-78          | [`desktop`](wireframes/UX-51-delivery-diagnostics-desktop.svg) / [`375px phone`](wireframes/UX-51-delivery-diagnostics-phone.svg)                               |
| UX-52     | Repair delivery                                     | `/operate/events/[id]/delivery`   | Authorized delivery operator                       | LAN-78          | [`desktop`](wireframes/UX-52-delivery-repair-desktop.svg) / [`375px phone`](wireframes/UX-52-delivery-repair-phone.svg)                                         |
| UX-60     | Team Practice                                       | `/rsvp/[token]`                   | Invited player                                     | LAN-79          | [`desktop`](wireframes/UX-60-player-rsvp-desktop.svg) / [`375px phone`](wireframes/UX-60-player-rsvp-phone.svg)                                                 |
| UX-61     | Not attending                                       | `/rsvp/[token]`                   | Invited player                                     | LAN-79          | [`desktop`](wireframes/UX-61-rsvp-not-attending-desktop.svg) / [`375px phone`](wireframes/UX-61-rsvp-not-attending-phone.svg)                                   |
| UX-62     | Your response is saved                              | `/rsvp/[token]`                   | Invited player                                     | LAN-79          | [`desktop`](wireframes/UX-62-rsvp-saved-desktop.svg) / [`375px phone`](wireframes/UX-62-rsvp-saved-phone.svg)                                                   |
| UX-63     | This RSVP link can’t be used                        | `/rsvp/[token]`                   | Link holder                                        | LAN-79          | [`desktop`](wireframes/UX-63-rsvp-invalid-desktop.svg) / [`375px phone`](wireframes/UX-63-rsvp-invalid-phone.svg)                                               |
| UX-64     | This RSVP link can’t be used                        | `/rsvp/[token]`                   | Link holder                                        | LAN-79          | [`desktop`](wireframes/UX-64-rsvp-event-started-desktop.svg) / [`375px phone`](wireframes/UX-64-rsvp-event-started-phone.svg)                                   |
| UX-65     | This RSVP link can’t be used                        | `/rsvp/[token]`                   | Link holder                                        | LAN-79          | [`desktop`](wireframes/UX-65-rsvp-revoked-desktop.svg) / [`375px phone`](wireframes/UX-65-rsvp-revoked-phone.svg)                                               |
| UX-66     | This event has been cancelled                       | `/rsvp/[token]`                   | Invited player                                     | LAN-79          | [`desktop`](wireframes/UX-66-rsvp-cancelled-desktop.svg) / [`375px phone`](wireframes/UX-66-rsvp-cancelled-phone.svg)                                           |
| UX-70     | Confirm what happened                               | `/operate/events/[id]`            | Authorized occurrence operator                     | LAN-80          | [`desktop`](wireframes/UX-70-occurrence-decision-desktop.svg) / [`375px phone`](wireframes/UX-70-occurrence-decision-phone.svg)                                 |
| UX-71     | Attendance is not available yet                     | `/operate/events/[id]/attendance` | Authorized attendance operator                     | LAN-80          | [`desktop`](wireframes/UX-71-attendance-locked-desktop.svg) / [`375px phone`](wireframes/UX-71-attendance-locked-phone.svg)                                     |
| UX-72     | Attendance · Team Practice                          | `/operate/events/[id]/attendance` | Authorized attendance operator                     | LAN-80          | [`desktop`](wireframes/UX-72-attendance-roster-desktop.svg) / [`375px phone`](wireframes/UX-72-attendance-roster-phone.svg)                                     |
| UX-73     | Add walk-up attendance                              | `/operate/events/[id]/attendance` | Authorized operator attendance recorder            | LAN-80          | [`desktop`](wireframes/UX-73-walk-up-capture-desktop.svg) / [`375px phone`](wireframes/UX-73-walk-up-capture-phone.svg)                                         |
| UX-74     | Correct attendance                                  | `/operate/events/[id]/attendance` | Authorized attendance recorder                     | LAN-80          | [`desktop`](wireframes/UX-74-attendance-correction-desktop.svg) / [`375px phone`](wireframes/UX-74-attendance-correction-phone.svg)                             |
| UX-75     | Event marked not held                               | `/operate/events/[id]`            | Authorized occurrence operator                     | LAN-80          | [`desktop`](wireframes/UX-75-event-not-held-desktop.svg) / [`375px phone`](wireframes/UX-75-event-not-held-phone.svg)                                           |
| UX-80     | Prepare Monday report                               | `/operate/report`                 | Authorized report operator                         | LAN-81          | [`desktop`](wireframes/UX-80-report-preview-desktop.svg) / [`375px phone`](wireframes/UX-80-report-preview-phone.svg)                                           |
| UX-81     | Monday exception and action report                  | `/operate/report`                 | Authorized report operator                         | LAN-81          | [`desktop`](wireframes/UX-81-stored-report-desktop.svg) / [`375px phone`](wireframes/UX-81-stored-report-phone.svg)                                             |
| UX-82     | Report versions                                     | `/operate/report`                 | Authorized report operator                         | LAN-81          | [`desktop`](wireframes/UX-82-report-versions-desktop.svg) / [`375px phone`](wireframes/UX-82-report-versions-phone.svg)                                         |
| UX-83     | No stored report for this date                      | `/operate/report`                 | Authorized report operator                         | LAN-81          | [`desktop`](wireframes/UX-83-report-empty-desktop.svg) / [`375px phone`](wireframes/UX-83-report-empty-phone.svg)                                               |
| UX-90     | Attendance is not open                              | `/operate/events/[id]/attendance` | Head Coach, OC or DC                               | LAN-110         | [`desktop`](wireframes/UX-90-coach-occurrence-locked-desktop.svg) / [`375px phone`](wireframes/UX-90-coach-occurrence-locked-phone.svg)                         |
| UX-91     | Team Practice attendance                            | `/operate/events/[id]/attendance` | Head Coach, OC or DC                               | LAN-110         | [`desktop`](wireframes/UX-91-coach-attendance-desktop.svg) / [`375px phone`](wireframes/UX-91-coach-attendance-phone.svg)                                       |
| UX-92     | Team Practice attendance                            | `/operate/events/[id]/attendance` | Head Coach, OC or DC                               | LAN-110         | [`desktop`](wireframes/UX-92-coach-saving-desktop.svg) / [`375px phone`](wireframes/UX-92-coach-saving-phone.svg)                                               |
| UX-93     | Team Practice attendance                            | `/operate/events/[id]/attendance` | Head Coach, OC or DC                               | LAN-110         | [`desktop`](wireframes/UX-93-coach-saved-desktop.svg) / [`375px phone`](wireframes/UX-93-coach-saved-phone.svg)                                                 |
| UX-94     | We could not save this change                       | `/operate/events/[id]/attendance` | Head Coach, OC or DC                               | LAN-110         | [`desktop`](wireframes/UX-94-coach-save-failed-desktop.svg) / [`375px phone`](wireframes/UX-94-coach-save-failed-phone.svg)                                     |
| UX-95     | Correct attendance                                  | `/operate/events/[id]/attendance` | Head Coach, OC or DC                               | LAN-110         | [`desktop`](wireframes/UX-95-coach-correction-desktop.svg) / [`375px phone`](wireframes/UX-95-coach-correction-phone.svg)                                       |
| UX-96     | You cannot record attendance for this event         | `/operate/events/[id]/attendance` | Signed-in coach without LAN-110 capability         | LAN-110         | [`desktop`](wireframes/UX-96-coach-unauthorized-desktop.svg) / [`375px phone`](wireframes/UX-96-coach-unauthorized-phone.svg)                                   |
| UX-97     | Add walk-up attendance                              | `/operate/events/[id]/attendance` | Head Coach, OC or DC                               | LAN-80, LAN-110 | [`desktop`](wireframes/UX-97-coach-walk-up-desktop.svg) / [`375px phone`](wireframes/UX-97-coach-walk-up-phone.svg)                                             |

## 12. Review protocol and approval gate

For each ticket, compare the live issue and relationships against its contract, then compare both desktop and 375px screenshots by stable screen ID. Review route, visible data, action labels, terminal states, authorization denials and responsive reflow. Any deviation must name the affected screen ID and owner decision.

The package is ready for owner review only. It must not be labelled approved, implementation-ready, or a fidelity pass until every conflict is resolved and Brian’s dated Notion approval is linked from LAN-90.
