// W8-01 — The review queue. The merge screen is the nearest analogue, but merge
// resolves two records that both exist; nothing is written here yet, so this
// compares a submission against a record.
setHeading(
  "Captures waiting for a decision",
  "3 waiting · nothing created and nothing sent until you decide",
);
const host = drawnPanel(null);
host.style.cssText += ";border:none;box-shadow:none;padding:0";
const item = (when, typed, held, note_) => {
  const box = proposedBlock("amber");
  blockTitle(box, when);
  const grid = document.createElement("div");
  grid.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:8px 0 4px";
  for (const [head, body] of [
    ["They typed", typed],
    ["We already hold", held],
  ]) {
    const col = document.createElement("div");
    col.style.cssText =
      "background:#fff;border:1px solid rgba(0,0,0,0.12);border-radius:6px;padding:11px 13px";
    const h = document.createElement("div");
    h.textContent = head;
    h.style.cssText =
      "font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:rgba(0,0,0,0.5);margin-bottom:5px";
    const b = document.createElement("div");
    b.textContent = body;
    b.style.cssText = "font-size:13.5px;line-height:1.5";
    col.append(h, b);
    grid.append(col);
  }
  box.append(grid);
  const choices = document.createElement("div");
  choices.style.cssText = "display:flex;gap:10px;margin-top:10px";
  for (const [t, primary] of [
    ["THIS IS THEM", true],
    ["SOMEBODY NEW", false],
  ]) {
    const b = document.createElement("span");
    b.textContent = t;
    b.style.cssText = primary
      ? "background:#b26a00;color:#fff;font-size:12.5px;font-weight:700;padding:8px 15px;border-radius:6px"
      : "border:1px solid rgba(0,0,0,0.3);font-size:12.5px;font-weight:700;padding:8px 15px;border-radius:6px";
    choices.append(b);
  }
  box.append(choices);
  if (note_) blockText(box, note_);
  return box;
};
host.append(
  item(
    "QR · 7 May 14:12",
    "Marguerite Ashdown · 07700 900461 · Kestrelhall",
    "Marguerite Ashdown · mobile ends 461 · recruit since 22 Apr",
  ),
  item(
    "QR · 7 May 14:31",
    "A. Kittiwake · 07700 900112",
    "Ambrose Kittiwake · mobile ends 112 · declined 2 May",
  ),
  item(
    "Walk-on · Taster 2, 7 May 18:40",
    "Peregrine Oakhollow · 07700 900233",
    "Peregrine Oakhollow · mobile ends 233 · current member",
    "Attendance was recorded regardless — capture always stands. Only the recruit record waits.",
  ),
);
const anchor = cardTemplate();
(anchor?.parentElement ?? document.body).append(host);
