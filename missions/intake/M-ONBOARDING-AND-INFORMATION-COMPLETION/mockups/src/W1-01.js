// W1-01 — The roster board grows one way in.
//
// Route: /operate/roster, which exists. The board itself is Mission 5's and is
// not touched; the only thing this mission adds here is the way in. The Events
// page already carries a menu of exactly this shape (create-menu.tsx), added by
// LAN-155 so bulk import could sit beside the single-record path.
selectRosterNav();

const addButton = must(
  $$("a, button").find((b) => /^\s*(Add|New|Enter)\b/i.test(b.textContent)),
  "the roster board has no add control to grow into a menu",
);

addButton.textContent = "Add players";

// The menu, cloned from MUI's own Paper so its elevation, radius and type scale
// are the shipped ones rather than a drawing of them.
const menu = document.createElement("div");
menu.className = "MuiPaper-root MuiPaper-elevation MuiPaper-elevation8 MuiMenu-paper";
menu.style.cssText =
  "position:absolute;z-index:20;min-width:290px;background:#fff;border-radius:4px;" +
  "box-shadow:0 5px 5px -3px rgba(0,0,0,.2),0 8px 10px 1px rgba(0,0,0,.14),0 3px 14px 2px rgba(0,0,0,.12);" +
  "padding:8px 0;margin-top:6px;right:0;top:100%";

// Anchored under its own button, the way MUI anchors a menu. The first shoot
// let it fall to the left in document flow, where it covered the board's
// heading and its status filter.

for (const [title, sub] of [
  ["Add one player by hand", "W2 · one person, the same checklist and welcome"],
  ["Import last season's squad", "W1 · a CSV, previewed before anything is written"],
]) {
  const item = document.createElement("div");
  item.className = "MuiMenuItem-root";
  item.style.cssText = "padding:8px 16px;font:400 15px/1.5 inherit;cursor:default";
  const t = document.createElement("div");
  t.textContent = title;
  const s = document.createElement("div");
  s.textContent = sub;
  s.style.cssText = "font-size:12.5px;color:rgba(0,0,0,.6);margin-top:1px";
  item.append(t, s);
  menu.append(item);
}

const host = addButton.parentElement ?? addButton;
if (getComputedStyle(host).position === "static") host.style.position = "relative";
addButton.after(menu);

mark(addButton, 1);
mark(menu.lastElementChild, 2);

await settle();
