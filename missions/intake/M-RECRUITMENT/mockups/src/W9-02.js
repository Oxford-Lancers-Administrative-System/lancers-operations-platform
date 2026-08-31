// W9-02 — The follow-up composer. Drawn: no composer exists anywhere in the
// application. Mission 5 composes, schedules and sends nothing, and Mission 4
// sends only from its ladder.
const card = drawnSurface({
  title: "Say something to Rosalind Penhaligon",
  subtitle: "WhatsApp · approved 28 April · last heard from her: never",
  chrome: "Opened from her row on the recruit board",
});
const outstanding = drawnPanel("What she has not done");
outstanding.append(
  makeRow("Recruit-stage ask", "Never sent"),
  makeRow("Freshers' Fair, 30 Apr", "Invited · no answer · did not attend"),
);
card.append(outstanding);
const pick = drawnPanel("Start from one of these");
pick.append(
  makeRow("Ask for their details", "“Hi Rosalind — lovely to meet you at the Fair…”"),
  makeRow("Invite them along", "“Hi Rosalind — we have a taster on Thursday at 6…”"),
  makeRow("Just say hello", "“Hi Rosalind — how are you finding things?…”"),
);
card.append(pick);
card.append(
  field(
    "Your message",
    "“Hi Rosalind — lovely to meet you at the Fair. When you have a minute, could you fill this in? It helps us know what to put on for you.”",
  ),
  primaryButton("SEND"),
  note(
    "One recruit, one message, sent by a person, now. This surface never grows a cadence, a rung or a bulk send — invariant 1. Brian, 2026-08-31: the messages should be good, and it should be easy.",
  ),
);
