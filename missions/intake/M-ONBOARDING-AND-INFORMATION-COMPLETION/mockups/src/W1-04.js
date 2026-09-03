// W1-04 — What happened, after confirming.
//
// Welcomes are QUEUED, never sent: nothing is ever sent by hand, and this
// mission rides Mission 4's scheduler verbatim (PR7-rides-m4).
//
// Built in one explicit order rather than by sibling position. The first shoot
// relied on `insertAfter` against elements that had already moved, and
// photographed the refusals above the summary, the summary below the alert, and
// a stale "2 New · 0 Refused" strip arguing with both.
await uploadCsvAndPropose(
  [
    "id,name,type,date,start,end,online,venue,description,required_equipment,mandatory",
    ",Practice — michaelmas week 1,Practice,2026-10-14,20:00,22:00,no,Iffley Road Astro,Full contact.,Gumshield,yes",
    ",Chalk — michaelmas week 1,Chalk,2026-10-13,18:00,19:00,yes,Microsoft Teams,Install review.,,no",
  ].join("\r\n") + "\r\n",
);

selectRosterNav();
setHeading("Import last season's squad");
setSubheading("squad-2026-27.csv · applied 1 September 2026 · Caspian Hallowfield");

const box = must($('[data-testid="import-table"]'), "there is no confirmation to replace");
const shell = must(box.closest(".MuiPaper-root"), "the confirmation has no card");
const parent = must(shell.parentElement, "the confirmation card has no parent");

// The plan totals belong to a proposal, not to an applied import — and they
// state the events plan, not this one.
const strip = shell.previousElementSibling;
if (strip && strip.classList.contains("MuiPaper-root")) strip.remove();

/** A card in the shipped Paper's own clothes. */
const card = (build) => {
  const el = shell.cloneNode(false);
  el.removeAttribute("data-testid");
  el.style.padding = "16px";
  el.style.marginBottom = "16px";
  el.style.overflow = "visible";
  build(el);
  return el;
};

const heading = (text) => {
  const h = document.createElement("h2");
  h.className = "MuiTypography-root MuiTypography-h6";
  h.style.cssText = "font-size:1.05rem;margin:0 0 10px";
  h.textContent = text;
  return h;
};

const rows = (pairs) => {
  const list = document.createElement("div");
  for (const [lead, note] of pairs) {
    const line = document.createElement("div");
    line.style.cssText =
      "display:flex;gap:14px;padding:7px 0;border-bottom:1px solid rgba(0,0,0,.08)";
    line.innerHTML =
      `<div style="font-weight:600;min-width:200px">${lead}</div>` +
      `<div style="font-size:13.5px;color:rgba(0,0,0,.72)">${note}</div>`;
    list.append(line);
  }
  if (list.lastElementChild) list.lastElementChild.style.borderBottom = "0";
  return list;
};

// 1 — what happened, in one sentence.
const applied = document.createElement("div");
applied.className = "MuiAlert-root MuiAlert-standardSuccess";
applied.style.cssText =
  "display:flex;align-items:center;gap:12px;background:#edf7ed;color:#1e4620;" +
  "border-radius:4px;padding:8px 16px;margin-bottom:16px;font:400 14px/1.43 inherit";
applied.innerHTML =
  '<span style="color:#2e7d32;font-size:22px;line-height:1">✓</span>' +
  "<span>Four players are on the 2026-27 roster. Four welcomes are queued.</span>";

// 2 — the counts, including the two this workflow adds.
const summary = card((el) => {
  const strip = document.createElement("div");
  strip.style.cssText = "display:flex;gap:30px;flex-wrap:wrap";
  for (const [value, label] of [
    ["1", "New"],
    ["2", "Carried forward"],
    ["1", "Unchanged"],
    ["2", "Refused"],
    ["4", "Welcomes queued"],
    ["4", "Checklists generated"],
  ]) {
    const cell = document.createElement("div");
    cell.innerHTML =
      `<div style="font:700 24px/1.2 inherit">${value}</div>` +
      `<div style="font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:rgba(0,0,0,.6);margin-top:2px">${label}</div>`;
    strip.append(cell);
  }
  el.append(strip);
});

// 3 — who arrived.
const arrived = card((el) => {
  el.append(
    heading("Who arrived"),
    rows([
      ["Rosalind Penhaligon", "new · onboarding · 11 items outstanding · welcome queued"],
      ["Tobias Wrenfield", "carried forward · onboarding · 11 items outstanding · welcome queued"],
      ["Isolde Marchetti", "carried forward · onboarding · 11 items outstanding · welcome queued"],
      ["Caspian Hallowfield", "already on the 2026-27 roster · untouched"],
    ]),
  );
});

// 4 — and what did not.
const refused = card((el) => {
  el.append(
    heading("What was refused, and why"),
    rows([
      ["Line 6 — Wrenfield", "first_name is empty. Nothing was written for this row."],
      [
        "Line 7 — Beatrix Ashgrove",
        "the possible duplicate is still unanswered. Answer it and import the row again.",
      ],
    ]),
  );
});

// Inserted where the confirmation itself sat, not at the top of the parent:
// prepending put all four cards above the page's own heading.
const cards = $('[data-testid="import-cards"]');
if (cards) cards.remove();
for (const el of [applied, summary, arrived, refused]) parent.insertBefore(el, shell);
shell.remove();

mark(applied, 1);
mark(summary, 2);
mark(arrived, 3);
mark(refused, 4);

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

// An applied import has nothing left to cancel.
const cancel = $$("button, a").find((b) => /^\s*cancel\s*$/i.test(b.textContent));
if (cancel) cancel.remove();
const apply = $('[data-testid="apply-import"]');
if (apply) {
  apply.textContent = "Back to the roster";
  apply.style.cssText +=
    ";background:transparent;color:#0b3d91;border:1px solid rgba(11,61,145,.5)";
}

await settle();
