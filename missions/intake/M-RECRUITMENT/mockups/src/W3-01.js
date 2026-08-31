// W3-01 — The messages the club actually sends. Every business-initiated
// WhatsApp message is a Meta-approved template; free text is not a production
// shape (src/lib/delivery/config.ts). Only event_invitation exists today.
setHeading("Recruitment messages", "Season 2026-27 · approved WhatsApp templates");
const host = drawnPanel("The recruitment templates");
host.append(
  templateRow(
    "recruit_welcome",
    "Hi {{1}} — welcome to the Oxford Lancers. Great to meet you at {{2}}. Here is our community group: {{3}}",
    "Not yet submitted",
  ),
  templateRow(
    "recruit_interest_ask",
    "Hi {{1}} — are you interested in coming along to a session? Reply YES or NO. No commitment either way.",
    "Not yet submitted",
  ),
  templateRow(
    "recruit_details_ask",
    "Hi {{1}} — when you have a minute, this tells us what to put on for you: {{2}}",
    "Not yet submitted",
  ),
  templateRow(
    "recruit_gentle_reminder",
    "Hi {{1}} — no rush at all, just checking you saw this. Reply whenever suits.",
    "Not yet submitted",
  ),
  templateRow(
    "event_invitation",
    "Hi {{1}} — {{2}} is on {{3}} at {{4}}. Let us know if you can make it.",
    "Approved · in use",
  ),
);
const n = document.createElement("p");
n.textContent =
  "Four new templates, each needing Meta approval with real lead time before any of this can send. " +
  "Nobody types a message to a recruit: an operator triggers one of these, and the club's voice is the " +
  "template rather than whoever happened to be holding the phone.";
n.style.cssText =
  "margin:14px 0 0;font-size:12.5px;color:rgba(0,0,0,0.6);font-style:italic;line-height:1.6";
host.append(n);
const anchor = cardTemplate();
(anchor?.parentElement ?? document.body).append(host);
