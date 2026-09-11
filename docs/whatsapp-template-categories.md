# WhatsApp template categories: Utility versus Marketing

How Meta decides whether a message template is Utility or Marketing, why the
club cares, and what a template must say to be accepted as Utility.

Everything below was established empirically against the club's live WhatsApp
Business Account on 11 September 2026 by submitting templates one variable at a
time and recording what Meta's classifier did. Where a rule is Meta's own
published wording it is marked as such; everything else is observed behaviour on
this account and could change.

Related: `src/lib/delivery/templates.ts` declares every template the club sends.
LAN-334 carries the probe-by-probe evidence; LAN-335 carries the rebuild.

## Why this matters

Meta paused Marketing template messages to **United States phone numbers** on
1 April 2025. The pause is still in force with no announced end date. A
Marketing template sent to a US number fails with error `63049`.

Utility and authentication templates are unaffected.

The club recruits players who are in the United States before they arrive in
Oxford. Every template the club registered before September 2026 was Marketing,
so none of them could reach those people at all.

## There is no way to reclassify an existing template

Verified in WhatsApp Manager on 11 September 2026. All three routes are closed:

- **Business Support Home → Template category updates** lists only categories
  _Meta_ changed after submission, so it can be contested. It is empty for this
  account, because the club accepted Marketing at creation. The Request review
  button is disabled.
- The **template detail page** has no appeal control.
- The **edit form** allows the body to be edited but renders the category as
  static text. Name and language are locked too.

The only route to Utility is a **new template under a new name**.

### Take the rejection, not the downgrade

When you select Utility on a body the classifier reads as Marketing, a dialog
appears at submission:

> **Category does not match.** To make sure your message template gets approved,
> please choose a category that matches the content in this template.
> Utility _Selected_ / Marketing _Recommended_.
> This message template will be rejected. You can request a review in Business
> Support Home.

Press **Continue** and the template is submitted as Utility, rejected, and then
appears in **Business Support Home → Rejected message templates**, which does
carry a working Request review button, a rejection reason, and a Reversed
outcome.

Press Cancel and accept Marketing instead and you get nothing to contest, ever.
That is how the club ended up with fourteen unappealable Marketing templates.

**So: submit as Utility and let it be rejected rather than downgrading at
creation.** A rejection is recoverable; an accepted downgrade is not.

## The dialog is a free test loop

The classifier runs on **Submit for review**, before the template is created.
Pressing Cancel creates nothing. Wording can therefore be iterated as many times
as needed at no cost and with no trace in the account: fill the form, submit,
read the verdict, cancel, change one thing, submit again.

Use this rather than guessing. It is also the only reliable oracle — Meta's
published guidance does not predict its behaviour well (see below).

## The three rules

A template must satisfy all three. They are independent; passing two is a
rejection.

### 1. Some words force Marketing regardless of context

| Rejected                                  | Accepted               |
| ----------------------------------------- | ---------------------- |
| `invited`                                 | `on the team sheet`    |
| `registration`                            | `response`, `answers`  |
| `details`, `items` — when asking for them | `answers`, `questions` |

`You are invited to {{2}} on {{3}}` was rejected with the buttons stripped and a
confirmation sentence appended. Putting `invited` back into an otherwise
accepted template flipped it again. The trigger is the word.

`details` is contextual rather than a flat blocklist: the change-notice template
passed while containing "the details for {{2}} have changed", because it states
a fact instead of requesting something.

### 2. The body must contain a `for {{thing}} on {{date}}` construction

This is the rule that is not in Meta's documentation and is the one most likely
to be missed.

- `your answers for {{2}} are still outstanding` — **rejected**
- `your answers for {{2}} on {{3}} are still outstanding` — **accepted**

Nothing else differed. The `{{thing}}` does not have to be an event: "the 2026
season" and "your Oxford Lancers sign-up" both passed. It is the date slot the
classifier wants.

This has a consequence for the code. Seven message kinds had no date to supply —
see "What this forces in the application" below.

### 3. State a status, never a request

The sentence must report the state of the recipient's own record. A message
phrased as the club wanting something is Marketing even with a correct anchor.

- `before {{2}} on {{3}} the club still needs some details from you` — **rejected**
- `your answers for {{2}} on {{3}} are still outstanding` — **accepted**

## What does not affect the category

Each of these was tested directly and changed nothing:

- **Buttons.** Identical copy was accepted with no buttons and with two Yes/No
  URL buttons attached. Button count, button labels and button type are all
  irrelevant to categorisation.
- **Sample values.** A rejected body stayed rejected when its samples were
  changed to event-like values.
- **A reference identifier.** `your submitted form {{2}} is incomplete. {{3}}
items are still required` was rejected with a realistic reference and a count.
- **Message length and variable count.** Accepted templates carry two, three,
  four and five variables. Brevity is not required, and stripping content to the
  minimum is a mistake — it loses information for nothing.
- **The URL domain.** An ngrok tunnel host was accepted on a Utility template.
  Meta's stated rule that template URLs must be on a business-owned domain from
  1 January 2026 is not enforced on this account.

## Meta's own guidance, and where it falls short

Meta defines Utility as messages that "follow up on user actions or requests,
since these messages are typically triggered by user actions", and requires them
to be non-promotional and either user-specific or essential to the user. It
forces Marketing on promotional content, mixed content, and templates whose
"contents are only placeholder text".

That is directionally right and operationally useless. It does not mention the
date-anchor rule, it does not identify which specific words are triggers, and it
does not explain why an internal admin alert with no promotional content
whatsoever is classified Marketing. Use the three rules above and the free test
loop; treat the published guidance as background.

## Writing conventions for club templates

Settled by Brian on 11 September 2026.

**Spacing.** A blank line between logical blocks, not between every sentence:
the statement, then the detail, then the call to action and sign-off together.

```
Hello {{1}}, you are on the team sheet for {{2}} on {{3}}.

Venue: {{4}}.

Please respond by {{5}}. Thank you.
```

No trailing space before a line break.

**Validity period: 12 hours.** The default is 10 minutes, which silently
discards any message whose recipient is asleep or out of signal when the
scheduler fires. On the create form: Message validity period → Set custom
validity period for your message → 12 hours. The toggle is off by default and
the section sits below Buttons, at the very bottom.

**Dynamic button URLs.** The base URL goes in the field and Meta appends `{{1}}`
itself; typing `{{1}}` yourself produces `/a/{{1}}{{1}}`.

**Two dynamic buttons cannot share an identical base URL.** With both set to
`.../a/`, Submit for review is silently disabled — no error text, no red field,
nothing marked invalid in the DOM. Meta shows a visible message for duplicate
button _text_ but not for duplicate button _URLs_. Give each button its own
path, for example `/a/yes/` and `/a/no/`.

## What this forces in the application

Rule 2 requires a date in every template. `whenLabel` is already a required
field on `OutboundMessage` and is already threaded through the dispatcher and
the provider, so no new plumbing is needed — but four call sites in
`src/lib/services/messaging-scheduler.ts` pass `whenLabel: ""`, with the comment
that the field is "declared but unused by this template".

Those sends are triggered by a person's state rather than a scheduled event, so
there was never a date to supply. Dates that do exist in those flows:

- onboarding welcome and chase — the configured chase cadence's exhaustion
  point, or the season start.
- the four recruit cycle steps — `recruitment_cycle_steps` carries each step's
  timing.

Seven kinds need a date added: `nudge`, the four `recruit_*` cycle templates,
`onboarding_welcome` and `onboarding_chase`. `recruit_details_reminder`
currently declares no parameters at all.

Meta's parameters are positional and a template cannot skip a slot, so any
optional field promoted into a template — venue, response deadline, change
summary — needs a declared fallback or the send is refused at render time.

## Deleting a template locks its name

> Deleting a template is permanent and can't be undone. Deleted template names
> can't be reused for up to 30 days.

Plan replacements before deleting anything. Replacing the production templates
means either new names, or a month with no template under the old name.
