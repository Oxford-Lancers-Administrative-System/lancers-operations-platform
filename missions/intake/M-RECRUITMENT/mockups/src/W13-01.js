// W13-01 — Take a recruit off the board, proposed. The same board after
// Clementine Varrow is moved to declined: she leaves the board, the board
// resorts, and nothing further is sent to her. There is no separate removal
// mechanism — Brian, 2026-08-31: "that's a status change... and then the board
// resorts, more or less."
const table = document.querySelector("table");
const thead = table.querySelector("thead");
const tbody = table.querySelector("tbody");
const [bandRow, colRow] = thead.querySelectorAll("tr");
const bandCells = [...bandRow.querySelectorAll("th")];
const templateRow = tbody.querySelector("tr");

// ---- Templates cloned from the shipped board -----------------------------
const spacerBand = bandCells[0];
const personBand = bandCells[1];
const seasonBand = bandCells[3];
const colCells = [...colRow.querySelectorAll("th")];
const pinnedCol = colCells[0];
const filterCol = colCells[1];

const bodyCells = [...templateRow.querySelectorAll("td")];
const pinnedCell = bodyCells[0];
const linkCell = bodyCells[1];
const chipCell = bodyCells[5];
const plainCell = bodyCells[6];
const statusCell = bodyCells[8];

const band = (template, label, span, colour) => {
  const th = template.cloneNode(true);
  th.setAttribute("colspan", String(span));
  th.querySelector("span").textContent = label;
  if (colour) th.style.backgroundColor = colour;
  return th;
};

const column = (label, caption) => {
  const th = filterCol.cloneNode(true);
  const sort = th.querySelector('[role="button"]');
  sort.childNodes[0].nodeValue = label;
  const filter = th.querySelector("button");
  if (filter) filter.setAttribute("aria-label", `Filter ${label}`);
  const cap = th.querySelector(".MuiTypography-caption");
  if (cap) cap.textContent = caption;
  return th;
};

const textCell = (text, muted) => {
  const td = plainCell.cloneNode(true);
  const p = td.querySelector("p");
  p.textContent = text;
  p.style.color = muted ? "rgba(0,0,0,0.38)" : "";
  p.style.fontStyle = muted ? "italic" : "";
  return td;
};

const recordCell = (text) => {
  const td = linkCell.cloneNode(true);
  const a = td.querySelector("a");
  if (text === null) {
    td.replaceChildren();
    const p = plainCell.querySelector("p").cloneNode(true);
    p.textContent = "Not recorded";
    p.style.color = "rgba(0,0,0,0.38)";
    td.append(p);
    return td;
  }
  a.textContent = text;
  return td;
};

const chipsCell = (labels) => {
  const td = chipCell.cloneNode(true);
  const stack = td.querySelector(".MuiStack-root");
  const chip = stack.querySelector(".MuiChip-root").cloneNode(true);
  stack.replaceChildren();
  for (const l of labels) {
    const c = chip.cloneNode(true);
    c.querySelector(".MuiChip-label").textContent = l;
    stack.append(c);
  }
  return td;
};

// The status cell reuses the board's own filled chip, recoloured per rung.
const statusChip = (value) => {
  const td = statusCell.cloneNode(true);
  asRung(td.querySelector(".MuiChip-root"), value);
  return td;
};

// One appended event column cell: invited · answered · attended.
const eventCell = (invited, answered, attended) => {
  const td = chipCell.cloneNode(true);
  const stack = td.querySelector(".MuiStack-root");
  stack.replaceChildren();
  const glyph = (text, colour, title) => {
    const s = document.createElement("span");
    s.textContent = text;
    s.title = title;
    s.style.cssText = `display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;font-size:11px;font-weight:700;margin-right:3px;color:${colour === "none" ? "rgba(0,0,0,0.26)" : "#fff"};background:${colour === "none" ? "transparent" : colour};border:${colour === "none" ? "1px dashed rgba(0,0,0,0.18)" : "none"}`;
    return s;
  };
  stack.append(glyph(invited ? "I" : "·", invited ? "#78909c" : "none", "Invited"));
  stack.append(
    glyph(
      answered === "yes" ? "Y" : answered === "no" ? "N" : "·",
      answered === "yes" ? "#2e7d32" : answered === "no" ? "#8d6e63" : "none",
      "Answered",
    ),
  );
  stack.append(glyph(attended ? "A" : "·", attended ? "#0b3d91" : "none", "Attended"));
  return td;
};

// ---- The proposed header -------------------------------------------------
bandRow.replaceChildren(
  spacerBand.cloneNode(true),
  band(personBand, "Person", 5),
  band(seasonBand, "Recruitment", 6, "#00695c"),
  band(seasonBand, "Events", 3),
);

const pinned = pinnedCol.cloneNode(true);
pinned.querySelector('[role="button"]').childNodes[0].nodeValue = "Recruit";
colRow.replaceChildren(
  pinned,
  column("College", "edit on the record"),
  column("Matric", "edit on the record"),
  column("Contactable", "indicators only"),
  column("On WhatsApp", "set by sign-on"),
  column("Status", "edit here"),
  column("Source", "edit here"),
  column("First contact", "edit here"),
  column("Asked", "set by the form"),
  column("Last touch", "derived"),
  column("Notes", "edit here"),
  column("Freshers' Fair 30 Apr", ""),
  column("Taster 1 · 30 Apr", ""),
  column("Taster 2 · 7 May", ""),
);

// ---- The proposed rows ---------------------------------------------------
const RECRUITS_UNSORTED = [
  [
    "Rosalind Penhaligon",
    "Dunsfold",
    "2026",
    ["Mobile"],
    "Not yet",
    "identified",
    "QR · Freshers' Fair",
    "28 Apr",
    "Not sent",
    "Welcome, 28 Apr",
    "Came to the stand with a friend from Dunsfold.",
    [true, "none", false],
    [false, "none", false],
    [false, "none", false],
  ],
  [
    "Tobias Wrenfield",
    "Marlbrook",
    "2025",
    ["Mobile", "Email"],
    "In the group",
    "engaged",
    "Walk-up · Taster 1",
    "30 Apr",
    "Answered 2 May",
    "Invitation, 6 May",
    "Played at school. Asked about kit.",
    [true, "yes", true],
    [true, "yes", true],
    [true, "none", false],
  ],
  [
    "Marguerite Ashdown",
    "Kestrelhall",
    "2026",
    ["Mobile", "Email"],
    "In the group",
    "committed",
    "Operator · sourced",
    "22 Apr",
    "Answered 25 Apr",
    "Follow-up, 9 May",
    "Said she is in. Wants to play safety.",
    [true, "yes", true],
    [true, "yes", true],
    [true, "yes", true],
  ],
  [
    "Peregrine Oakhollow",
    "Beaumont",
    "2024",
    ["Mobile"],
    "Not yet",
    "identified",
    "QR · Taster 2",
    "7 May",
    "Sent 8 May",
    "Ask, 8 May",
    "",
    [false, "none", false],
    [false, "none", false],
    [true, "none", true],
  ],
  [
    "Clementine Varrow",
    "Harewell",
    "2026",
    ["Email"],
    "Declined",
    "disengaged",
    "Walk-up · Freshers' Fair",
    "30 Apr",
    "Not answered",
    "Invitation, 6 May",
    "Came once, has not answered since.",
    [true, "none", false],
    [true, "no", false],
    [false, "none", false],
  ],
  [
    "Ambrose Kittiwake",
    null,
    null,
    ["Mobile"],
    "Not yet",
    "declined",
    "Walk-up · Taster 1",
    "30 Apr",
    "Not sent",
    "Welcome, 30 Apr",
    "Said rugby clashes. Happy to be asked again next year.",
    [true, "no", false],
    [false, "none", false],
    [false, "none", false],
  ],
];

const ORDER = ["identified", "engaged", "committed", "joined", "disengaged", "declined"];
const RECRUITS = [...RECRUITS_UNSORTED].sort((a, b) => ORDER.indexOf(a[5]) - ORDER.indexOf(b[5]));
tbody.replaceChildren(
  ...RECRUITS.map((r) => {
    const tr = templateRow.cloneNode(false);
    const name = pinnedCell.cloneNode(true);
    name.querySelector("a").textContent = r[0];
    tr.append(
      name,
      recordCell(r[1]),
      recordCell(r[2]),
      chipsCell(r[3]),
      textCell(r[4], r[4] === "Not yet"),
      statusChip(r[5]),
      textCell(r[6]),
      textCell(r[7]),
      textCell(r[8], r[8] === "Not sent"),
      textCell(r[9]),
      textCell(r[10] || "—", !r[10]),
      eventCell(...r[11]),
      eventCell(...r[12]),
      eventCell(...r[13]),
    );
    return tr;
  }),
);

setHeading("Recruits", "Season 2026-27 \u00b7 6 recruits \u00b7 3 recruitment events");
relabelButton("add player", "ADD RECRUIT");

// The roster's filters describe memberships. A recruit holds none.
const FILTERS = { Availability: "Source", "Missing onboarding data": "Ask outstanding" };
for (const node of $$("label, .MuiInputLabel-root, .MuiSelect-select")) {
  const t = node.textContent.trim();
  if (FILTERS[t]) node.textContent = FILTERS[t];
}

selectRecruitsNav();

appendCard(
  "What just happened",
  [
    makeRow("Clementine Varrow", "disengaged \u2192 declined"),
    makeRow("Recorded by", "Caspian Hallowfield, today"),
    makeRow(
      "She stops receiving",
      "Everything. Including anything an operator tries to send from W9.",
    ),
    makeRow("Her record", "Intact. Every signal, every message, every note stays."),
  ],
  "Leaving the board is a status change and nothing more. No archive, no delete. Removing the person is erasure and is Mission 8's, never recruitment's \u2014 owner decision 2026-08-25.",
);
