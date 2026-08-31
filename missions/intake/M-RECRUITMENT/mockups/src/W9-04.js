// W9-04 — Refused. The never-harsh rule is a guarantee, so it has to be visible
// somewhere. This is where.
const card = drawnSurface({
  title: "You cannot message Ambrose Kittiwake",
  subtitle: "He declined on 2 May.",
  chrome: "Opened from his row on the recruit board",
  width: 620,
});
const why = drawnPanel("Why");
why.append(
  makeRow("His status", "declined — recorded 2 May by Caspian Hallowfield"),
  makeRow("What that stops", "Everything. Invitations, reminders, and anything sent from here."),
  makeRow(
    "What would change it",
    "Only Ambrose. If he gets back in touch, an operator moves him back.",
  ),
);
card.append(
  why,
  note(
    "A recorded refusal never coexists with continued messaging. The composer refuses and says why rather than sending and failing — and this is the same rule that would stop a well-meant nudge to somebody who asked to be left alone.",
  ),
);
