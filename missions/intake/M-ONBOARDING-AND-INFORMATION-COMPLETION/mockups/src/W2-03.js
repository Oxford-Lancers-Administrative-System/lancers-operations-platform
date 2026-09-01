// W2-03 — Where the operator lands.
//
// The shipped redirect goes to /operate/roster/[membershipId]?created=1, and
// that page already renders a confirmation banner — `created-summary`, reading
// "Person and 2026-27 membership were created together." The record already
// shows the generated checklist too.
//
// So this screen invents nothing. It rewrites one shipped sentence to name the
// one new fact: a welcome is queued.
//
// The earlier draft added a "What the club has said" card. That was wrong twice
// over: it invented a UX element (Brian, 2026-09-01), and the per-player
// activity log is W6's — S32, T10-activity-log, PR7-activity-log and
// OD7-log-by-section all name W6 as its owner. Where the welcome shows on the
// record is W6's question, not this workflow's.
selectRosterNav();

const banner = must(
  $('[data-testid="created-summary"]'),
  "the record is not showing its ?created=1 confirmation banner",
);
banner.textContent =
  "Person and 2026-27 membership were created together. Their onboarding checklist is " +
  "generated, and their welcome is queued \u2014 the same message an imported player receives. " +
  "Nothing else is sent until they tick their consent.";
mark(banner, 1);

// The checklist below is not drawn and not changed: it is what the shipped
// transaction generated. Marked so the reviewer knows to read it as evidence.
const onboarding = $$(".MuiPaper-root").find((card) =>
  /subscription invoiced/i.test(card.textContent),
);
if (onboarding) mark(onboarding, 2);

await settle();
