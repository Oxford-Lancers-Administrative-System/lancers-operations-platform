// W3-01 — Say yes to the club, the operator's view. Mission 4's delivery view
// is the nearest analogue: it already shows what was sent and what came back.
appendCard(
  "Where each recruit is in the sign-on flow",
  [
    makeRow("Rosalind Penhaligon", "1 Welcome delivered · waiting"),
    makeRow("Tobias Wrenfield", "5 Complete · in the group, ask answered"),
    makeRow("Marguerite Ashdown", "4 Form sent · waiting"),
    makeRow("Ambrose Kittiwake", "1 Welcome delivered · declined 2 May"),
  ],
  "The five-step ladder Brian described: welcome, they accept, the standard ask, one polite reminder, then the W4 form.",
);
appendCard(
  "What the club sends, and what it can honestly see",
  [
    makeRow("Welcome + group invite", "Sent on capture · delivery observable"),
    makeRow("They joined the group", "Recorded, never watched for"),
    makeRow("They answered the ask", "Observable — they replied to us"),
    makeRow("One polite reminder", "Sent once, then nothing"),
  ],
  "The 2026-08-28 research found group and community membership is not exposed by the Cloud API at all. So the join is something a recruit tells us or an operator records — never something the system watches.",
);
appendCard(
  "Opt-in evidence, per door",
  [
    makeRow("QR self-entry", "They typed their own number"),
    makeRow("Walk-up", "Verbal read-back at capture"),
    makeRow(
      "Operator add",
      "Recorded sentence plus confirmation — the one door with no natural opt-in",
    ),
  ],
  "Recorded here; worded by Mission 8. The welcome does not fire from a door without it.",
);
