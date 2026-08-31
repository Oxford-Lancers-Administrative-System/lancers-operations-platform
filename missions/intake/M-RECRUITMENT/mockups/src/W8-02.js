// W8-02 — Recruits waiting for review.
//
// Brian, 2026-08-31: "W8-02 is super confusing to me. What the hell is going on?
// First off, this needs to be not the people page... You need to show me where
// this is actually happening in the app."
//
// So: a real list surface, wearing recruitment's shell, showing one thing.
//
// WHY THIS QUEUE EXISTS. W7's door is self-serve. Somebody signs themselves in
// at a stand, their details match somebody already in the club, and there is no
// operator standing there to say whether it is the same person. W7 takes the
// details regardless — Brian, the same day: "we should just take their contact
// information regardless" — so nothing is refused at the stand and nothing is
// merged behind anybody's back. It waits here instead.
//
// This is the ONLY place in the mission where a duplicate is resolved after the
// fact. The other two doors settle it at the door: W6 runs the shipped check
// with an operator present, and W5 does not check at all because Brian removed
// that path.
//
// Built on /operate/people's own table, which already carries a name, a status
// and a contactable column, and on its phone cards, because a list renders twice.
selectRecruitmentNav();
setHeading("Recruits waiting for review", "2 sign-ins matched somebody already in the club");

const table = must(document.querySelector("table"), "the people list has no table");
const headRow = must(table.querySelector("thead tr"), "the people list has no header row");
const headCells = [...headRow.querySelectorAll("th")];
const bodyRows = [...table.querySelectorAll("tbody tr")];
must(bodyRows, "the people list has no rows to clone");

// ---- The columns this queue needs ----------------------------------------
// Match on the shipped label rather than on position inside the header cell:
// the first attempt wrote into whichever leaf came first and the headers stayed
// as People's own — Name, Status, To the club, Contactable, Missing.
const RENAMED = {
  Name: "Signed themselves in",
  Status: "When",
  "To the club": "Might already be",
  Contactable: "Who that is",
  Missing: "",
};
// TEXT NODES, not elements. The header label is a bare text node inside the
// sort button — no element wraps it — so two attempts at an element scan found
// nothing and the headers stayed as People's own.
let renamed = 0;
for (const th of headCells) {
  const walker = document.createTreeWalker(th, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const replacement = RENAMED[node.nodeValue.trim()];
    if (replacement === undefined) continue;
    node.nodeValue = replacement;
    renamed += 1;
    break;
  }
}
if (renamed !== headCells.length) {
  throw new Error(`Renamed ${renamed} of ${headCells.length} column headers.`);
}

// Two shipped controls that do not belong on a review queue: this surface is
// not where anybody is added, and it is not scoped by season.
for (const control of $$("a, button")) {
  if (/see people outside this season|add a person/i.test(control.textContent)) control.remove();
}

// People's own two filters go with them: a queue of two sign-ins is not filtered
// by membership status or by missing data. The search stays, because a queue can
// get long at a Freshers' Fair.
for (const select of $$(".MuiSelect-select")) {
  if (/status|missing data/i.test(select.textContent)) {
    select.closest(".MuiFormControl-root")?.remove();
  }
}

// ---- The rows -------------------------------------------------------------
const WAITING = [
  {
    signedIn: "Rosalind Penhaligon",
    when: "Today, 14:12 · QR at the stand",
    match: "Rosalind Penhaligon",
    who: "Recruit · identified · this season",
    tone: { fg: "#00695c", bg: "#e0f2f1", border: "#80cbc4" },
  },
  {
    signedIn: "Alaric Brindlewood",
    when: "Today, 14:31 · QR at the stand",
    match: "Alaric Brindlewood",
    who: "Player · Active · this season",
    tone: { fg: "#1b5e20", bg: "#e8f5e9", border: "#a5d6a7" },
  },
];

const template = bodyRows[0];
const host = must(template.parentElement, "the rows have no parent");
const built = WAITING.map((item) => {
  const tr = template.cloneNode(true);
  const cells = [...tr.children];
  const setText = (cell, text, dim) => {
    if (!cell) return;
    const leaf = [...cell.querySelectorAll("*")].find((n) => n.children.length === 0);
    const target = leaf ?? cell;
    target.replaceChildren(document.createTextNode(text));
    target.style.color = dim ? "rgba(0,0,0,0.6)" : "";
    target.style.fontStyle = "";
  };
  setText(cells[0], item.signedIn);
  // The Status column renders a chip; a timestamp is not a status, so this cell
  // is returned to plain text rather than wearing a green pill.
  if (cells[1]) {
    cells[1].replaceChildren();
    const when = document.createElement("p");
    when.textContent = item.when;
    when.style.cssText = "margin:0;font-size:14px;color:rgba(0,0,0,0.6)";
    cells[1].append(when);
  }
  setText(cells[2], item.match);

  if (cells[3]) {
    cells[3].replaceChildren();
    const badge = document.createElement("span");
    badge.textContent = item.who;
    badge.style.cssText =
      `display:inline-block;font-size:12px;font-weight:700;padding:3px 10px;border-radius:11px;` +
      `color:${item.tone.fg};background:${item.tone.bg};border:1px solid ${item.tone.border}`;
    cells[3].append(badge);
  }

  // The decision, in the shipped check's own words so the two surfaces agree.
  if (cells[4]) {
    cells[4].replaceChildren();
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:8px;justify-content:flex-end";
    for (const [label, strong] of [
      ["THIS IS THEM", true],
      ["NEW PERSON", false],
    ]) {
      const b = document.createElement("span");
      b.textContent = label;
      b.style.cssText =
        `font-size:13px;font-weight:600;letter-spacing:.02em;padding:6px 12px;border-radius:6px;` +
        (strong
          ? "color:#0b3d91;border:1px solid rgba(11,61,145,0.5)"
          : "color:rgba(0,0,0,0.6);border:1px solid rgba(0,0,0,0.23)");
      actions.append(b);
    }
    cells[4].append(actions);
  }
  for (const extra of cells.slice(5)) extra.remove();
  return tr;
});
host.replaceChildren(...built);

// ---- The phone rendering, from the same data ------------------------------
const cards = $$('[data-testid="people-card"]');
must(cards, 'the people list has no [data-testid="people-card"] to replace');
const cardHost = must(cards[0].parentElement, "the phone cards have no parent");
const cardTpl = cards[0].cloneNode(true);
const phone = WAITING.map((item) => {
  const card = cardTpl.cloneNode(true);
  const leaves = [...card.querySelectorAll("*")].filter(
    (n) => n.children.length === 0 && n.textContent.trim(),
  );
  const values = [item.signedIn, item.when, `Might already be ${item.match}`, item.who];
  leaves.forEach((leaf, i) => {
    if (i < values.length) leaf.replaceChildren(document.createTextNode(values[i]));
    else leaf.remove();
  });
  return card;
});
for (const card of cards) card.remove();
for (const card of phone) cardHost.append(card);

await settle();
