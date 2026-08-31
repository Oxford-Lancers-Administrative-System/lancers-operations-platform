// W4-03 — How the ask actually goes out: an automated template carrying her
// signed link, fired by the cycle rather than typed by anyone.
setHeading("Recruitment cycle", "Season 2026-27 · when each template fires");
const host = drawnPanel("Step 4 — the recruit-stage ask");
host.append(
  templateRow(
    "recruit_details_ask",
    "Hi {{1}} — when you have a minute, this tells us what to put on for you: {{2}}",
    "Not yet submitted",
  ),
);
const rows = drawnPanel(null);
rows.style.cssText += ";border:none;box-shadow:none;padding:0";
rows.append(
  makeRow("Fires", "One day after the welcome, automatically"),
  makeRow("{{2}} is", "Her own signed link — minted for her, linked to her person"),
  makeRow("If she does not answer", "One reminder, three days later, once"),
  makeRow("Then", "Nothing, until an operator chooses to ask again"),
  makeRow("An operator can", "Send it now, or resend it, from her record"),
);
host.append(rows);
const anchor = cardTemplate();
(anchor?.parentElement ?? document.body).append(host);
