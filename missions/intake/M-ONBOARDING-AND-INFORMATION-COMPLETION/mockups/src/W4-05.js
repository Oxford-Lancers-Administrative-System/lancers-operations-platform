// W4-05 — Expired, revoked, or never real: the one uniform page.
//
// `/a/[token]/not-found.tsx` already renders one response for every unusable
// link — unknown, revoked and expired alike, at 404, with identical copy and
// no variant that could let them diverge. W4 keeps that page exactly: its
// heading, its privacy line, its single Close, its status code.
//
// One sentence cannot come across. The shipped body says "If the event has
// already started, response changes are closed", which is the answer link's
// own business and not true of a collection link. That sentence is the whole
// change on this screen, and it is why this workflow does not get to claim the
// page is reused verbatim.
const card = must($(".MuiPaper-root"), "the dead-link page has no card");
must(
  $$("h1").find((h) => /link can.t be used/i.test(h.textContent)),
  "this is not the uniform dead-link page",
);
const privacy = must(
  $$("p").find((p) => /can.t provide more information about this link/i.test(p.textContent)),
  "the dead-link page has lost its privacy line",
);
const body = must(
  $$("p").find((p) => /request the latest message from the club/i.test(p.textContent)),
  "the dead-link page has lost its body line",
);

// 1 — the one sentence that changes. Everything else on this page stays.
body.textContent =
  "Request the latest message from the club. Whenever the club sends you a new one it carries your current link.";
mark(body, 1);

// 2 — and the two things that must not change: it never says which of unknown,
//     expired or revoked this link is, and it is the same page for all three.
mark(privacy, 2);

await settle();
