// W1-03 — The empty board.
//
// A board with nothing on it should say how somebody gets onto it, not "no
// results". Brian's four doors are the content.
//
// The previous version appended this panel to `document.body`, so it rendered
// full-bleed underneath the sidebar with six hundred pixels of blank where the
// board had been. It goes where the board was.
const table = must(document.querySelector("table"), "the board has no table");
const container = must(
  table.closest(".MuiTableContainer-root"),
  "the board's table has no container to replace",
);

// Both renderings, again: the phone card list is a sibling of the table's
// container and would otherwise still list 42 players under "nobody yet".
const cards = $$('[data-testid="roster-card"]');
must(cards, 'the phone rendering has no [data-testid="roster-card"] to clear');
const cardList = cards[0].parentElement;
for (const card of cards) card.remove();

const empty = drawnPanel("Nobody is on the board yet");
empty.style.padding = "32px 28px";

const lead = document.createElement("p");
lead.textContent = "Recruits arrive four ways:";
lead.style.cssText = "margin:0 0 12px;font-size:14px;color:rgba(0,0,0,0.7)";
empty.append(lead);

const doors = document.createElement("ul");
doors.style.cssText =
  "margin:0;padding-left:20px;font-size:14px;line-height:2;color:rgba(0,0,0,0.8)";
for (const [strong, rest] of [
  ["Somebody scans the QR", "at a stand or a taster"],
  ["Somebody is written down as a walk-up", "at any event"],
  ["An operator adds somebody", "the club went looking for"],
  ["Somebody arrives through the community group", "and is captured"],
]) {
  const li = document.createElement("li");
  const b = document.createElement("strong");
  b.textContent = strong;
  li.append(b, document.createTextNode(` ${rest}`));
  doors.append(li);
}
empty.append(doors);
empty.append(
  note(
    "The QR and the community-group link are administered in Recruitment settings. Nothing here is an error state — a board is empty at the start of every Michaelmas.",
  ),
);

// In the page's own content column, where the board was.
container.replaceWith(empty);
cardList.append(empty.cloneNode(true));

setHeading("Recruitment", "Season 2026-27 · nobody on the board yet");
relabelButton("add player", "ADD RECRUIT");
for (const node of $$("label, .MuiInputLabel-root, .MuiSelect-select")) {
  const t = node.textContent.trim();
  if (t === "Availability") node.textContent = "Source";
  if (t === "Missing onboarding data") node.textContent = "Ask outstanding";
}

selectRecruitmentNav();
addBoardQrButton();
setRecruitmentRoute();

await settle();
