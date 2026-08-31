// W6-01 — Add a recruit by hand, proposed. The shipped add-a-person form and
// its duplicate check are reused wholesale; one card is added, because this is
// the one door with no natural opt-in.
setHeading("Add a recruit");
appendCard(
  "How we came by this number",
  [
    makeRow("Where from", "Met at the Freshers' Fair; gave me her number for this"),
    makeRow("They expect to hear from us", "Yes — confirmed at the time"),
  ],
  "Task 09 §9.1: operator manual add is the one door carrying no natural opt-in. Meta requires documented opt-in before a first business message and GDPR requires a lawful basis, so the welcome does not fire from this door without this.",
);
appendCard(
  "Recruitment",
  [
    makeRow("Source", "Operator · sourced"),
    makeRow("First note", "Recommended by Tobias. Played flag at school."),
  ],
  "Optional, and recorded while it is fresh.",
);
