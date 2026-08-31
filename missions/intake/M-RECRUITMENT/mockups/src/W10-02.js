// W10-02 — Recruitment QR codes.
//
// Brian, 2026-08-31: "For W10-02, where do they get this page? I don't know
// where this fucking page is. It's not grounded anywhere."
//
// HOW YOU GET HERE: the Recruitment board (W1) → QR codes. A QR code is not a
// message, so it does not belong on the messaging schedule; it is a recruitment
// asset, and the board is recruitment's surface. The click is a secondary link
// beside ADD RECRUIT in the board's header, which is where the roster board
// already puts its own actions.
//
// NOTE FOR BRIAN: that link is an addition to W1, which he has approved. It is
// not drawn into W1 here — the entry point is named and waits on his word.
//
// Built on the shipped People table, the same way W8-02 is: a real list with
// real columns, read as recruitment, rather than panels drawn on a cleared page.
selectRecruitmentNav();
setHeading("Recruitment QR codes");
pageSubtitle("Season 2026-27 · reached from the recruit board");

const table = must(document.querySelector("table"), "the list has no table");
const headRow = must(table.querySelector("thead tr"), "the list has no header row");
const headCells = [...headRow.querySelectorAll("th")];
const bodyRows = [...table.querySelectorAll("tbody tr")];
must(bodyRows, "the list has no rows to clone");

// Columns, renamed on the shipped labels via text nodes — the label is a bare
// text node inside the sort button, not an element.
const RENAMED = {
  Name: "Code",
  Status: "Printed on",
  "To the club": "Sign-ins",
  Contactable: "State",
  Missing: "",
};
let renamed = 0;
for (const th of headCells) {
  const walker = document.createTreeWalker(th, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const next = RENAMED[node.nodeValue.trim()];
    if (next === undefined) continue;
    node.nodeValue = next;
    renamed += 1;
    break;
  }
}
if (renamed !== headCells.length) {
  throw new Error(`Renamed ${renamed} of ${headCells.length} column headers.`);
}

// People's own filters and add button belong to People.
for (const control of $$("a, button")) {
  if (/see people outside this season|add a person/i.test(control.textContent)) control.remove();
}
// Match on the CONTROL's whole text, not the select's: the words sit in the
// floating label, so testing the select alone removed nothing.
for (const control of $$(".MuiFormControl-root")) {
  if (
    control.querySelector(".MuiSelect-select") &&
    /status|missing data/i.test(control.innerText)
  ) {
    control.remove();
  }
}

const CODES = [
  {
    code: "qr_freshers_fair_2026",
    printed: "Stand banner, and 200 flyers",
    scans: "48",
    state: "Live",
  },
  {
    code: "qr_taster_2026",
    printed: "Pitchside board at both tasters",
    scans: "11",
    state: "Live",
  },
  {
    code: "qr_freshers_fair_2025",
    printed: "Last year's banner",
    scans: "0 this season",
    state: "Revoked",
  },
];

const template = bodyRows[0];
const host = must(template.parentElement, "the rows have no parent");
const setText = (cell, text, dim) => {
  if (!cell) return;
  cell.replaceChildren();
  const p = document.createElement("p");
  p.textContent = text;
  p.style.cssText = `margin:0;font-size:14px;color:rgba(0,0,0,${dim ? "0.6" : "0.87"})`;
  cell.append(p);
};
host.replaceChildren(
  ...CODES.map((item) => {
    const tr = template.cloneNode(true);
    const cells = [...tr.children];
    if (cells[0]) {
      cells[0].replaceChildren();
      const code = document.createElement("code");
      code.textContent = item.code;
      code.style.cssText = "font-size:12.5px;font-weight:700;color:#0b3d91";
      cells[0].append(code);
    }
    setText(cells[1], item.printed, true);
    setText(cells[2], item.scans);
    if (cells[3]) {
      cells[3].replaceChildren();
      const live = item.state === "Live";
      const badge = document.createElement("span");
      badge.textContent = item.state;
      badge.style.cssText =
        "font-size:11px;font-weight:700;letter-spacing:.05em;padding:3px 10px;border-radius:11px;" +
        (live
          ? "color:#1b5e20;background:#e8f5e9;border:1px solid #a5d6a7"
          : "color:rgba(0,0,0,0.55);background:#eee;border:1px solid #ddd");
      cells[3].append(badge);
    }
    if (cells[4]) {
      cells[4].replaceChildren();
      const action = document.createElement("span");
      action.textContent = item.state === "Live" ? "REVOKE" : "";
      action.style.cssText =
        "font-size:13px;font-weight:600;color:#b71c1c;border:1px solid rgba(183,28,28,0.4);border-radius:6px;padding:6px 12px";
      if (item.state === "Live") cells[4].append(action);
    }
    for (const extra of cells.slice(5)) extra.remove();
    return tr;
  }),
);

// The phone rendering, which this list has too.
const cards = $$('[data-testid="people-card"]');
must(cards, 'the list has no [data-testid="people-card"] to replace');
const cardHost = must(cards[0].parentElement, "the phone cards have no parent");
const cardTpl = cards[0].cloneNode(true);
const phone = CODES.map((item) => {
  const card = cardTpl.cloneNode(true);
  const leaves = [...card.querySelectorAll("*")].filter(
    (n) => n.children.length === 0 && n.textContent.trim(),
  );
  const values = [item.code, item.printed, `${item.scans} sign-ins`, item.state];
  leaves.forEach((leaf, i) => {
    if (i < values.length) leaf.replaceChildren(document.createTextNode(values[i]));
    else leaf.remove();
  });
  return card;
});
for (const card of cards) card.remove();
for (const card of phone) cardHost.append(card);

await settle();
