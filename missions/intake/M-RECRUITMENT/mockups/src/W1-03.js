// W1-03 — The empty board. A board with nothing on it should say how somebody
// gets onto it, not "no results".
const table = $("table");
if (table) table.closest("div")?.remove();
setHeading("Recruits", "Season 2026-27 · nobody on the board yet");
relabelButton("add player", "ADD RECRUIT");
for (const node of $$("label, .MuiInputLabel-root, .MuiSelect-select")) {
  const t = node.textContent.trim();
  if (t === "Availability") node.textContent = "Source";
  if (t === "Missing onboarding data") node.textContent = "Ask outstanding";
}
const empty = drawnPanel("Nobody is on the board yet");
empty.style.textAlign = "center";
empty.style.padding = "40px 28px";
const ways = document.createElement("div");
ways.style.cssText = "font-size:14px;color:rgba(0,0,0,0.7);line-height:2;margin-top:6px";
ways.innerHTML =
  "Recruits arrive four ways:<br><strong>Somebody scans the QR</strong> at a stand or a taster<br>" +
  "<strong>Somebody is written down as a walk-up</strong> at any event<br>" +
  "<strong>An operator adds somebody</strong> the club went looking for<br>" +
  "<strong>Somebody arrives through the community group</strong> and is captured";
empty.append(ways);
empty.append(
  note(
    "The QR and the community-group link are administered in Recruitment settings. Nothing here is an error state — a board is empty at the start of every Michaelmas.",
  ),
);
document.querySelector("main, .MuiContainer-root, body").append(empty);
selectRecruitsNav();
