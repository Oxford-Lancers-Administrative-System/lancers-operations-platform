// W14-01 — The flip confirmation. Drawn: no confirmation of this kind exists
// in the application.
const card = drawnSurface({
  title: "Add Marguerite Ashdown to 2026-27?",
  subtitle: "You are about to put her on the team.",
  chrome: "Interrupts the status change on the recruit board",
  width: 620,
});
const what = drawnPanel("This will");
what.append(
  makeRow("Create", "A season membership for 2026-27"),
  makeRow("Put her on", "The roster, as joined"),
  makeRow("Open", "Onboarding — 12 items"),
  makeRow("Not do", "Make her active. That stays a separate later step."),
);
card.append(what);
const buttons = document.createElement("div");
buttons.style.cssText = "display:flex;gap:12px;align-items:center;margin-top:6px";
const cancel = document.createElement("div");
cancel.textContent = "CANCEL";
cancel.style.cssText =
  "font-size:14px;font-weight:600;letter-spacing:.03em;color:rgba(0,0,0,0.6);padding:11px 18px";
buttons.append(primaryButton("YES, SHE IS IN"), cancel);
card.append(
  buttons,
  note(
    "Brian, 2026-08-31: when it flips to Join there should be a pop-up. Joined means officially added to a season. Cancelling writes nothing. Only the President, Vice President, Secretary or General Manager ever sees this — Task 09 D5.",
  ),
);
