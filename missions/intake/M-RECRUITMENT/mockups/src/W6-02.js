// W6-02 — Two refusals on the manual-add door: somebody who is already a
// player, and a capture with no opt-in evidence.
setHeading("Add a recruit");
const one = drawnPanel("Alaric Brindlewood is already on the team");
one.style.border = "1px solid rgba(178,106,0,0.55)";
one.style.background = "#fdf6ec";
one.append(
  makeRow("He holds", "A 2026-27 membership · active"),
  makeRow("So", "He is a player, not a recruit. Nothing was created."),
  makeRow("Instead", "Open his roster record"),
);
one.append(
  note(
    "Silently creating a recruit beside a live membership would corrupt the funnel and put a member on a board that messages people about joining. Refused, and said plainly.",
  ),
);
const two = drawnPanel("Created — but the welcome has not been sent");
two.style.border = "1px solid rgba(178,106,0,0.55)";
two.style.background = "#fdf6ec";
two.append(
  makeRow("Marguerite Ashdown", "Recruit · identified"),
  makeRow("Not sent", "The welcome and the community-group invite"),
  makeRow("Because", "No opt-in evidence was recorded for this door"),
  makeRow("To send it", "Record how the club came by her number"),
);
two.append(
  note(
    "Task 09 §9.1: operator manual add is the one door carrying no natural opt-in. Meta requires documented opt-in before a first business message and GDPR requires a lawful basis. The recruit exists; the message waits.",
  ),
);
const anchor = cardTemplate();
const host = anchor?.parentElement ?? document.body;
host.append(one, two);
