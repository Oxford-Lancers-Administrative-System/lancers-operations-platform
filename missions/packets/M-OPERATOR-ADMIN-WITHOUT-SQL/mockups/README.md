# Administration UI prototype

Open [`administration-prototype.html`](administration-prototype.html) in a browser. It is a
self-contained, responsive, code-native prototype with no build step or external assets.

## Controlling visual decisions

The prototype locks the reviewed information architecture, labels, states, action placement,
grouping and responsive behavior for this mission:

- Administration sits at the bottom of the left navigation, above the signed-in account.
- Operators and Roles are the only Administration destinations.
- Invite Operator is the top-right primary action.
- How Administration Works is a compact question-mark link beside the page heading, never a
  callout or sidebar destination.
- Operators are grouped as Standing Officers, Club Officers and Coaches.
- Roles are grouped as Operational Administration, Club Committee and Coaching Staff.
- The prototype includes Operators, Roles, operator detail, role detail, invitation, role
  replacement, role ending, operator deactivation/restoration, email recovery and the FAQ guide.
- Operator account state and organizational role state remain visibly separate.
- Invitation pending, Delivery failed, Active, Deactivated and Email change pending use both
  text and distinct visual treatment.
- Role detail presents Current holder, Permissions and Holder history.
- Operator detail presents Operator account, Current roles and Operator audit history.
- All coach permission copy says attendance and availability only. It does not say injury.
- There are no in-application callouts.

## Deliberately illustrative

Synthetic names, dates, record counts, exact spacing, border shades and responsive reflow below
the locked hierarchy are illustrative. Implementation should use the existing Material UI theme
and components, preserve accessibility, and receive Brian's live desktop and 375px visual review.

This prototype is acceptance evidence and implementation guidance. It is not application code,
does not define database or authorization behavior, and does not authorize mission execution.
