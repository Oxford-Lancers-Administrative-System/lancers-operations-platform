// W8-01 — Resolve a possible duplicate, proposed. The shipped merge screen is
// the nearest analogue, but merge resolves two records that both exist; this
// queue resolves a submission that does not exist yet against one that does.
setHeading(
  "Captures waiting for a decision",
  "3 waiting · nothing created and nothing sent until you decide",
);
appendCard(
  "Submitted at the QR, 7 May 14:12",
  [
    makeRow("They typed", "Marguerite Ashdown · 07700 900461 · Kestrelhall"),
    makeRow("We already hold", "Marguerite Ashdown · mobile ends 461 · recruit since 22 Apr"),
    makeRow("Decide", "This is them  ·  This is somebody new"),
  ],
  "Held: no person created, no recruit created, no welcome sent. Task 09 §3 — an existing member never receives a “welcome to the club” message.",
);
appendCard(
  "Submitted at the QR, 7 May 14:31",
  [
    makeRow("They typed", "A. Kittiwake · 07700 900112"),
    makeRow("We already hold", "Ambrose Kittiwake · mobile ends 112 · declined 2 May"),
    makeRow("Decide", "This is them  ·  This is somebody new"),
  ],
  "A declined recruit signing up again is a real case, and it is the operator's to read — not the system's to guess.",
);
appendCard(
  "Walk-up, Taster 2, 7 May 18:40",
  [
    makeRow("Captured", "Peregrine Oakhollow · 07700 900233"),
    makeRow("Possible match", "Peregrine Oakhollow · mobile ends 233 · current member"),
    makeRow("Decide", "This is them  ·  This is somebody new"),
  ],
  "Attendance was recorded regardless. Capture always stands; only the recruit record waits.",
);
