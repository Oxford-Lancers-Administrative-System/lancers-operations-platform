// W2-03 — Where the operator lands, and the one thing that is new there.
//
// The shipped redirect goes to /operate/roster/[membershipId]?created=1 and
// that record already shows the generated checklist. What it cannot show today
// is that anybody was told, because nothing is sent. This adds that line.
selectRosterNav();

const created = document.createElement("div");
created.className = "MuiAlert-root MuiAlert-standardSuccess";
created.style.cssText =
  "display:flex;align-items:flex-start;gap:12px;background:#edf7ed;color:#1e4620;" +
  "border-radius:4px;padding:10px 16px;margin:0 0 18px;font:400 14px/1.5 inherit";
created.innerHTML =
  '<span style="color:#2e7d32;font-size:20px;line-height:1.2">✓</span>' +
  "<span><strong>Jorvik Kirkbride is on the 2026-27 roster.</strong> Their checklist is generated " +
  "and <strong>their welcome is queued</strong> — the same message an imported player receives. " +
  "Nothing else is sent until they tick their consent.</span>";

// Placed above the record's own first card, not at the top of the document.
// `$("h1")` matched the shell's "Lancers Operations", so the first shoot put
// the alert above the application header — outside the page it belongs to.
const firstCard = must($(".MuiPaper-root"), "the record page has no card to anchor against");
firstCard.before(created);
mark(created, 1);

// The welcome, as a queued dispatch rather than a sent one. Cloned from a
// shipped Paper so the card is the record's own.
const anchor = must($(".MuiPaper-root"), "the record page has no card to clone");
const card = anchor.cloneNode(false);
card.removeAttribute("data-testid");
card.style.cssText = "padding:16px;margin:18px 0;overflow:visible";

const title = document.createElement("h2");
title.className = "MuiTypography-root MuiTypography-h6";
title.style.cssText = "font-size:1.05rem;margin:0 0 10px";
title.textContent = "What the club has said";
card.append(title);

const row = document.createElement("div");
row.style.cssText = "display:flex;gap:14px;align-items:baseline;padding:7px 0";
row.innerHTML =
  '<div style="font-weight:600;min-width:180px">Season welcome</div>' +
  '<div style="font-size:13.5px;color:rgba(0,0,0,.72)">Queued 1 September 2026 · not yet sent · ' +
  "carries their link · the only message permitted before they consent</div>";
card.append(row);

const empty = document.createElement("p");
empty.style.cssText = "margin:8px 0 0;font-size:13px;color:rgba(0,0,0,.6)";
empty.textContent =
  "Nothing else has been said to them, and nothing else will be until they tick their consent.";
card.append(empty);

anchor.after(card);
mark(card, 2);

await settle();
