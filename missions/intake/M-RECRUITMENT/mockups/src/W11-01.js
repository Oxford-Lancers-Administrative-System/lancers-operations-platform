// W11-01 — Run a recruitment event, proposed. The change is the approval
// summary: today it states one audience number and omits recruits from it.
appendCard(
  "Before you approve — who this reaches",
  [
    makeRow("Players", "18 · normal reminder-and-escalation ladder"),
    makeRow("Recruits", "6 · one invitation, and at most one polite follow-up"),
    makeRow("Coaches", "4 · normal ladder"),
  ],
  "Two ladders, not one suppressed ladder. Brian, 2026-08-31: recruits get a recruit chase, and it needs to be a totally separate thing.",
);
appendCard(
  "What each audience will actually receive",
  [
    makeRow(
      "A player",
      "Invitation now · reminder at 48h · escalation to the President at 24h before",
    ),
    makeRow("A recruit", "Invitation now · one polite follow-up at 48h · then nothing, ever"),
    makeRow("A recruit who says no", "Nothing further. No reason is asked of them."),
  ],
  "R5's reason-on-no is a member obligation. Demanding one of a recruit is harsh, and this is where that shows up.",
);
appendCard(
  "The defect this fixes",
  [
    makeRow(
      "Today, at main@e669331",
      "scheduleEventLadder inserts a reminder for every invitation, filtered only by event_id",
    ),
    makeRow("So a recruit today", "Receives the full player escalation ladder"),
    makeRow("And countByCapacity", "Omits recruits from these counts entirely"),
  ],
  "Both verified in the running code. The owner decision of 2026-08-26 fixes them at this mission, and the never-harsh amendment changes the fix from suppression into a second ladder.",
);
