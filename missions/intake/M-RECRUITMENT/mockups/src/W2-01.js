// W2-01 — One recruit's record, proposed.
//
// Built on the shipped person record for the really seeded recruit Rosalind
// Penhaligon. The person cards stay exactly as they are and become read-only
// context; the recruitment cards this mission owns are appended, because Task
// 08's 2026-08-27 amendment forbids them on the person record itself.
setHeading("Rosalind Penhaligon");

// The shipped page renders the Recruit chip twice. That is a defect this
// mission found, and the recruit's own page does not reproduce it.
dedupeHeaderChip("Recruit");

appendCard(
  "Where they are in recruitment",
  [
    makeRow("Status", "", { chip: "identified" }),
    makeRow("Came in through", "QR · Freshers' Fair stand"),
    makeRow("First contact", "28 April 2026"),
    makeRow("Committed on", "Not yet", { muted: true }),
  ],
  "Edited here. Changing this to joined is intercepted by W14 and never written from a cell.",
);

appendCard(
  "What we have seen",
  [
    makeRow("Welcome delivered", "28 Apr, 16:42"),
    makeRow("Joined the community group", "Not recorded", { muted: true }),
    makeRow("Recruit-stage ask", "Not sent", { muted: true }),
    makeRow("Freshers' Fair · 30 Apr", "Invited · no answer · did not attend"),
  ],
  "Dated facts with a source. Never scored, never ranked, and nothing here moves a stage on its own.",
);

appendCard(
  "What we have said",
  [
    makeRow("Welcome + group invite", "28 Apr · delivered"),
    makeRow("Event invitation", "29 Apr · delivered · no reply"),
  ],
  "Every message the club sent, including anything an operator sends from W9.",
);

appendCard(
  "Notes",
  [makeRow("Caspian Hallowfield · 28 Apr", "Came to the stand with a friend from Dunsfold.")],
  "Prose, with an author and a date. Notes are operator-visible only.",
);
