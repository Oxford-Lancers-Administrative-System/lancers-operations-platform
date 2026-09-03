// W1-03 — The proposal, and the duplicates underneath it.
//
// The heart of the workflow, and the one place this departs from the events
// import: two events with one name on one day are a refusal, two people with
// one name are a question.
//
// The confirmation table below is not drawn. The proposal uploads a real CSV
// into the shipped file input, the application's own onChange submits it, and
// the application renders its own table — which is then rewritten into people.
// Its chips, columns, spacing and type are the shipped ones.
await uploadCsvAndPropose(
  [
    "id,name,type,date,start,end,online,venue,description,required_equipment,mandatory",
    ",Practice — michaelmas week 1,Practice,2026-10-14,20:00,22:00,no,Iffley Road Astro,Full contact.,Gumshield,yes",
    ",Chalk — michaelmas week 1,Chalk,2026-10-13,18:00,19:00,yes,Microsoft Teams,Install review.,,no",
    ",Practice — michaelmas week 2,Practice,2026-10-21,20:00,22:00,no,Iffley Road Astro,Full contact.,Gumshield,yes",
    ",S&C — michaelmas week 2,S&C,2026-10-19,07:00,08:00,no,Iffley Road Gym,Lower body.,,no",
    ",Chalk — michaelmas week 2,Chalk,2026-10-20,18:00,19:00,yes,Microsoft Teams,Install review.,,no",
    ",Practice — michaelmas week 3,Practice,2026-10-28,20:00,22:00,no,Iffley Road Astro,Full contact.,Gumshield,yes",
  ].join("\r\n") + "\r\n",
);

// After the upload, never before: the application re-renders on its own state
// change, and a heading set first is overwritten by the time the shot is taken.
// The first shoot photographed "Import — squad-2026-27.csv" for exactly that.
selectRosterNav();
setHeading("Import last season's squad");
setSubheading("squad-2026-27.csv · 6 rows read · nothing is written until you confirm");

rewriteConfirmation(
  ["Player", "Mobile", "Personal email", "College", "Year", "What happens"],
  [
    {
      outcome: "New",
      name: "Rosalind Penhaligon",
      detail: "07700 900312 · Brasenose",
      status: "onboarding",
      summary: "Added to the roster in onboarding",
      cells: [
        "Rosalind Penhaligon",
        "07700 900312",
        "rp@example.ac.uk",
        "Brasenose",
        "2024",
        "Added in onboarding · checklist generated · welcome queued",
      ],
    },
    {
      outcome: "Carried forward",
      name: "Tobias Wrenfield",
      detail: "07700 900184 · Keble",
      status: "onboarding",
      summary: "Already known — given a 2026-27 membership",
      cells: [
        "Tobias Wrenfield",
        "07700 900184",
        "—",
        "Keble",
        "2023",
        "Known to the club · new 2026-27 membership · his record is not overwritten",
      ],
    },
    {
      outcome: "Carried forward",
      name: "Isolde Marchetti",
      detail: "07700 900771 · Wadham",
      status: "onboarding",
      summary: "Already known — given a 2026-27 membership",
      cells: [
        "Isolde Marchetti",
        "07700 900771",
        "im@example.ac.uk",
        "Wadham",
        "2024",
        "Known to the club · new 2026-27 membership · welcome queued",
      ],
    },
    {
      outcome: "Unchanged",
      name: "Caspian Hallowfield",
      detail: "07700 900008 · Merton",
      status: "already on the roster",
      summary: "Already on this season's roster",
      cells: [
        "Caspian Hallowfield",
        "07700 900008",
        "ch@example.ac.uk",
        "Merton",
        "2022",
        "Already on the 2026-27 roster · no second checklist, no second welcome",
      ],
    },
    {
      outcome: "Refused",
      name: "Wrenfield",
      detail: "line 6 · no first name",
      status: "nothing written",
      summary: "first_name is empty",
      cells: [
        "Wrenfield",
        "07700 900184",
        "—",
        "—",
        "—",
        "Refused — first_name is empty. The other five rows still apply.",
      ],
    },
    {
      outcome: "Refused",
      name: "Beatrix Ashgrove",
      detail: "line 7 · possible duplicate unanswered",
      status: "nothing written",
      summary: "Answer the duplicate below",
      cells: [
        "Beatrix Ashgrove",
        "07700 900450",
        "ba@example.ac.uk",
        "St Anne's",
        "2025",
        "Refused until the possible duplicate below is answered",
      ],
    },
  ],
);
mark(must($('[data-testid="import-table"]'), "no table to mark"), 1);
// The phone renders the same rows as cards, and the table is display:none there.
// Marking only the table leaves the phone shot starting at 2.
mark(must($('[data-testid="import-cards"]'), "no phone card list to mark"), 1);

// The totals the application renders above the table. They must agree with it:
// the first shoot photographed "6 New · 0 Refused" over a table showing two
// refusals, because this rewrite targeted the wrong element and said nothing.
mark(
  rewriteTotals([
    [1, "New"],
    [2, "Carried forward"],
    [1, "Unchanged"],
    [2, "Refused"],
  ]),
  2,
);

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

// The one thing the events import has no need of.
const dup = appendSection("Possible duplicates — 1 to answer", (card) => {
  const intro = document.createElement("p");
  intro.style.cssText = "margin:0 0 12px;font-size:14px;color:rgba(0,0,0,.7)";
  intro.textContent =
    "One row matches somebody the club already holds. Answer it and confirm again — the rest of the import is not held up by it.";
  card.append(intro);

  const row = document.createElement("div");
  row.style.cssText =
    "display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;border:1px solid rgba(0,0,0,.12);border-radius:4px;padding:14px";

  const incoming = document.createElement("div");
  incoming.style.cssText = "flex:1 1 240px;min-width:0";
  incoming.innerHTML =
    "<div style='font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:rgba(0,0,0,.6)'>In the file, line 7</div>" +
    "<div style='font-weight:600;margin-top:3px'>Beatrix Ashgrove</div>" +
    "<div style='font-size:13.5px;color:rgba(0,0,0,.7)'>07700 900450 · ba@example.ac.uk · St Anne's · 2025</div>";

  const candidate = document.createElement("div");
  candidate.style.cssText = "flex:1 1 240px;min-width:0";
  candidate.innerHTML =
    "<div style='font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:rgba(0,0,0,.6)'>Already on record</div>" +
    "<div style='font-weight:600;margin-top:3px'>Beatrix Ashgrove</div>" +
    "<div style='font-size:13.5px;color:rgba(0,0,0,.7)'>07700 900450 · alumna, last active 2024-25</div>" +
    "<div style='font-size:12.5px;color:#c2185b;margin-top:4px'>Matched on: first name, last name, mobile</div>";

  const answer = document.createElement("div");
  answer.style.cssText = "flex:0 0 auto;display:flex;gap:8px;align-items:center";
  for (const [text, variant] of [
    ["Same person", "contained"],
    ["Different person", "outlined"],
  ]) {
    const b = document.createElement("button");
    b.className = `MuiButton-root MuiButton-${variant} MuiButton-sizeSmall`;
    b.textContent = text;
    b.style.cssText =
      variant === "contained"
        ? "background:#0b3d91;color:#fff;border:0;border-radius:4px;padding:6px 14px;font:500 13px/1.75 inherit;text-transform:uppercase;letter-spacing:.02857em"
        : "background:transparent;color:#0b3d91;border:1px solid rgba(11,61,145,.5);border-radius:4px;padding:5px 13px;font:500 13px/1.75 inherit;text-transform:uppercase;letter-spacing:.02857em";
    answer.append(b);
  }

  row.append(incoming, candidate, answer);
  card.append(row);
});
mark(dup, 3);

const apply = $('[data-testid="apply-import"]');
if (apply) {
  apply.textContent = "Confirm — add 4 players";
  mark(apply, 4);
}

await settle();
