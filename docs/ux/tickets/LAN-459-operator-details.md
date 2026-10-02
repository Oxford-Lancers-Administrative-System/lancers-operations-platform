# LAN-459 — The operator details form, and a seat's details request

**Workflow:** operator onboarding with a phone number or an email
**Routes:** `/me/details` (new, signed in), `/onboarding/[token]` (an `operator_details` link opens this form instead of the player questionnaire), `/operate/admin/roles/[roleId]` (the Current holder line), `/operate/admin/operators/new` (Invite operator)
**Shared contract:** [`../slice-ux.md`](../slice-ux.md) · [`../standards.md`](../standards.md)

## Authority

The form's content is Brian's, approved on 2 October 2026 on LAN-459; no
separate design round. The built screen is covered by the delivery's normal
visual check at desktop and 375px.

## The form

One component (`src/app/_operator-details/details-form.tsx`), used signed in
and from the link; only the action differs. Inside `PublicShell` (no operator
navigation — the app comes after the form), a page heading **Your details**,
then one **Personal information** section, one column at every width:

| Field          | Required | Prefilled from                               |
| -------------- | -------- | -------------------------------------------- |
| First name     | yes      | the person record                            |
| Middle name    | no       | the person record                            |
| Last name      | yes      | the person record                            |
| Known as       | no       | the display alias                            |
| Mobile phone   | yes      | the current phone (the shared phone control) |
| Personal email | yes      | the current personal email                   |
| Date of birth  | no       | the person record                            |

No emergency contact, no student or college question, no "Not now": **Save**
is the only button. A refusal is shown against its field (a required field
blank, a malformed number or date, an address another record holds, and a
college address in Personal email). A recruit or player who is also an operator
sees only the required fields still missing.

Saved from the link, the form is replaced by a **Details saved** section with
one fact, **Sign-in invitation sent to** and the address. Saved signed in, the
operator lands on `/operate`.

### Desktop

```
┌──────────────────────────────────────────────────────────────┐
│ [crest] Oxford Lancers                                       │
├──────────────────────────────────────────────────────────────┤
│  Your details                                                │
│  * is required.                                              │
│  ┌ Personal information ─────────────────────────────────┐   │
│  │ First name *            [Ansel                      ] │   │
│  │ Middle name             [                           ] │   │
│  │ Last name *             [Wexcombe                   ] │   │
│  │ Known as                [                           ] │   │
│  │ Mobile phone *          [+44 ▾][7700 900123         ] │   │
│  │ Personal email *        [                           ] │   │
│  │ Date of birth           [DD/MM/YYYY             📅  ] │   │
│  └───────────────────────────────────────────────────────┘   │
│                                               [   Save   ]   │
└──────────────────────────────────────────────────────────────┘
```

### 375px

```
┌─────────────────────────────┐
│ [crest] Oxford Lancers      │
├─────────────────────────────┤
│ Your details                │
│ * is required.              │
│ ┌ Personal information ───┐ │
│ │ First name *            │ │
│ │ [Ansel                ] │ │
│ │ Middle name             │ │
│ │ [                     ] │ │
│ │ Last name *             │ │
│ │ [Wexcombe             ] │ │
│ │ Known as                │ │
│ │ [                     ] │ │
│ │ Mobile phone *          │ │
│ │ [+44▾][7700 900123    ] │ │
│ │ Personal email *        │ │
│ │ [                     ] │ │
│ │ Date of birth           │ │
│ │ [DD/MM/YYYY        📅 ] │ │
│ └─────────────────────────┘ │
│ [          Save           ] │
└─────────────────────────────┘
```

## The seat page

On the Current holder line, under the period: **Details requested**, **Details
request not delivered**, or **Details received · address**, in the line's
secondary text. A holder with no account and no usable email has **Send details
request**, the app's standard outlined button, beside the existing Send
invitation. In Assign role and Replace role, a chosen person with no email but a
phone reads **Operator account: Created when they send their details** and
**Details request by WhatsApp to** the number, with an optional **Login email**.

## Invite operator

Email is no longer required; **Phone** is the same shared control. Send
invitation is held until a role is chosen and there is an email, a phone number
or an existing person chosen. With no email, the outcome is a notice on the
form ("The role is assigned. Details request sent by WhatsApp.") rather than the
operator record, because there is no account yet.
