// W9-03 — Sent. The same record a moment later. The message is on her record,
// attributed to the operator who sent it, and it is the last thing said.
setHeading("Rosalind Penhaligon");
dedupeHeaderChip("Recruit");

const banner = drawnPanel(null);
banner.style.cssText +=
  ";background:#e8f5e9;border:1px solid rgba(46,125,50,0.45);padding:14px 18px;margin-bottom:16px";
const line = document.createElement("div");
line.textContent = "Sent to Rosalind on WhatsApp. It will show below in a moment.";
line.style.cssText = "font-size:14px;color:#1b5e20;font-weight:600";
banner.append(line);
const first = cardTemplate();
if (first?.parentElement) first.parentElement.insertBefore(banner, first);

appendCard(
  "What we have said",
  [
    makeRow("Welcome + group invite", "28 Apr · delivered"),
    makeRow("Event invitation", "29 Apr · delivered · no reply"),
    makeRow("Follow-up · Caspian Hallowfield", "Today, 14:06 · delivered"),
  ],
  "Every operator-sent message lands here, attributed to the person who sent it. That attribution is what makes an operator-composed message safe to allow at all.",
);
appendCard(
  "What the board shows now",
  [makeRow("Last touch", "Follow-up, today"), makeRow("Her status", "", { chip: "identified" })],
  "Sending is the club talking, not the recruit answering, so it moves nothing on the ladder. Only something she does can do that.",
);
