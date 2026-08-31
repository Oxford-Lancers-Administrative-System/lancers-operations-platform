// W10-01 — Administer recruitment's machinery, proposed. The shipped messaging
// schedule is the shell and the language; recruitment's cycle is a sibling
// object in that language, not a new column on it.
setHeading(
  "Recruitment cycle",
  "Season 2026-27 · what recruitment sends, in what order, and who may change it",
);
appendCard(
  "The boundary",
  [
    makeRow("Mission 4 owns", "The scheduler, the transport, delivery states and retry"),
    makeRow(
      "Recruitment owns",
      "What is sent, on what trigger, in what order, and whether a step runs at all",
    ),
    makeRow("The line", "Recruitment declares a cycle. It never schedules."),
  ],
  "This is the boundary Brian asked to be found by walking the workflow rather than guessed in the abstract. Proposed, not settled.",
);
appendCard(
  "The cycle",
  [
    makeRow("1 · Welcome + group invite", "On capture, every door · ON"),
    makeRow("2 · Standard recruit ask", "Immediately after they accept · ON"),
    makeRow("3 · Polite reminder", "1 day later, if nothing came back · ON"),
    makeRow("4 · Recruit-stage form", "1 day after the welcome · ON"),
    makeRow("5 · Form reminder", "3 days later, once only · ON"),
  ],
  "Each step's content is editable, and any step can be turned off entirely — boundary item 43. A step that is off is stated on the recruit's record, so a quiet recruit is never mistaken for a disinterested one.",
);
appendCard(
  "The community-group link",
  [
    makeRow("Current link", "chat.whatsapp.com/… · last changed 14 Apr by Caspian Hallowfield"),
    makeRow("Carried by", "Step 1, and every QR page"),
  ],
  "The most likely silent failure in the mission: the link rotates, recruits are invited to a dead group, and nobody finds out. When it was last changed is on the screen for that reason.",
);
appendCard(
  "QR codes",
  [
    makeRow("Freshers' Fair stand", "Live · 41 submissions · minted 22 Apr"),
    makeRow("Taster poster, Michaelmas", "Live · 7 submissions · minted 2 May"),
    makeRow("Old handout, Hilary 2025-26", "Revoked 14 Apr · 0 since"),
  ],
  "Minted, named, and revocable. A revoked code shows the uniform invalid page, and the count says how much a poster still in the wild is actually doing.",
);
