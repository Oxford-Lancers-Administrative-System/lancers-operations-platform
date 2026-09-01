// W11-04 — The NO page, as it ships, with the reason filled in for them.
//
// Brian, 2026-08-31: "They either have 'accept' or nothing... they should be
// fine if it's required, and no reason is ever given. It just should be a no,
// and the 'no reason' field is just going to be put in for them... We never ask
// them for a reason."
//
// This is the same shipped saved page as W11-03, photographed with a declined
// response recorded. The recruit was never shown the reason step: they tapped
// "No" in WhatsApp and arrived here.
//
// THE CONSTRAINT IS NOT WEAKENED. `rsvp_responses_no_requires_a_reason` still
// holds — a non-acceptance without a reason is unsubmittable, checked by the
// database. What changes is who supplies it: for a recruit the system writes
// "No reason given" and never asks. Attendance is not mandatory for somebody who
// is not a member, so there is nothing to explain and nothing to chase.
//
// Brian's own copy for this page — "We'll miss seeing you. If you want to
// change, go back here" — is a later flow and is not drawn over the shipped
// words here.
const heading = must(
  [...document.querySelectorAll("h1, h2, .MuiTypography-root")].find((n) =>
    /your response is saved/i.test(n.textContent),
  ),
  "the saved page is not showing its heading",
);
mark(heading, 1);

const change = [...document.querySelectorAll("a, button")].find((b) =>
  /change response/i.test(b.textContent),
);
if (change) mark(change, 2);

await settle();
