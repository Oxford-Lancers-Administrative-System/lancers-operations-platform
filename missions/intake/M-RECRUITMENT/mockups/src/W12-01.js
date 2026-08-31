// W12-01 — Attendance at a recruitment event, proposed. The sheet derives its
// roster from memberships, so invited recruits do not appear on it at all.
setHeading("Freshers' Fair — stand", "30 April 2026 · recruits first, everyone else below");
appendCard(
  "Recruits invited to this event",
  [
    makeRow("Rosalind Penhaligon", "Present  ·  Not present  ·  Not recorded"),
    makeRow("Tobias Wrenfield", "Present  ·  Not present  ·  Not recorded"),
    makeRow("Marguerite Ashdown", "Present  ·  Not present  ·  Not recorded"),
    makeRow("Clementine Varrow", "Present  ·  Not present  ·  Not recorded"),
  ],
  "Task 09 D11: recruits at the top, everyone else below, optimised for scanning who showed up. Names only — a recruit's funnel status never appears on a sheet a coach can open.",
);
appendCard(
  "What a recruit's absence means",
  [
    makeRow(
      "A player who does not turn up",
      "Has an obligation they did not meet. Feeds the chase.",
    ),
    makeRow(
      "A recruit who does not turn up",
      "Has told the club something mild. Noted on their row, and nothing else happens.",
    ),
    makeRow("Not recorded", "Stays not recorded. Never becomes Absent."),
  ],
  "“Did not show up” is deliberately not a recruit status — Brian, 2026-08-28.",
);
appendCard(
  "Turnout",
  [makeRow("Today", "14 recorded present — 4 recruits, 8 players, 2 walk-ups captured here")],
  "Turnout is the sum of the attendance records. There is no separate headcount — Task 09 D8, which supersedes Register F4 for Release One.",
);
