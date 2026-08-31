// W5-01 — Capture a walk-up, proposed. The attendance sheet keeps its shipped
// behaviour; what changes is the capture form beside it.
appendCard(
  "Add a walk-up",
  [
    makeRow("First name", "Marguerite"),
    makeRow("Last name", "Ashdown"),
    makeRow("Mobile", "07700 900461"),
    makeRow("Email", "Optional", { muted: true }),
  ],
  "Name and mobile required, email optional — Task 04 D-1. A walk-up the club cannot reach is not captured, knowingly.",
);
appendCard(
  "Read the number back before saving",
  [
    makeRow(
      "Say to them",
      "“I have oh-seven-seven-double-oh nine-oh-oh-four-six-one — is that right?”",
    ),
  ],
  "Task 04 D-4, unimplemented at the baseline. Saving sends a real WhatsApp message to this number, so it is confirmed out loud first.",
);
appendCard(
  "Possible match — decide before saving",
  [
    makeRow("Existing person", "Marguerite Ashdown · Kestrelhall · mobile ends 461"),
    makeRow("Choose", "This is them  ·  This is somebody new"),
  ],
  "The shipped walk-up path mints a person with no interactive check, wider than Task 09's coach-only exception. Recorded as drift by amendment 4 and reconciled here.",
);
appendCard(
  "What saving does",
  [
    makeRow("Creates", "A person, and a recruit at identified"),
    makeRow("Sends", "The welcome and the community-group invite (W3)"),
    makeRow("Records", "Attendance at this event, present"),
  ],
  "Nothing on the shipped screen says any of this. The operator should know what they are about to set off.",
);
