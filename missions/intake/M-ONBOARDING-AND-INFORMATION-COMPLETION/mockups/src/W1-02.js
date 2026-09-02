// W1-02 — Choosing a file, and the season it will write into.
//
// Route: /operate/events/import, the shell this reuses. /operate/roster/import
// does not exist on `main`; the frame says so and the URL bar shows what was
// really photographed.
selectRosterNav();
setHeading("Import last season's squad");
setSubheading(
  "Nothing is written until you confirm. The file is read, compared with the roster, and shown to you first.",
);

// The season is stated before a file is chosen, because the import inherits it
// and never asks. OD7-season-inherit, Brian 2026-09-01.
//
// The first attempt rewrote leaf text nodes and silently changed nothing: each
// list item holds a <strong> plus its text, so the leaf filter skipped them.
// The rendered PNG still described events. rewriteBoundaries rewrites the
// items themselves and throws if the card is not there.
rewriteBoundaries("What this import can never do", [
  [
    "Delete anybody.",
    "A player on the roster and absent from the file is left exactly as they were.",
  ],
  [
    "Overwrite a confirmed fact.",
    "A difference between the file and the record becomes something the player confirms on their form.",
  ],
  ["Send anything.", "It queues the welcome. Nothing is ever sent by hand."],
  ["Create a season.", "It writes into the season the roster is already in."],
]);
mark($('[data-testid="import-boundaries"]'), 5);

// The context card above the buttons is the events import's own: the season's
// event counts, and four steps about a term card. All of it had to be rewritten
// — the first shoot photographed "This season has 110 events · 5 Drafts · 103
// Approved" above a heading that said "Import last season's squad".
const counts = must($('[data-testid="season-counts"]'), "there is no season counts strip");
const countsCard = must(counts.closest(".MuiPaper-root"), "the counts strip has no card");

const title = must(
  $$("p, h2, h3, h6", countsCard).find((n) => /This season has|No events/i.test(n.textContent)),
  "the context card has no season line",
);
title.textContent = "This season's roster has 42 players";

const cells = $$(".MuiBox-root", counts).filter((n) => n.querySelectorAll("p").length === 2);
must(cells, "the counts strip has no cells");
[
  ["42", "On the roster now"],
  ["0", "In onboarding"],
  ["2026-27", "The season this writes into"],
].forEach(([value, label], i) => {
  if (!cells[i]) return;
  const p = $$("p", cells[i]);
  p[0].textContent = value;
  p[1].textContent = label;
});
mark(counts, 1);

const lead = must(
  $$("p", countsCard).find((n) => /Start from what is already here/i.test(n.textContent)),
  "the context card has no lead paragraph",
);
lead.textContent =
  "The import inherits the season the roster is in. It never asks which one, and it never creates one.";

const steps = $$("ol li", countsCard);
must(steps, "the context card has no steps");
[
  "Download the template. Six columns; three of them required.",
  "Fill it from the club's own spreadsheet. First name, last name and mobile on every row.",
  "Import it here. You will see exactly who is about to be added, and who might already be on record.",
  "Answer any possible duplicates, then confirm. Nothing is written until you do.",
].forEach((text, i) => {
  if (steps[i]) steps[i].textContent = text;
});
mark(steps[0].parentElement, 2);

// The overline at the foot of the card is the upsert rule, in event words.
const overline = $$("p", countsCard).find((n) => /KEEP THE ID|Keep the id/i.test(n.textContent));
if (overline)
  overline.textContent =
    "A player already on this season's roster is left alone · leave somebody out and nothing happens to them";

const importButton = must(
  $$("button, label").find((b) => /Import CSV/i.test(b.textContent)),
  "the import screen has no Import CSV button",
);
const label = [...importButton.childNodes].find((n) => n.nodeType === 3);
if (label) label.textContent = "Choose the squad file";
mark(importButton, 3);

const exportLink = $('[data-testid="export-link"]');
if (exportLink) {
  exportLink.textContent = "Download the template";
  mark(exportLink, 4);
}

// The prompt block is the events import's own AI-conversion instructions. A
// roster file comes off the club's spreadsheet, so what belongs here is the
// column list, not a prompt.
const prompt = $('[data-testid="import-prompt"]');
if (prompt) {
  prompt.textContent =
    "first_name,last_name,mobile,personal_email,college,matriculation_year\n" +
    "\n" +
    "first_name, last_name and mobile are required on every row.\n" +
    "personal_email, college and matriculation_year are optional — leave them empty and\n" +
    "the player fills them in themselves when they open their welcome link.\n" +
    "\n" +
    "There is deliberately no column for date of birth or emergency contact. Both are\n" +
    "asked of every player at onboarding, and neither belongs in a spreadsheet.\n" +
    "\n" +
    "Example\n" +
    "first_name,last_name,mobile,personal_email,college,matriculation_year\n" +
    "Rosalind,Penhaligon,07700 900312,rp@example.ac.uk,Brasenose,2024\n" +
    "Tobias,Wrenfield,07700 900184,,,\n";
  mark(prompt, 6);
}

await settle();
