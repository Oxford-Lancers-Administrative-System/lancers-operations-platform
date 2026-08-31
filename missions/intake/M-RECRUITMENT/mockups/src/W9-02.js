// W9-02 — Choosing what to send. The first draft had an operator typing a
// bespoke message; that is not a shape WhatsApp permits for a business-
// initiated send. An operator picks an approved template and triggers it.
const card = drawnSurface({
  title: "Send Rosalind something",
  subtitle: "She has not answered since 29 April. Nothing here is typed — you pick what goes.",
  chrome: "Opened from her record",
  width: 680,
});
const list = drawnPanel(null);
list.style.cssText += ";border:none;box-shadow:none;padding:0";
list.append(
  templateRow(
    "recruit_details_ask",
    "Hi Rosalind — when you have a minute, this tells us what to put on for you: [her link]",
    "Recommended · she has not been asked",
  ),
  templateRow(
    "recruit_interest_ask",
    "Hi Rosalind — are you interested in coming along to a session? Reply YES or NO.",
    "Already sent 28 Apr",
  ),
  templateRow(
    "event_invitation",
    "Hi Rosalind — Taster 2 is on Thursday 7 May at 18:00. Let us know if you can make it.",
    "Approved · in use",
  ),
);
card.append(list);
const send = document.createElement("div");
send.style.cssText = "display:flex;gap:12px;align-items:center;margin-top:6px";
const b = document.createElement("div");
b.textContent = "SEND recruit_details_ask";
b.style.cssText =
  "background:#00695c;color:#fff;font-size:13px;font-weight:700;padding:11px 20px;border-radius:6px";
const c = document.createElement("div");
c.textContent = "CANCEL";
c.style.cssText = "font-size:13px;font-weight:700;color:rgba(0,0,0,0.6);padding:11px 14px";
send.append(b, c);
card.append(
  send,
  note(
    "No free-text box, because there cannot be one: every business-initiated WhatsApp message must be a Meta-approved template — src/lib/delivery/config.ts, “template is the only production shape”. The polite thing is the fast thing because the polite thing is the only thing.",
  ),
);
