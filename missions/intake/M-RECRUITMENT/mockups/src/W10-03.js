// W10-03 — The templates behind the cycle. Moved here from W3 when Brian folded
// that workflow into the doors and W10 on 2026-08-31.
//
// Every business-initiated WhatsApp message is a Meta-approved template; free
// text is not a production shape (src/lib/delivery/config.ts). Only
// event_invitation exists today. The lead time on the other four is a real gate.
setHeading("Recruitment messages", "Season 2026-27 · approved WhatsApp templates");

const anchor = cardTemplate();

// 1. The four templates recruitment needs, and the one that already exists.
const host = proposedRegion("The recruitment templates");
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
placeBefore(anchor, host);
mark(host, 1);

// 2. The one template already approved, beside four that are not. The distance
//    between those two states is the whole schedule risk in this mission.
const approved = [...host.children].find((c) => /Approved · in use/.test(c.textContent));
if (approved) mark(approved, 2);
