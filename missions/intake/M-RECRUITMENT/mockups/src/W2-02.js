// W2-02 — The same record for a recruit further along, showing what a full
// signal set looks like once the sign-on flow and an event have run.
setHeading("Tobias Wrenfield");
dedupeHeaderChip("Recruit");

appendCard(
  "Where they are in recruitment",
  [
    makeRow("Status", "", { chip: "engaged" }),
    makeRow("Came in through", "Walk-up · Taster session 1"),
    makeRow("First contact", "30 April 2026"),
    makeRow("Committed on", "Not yet", { muted: true }),
  ],
  "Edited here. Changing this to joined is intercepted by W14.",
);

appendCard(
  "What we have seen",
  [
    makeRow("Welcome delivered", "30 Apr, 19:05"),
    makeRow("Joined the community group", "2 May · told us on the day"),
    makeRow("Recruit-stage ask", "Answered 2 May"),
    makeRow("Freshers' Fair · 30 Apr", "Invited · said yes · attended"),
    makeRow("Taster 1 · 30 Apr", "Invited · said yes · attended"),
    makeRow("Taster 2 · 7 May", "Invited · no answer yet"),
  ],
  "The group join is recorded, never watched for: the 2026-08-28 research found group membership is not exposed by the Cloud API at all.",
);

appendCard(
  "What they told us",
  [
    makeRow("Played before", "A bit at school"),
    makeRow("Position interest", "Anywhere, happy to be told"),
    makeRow("Gear owned", "Boots only"),
    makeRow("How they heard of us", "Friend on the team"),
  ],
  "The recruit-stage field set, from W4. Every field optional; nothing here gates anything.",
);

appendCard(
  "Notes",
  [makeRow("Caspian Hallowfield · 2 May", "Played at school. Asked about kit.")],
  "Prose, with an author and a date.",
);
