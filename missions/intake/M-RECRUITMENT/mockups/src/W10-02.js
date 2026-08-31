// W10-02 — The QR codes.
//
// Rebuilt with W10-01 on 2026-08-31. It was prepended to the messaging schedule
// and sat below three thousand pixels of event cadences; the body is now
// replaced, so the screen is about the thing it names.
//
// Minting and revoking a code that is PRINTED ON A POSTER is its own job with
// its own consequences: a revoked code is a dead poster, and a rotated group
// link behind a live code is the most likely silent failure in the mission.
selectRecruitmentNav();
setHeading("Recruitment QR codes");
pageSubtitle("Season 2026-27 · where each code is printed, and where it points");
const host = clearPageBody();

const panel = (title) => {
  const box = proposedRegion(title);
  box.style.marginBottom = "18px";
  host.append(box);
  return box;
};

const codes = panel("Live codes");
const codeRow = (name, where, scans, state) => {
  const row = document.createElement("div");
  row.style.cssText =
    "display:flex;gap:16px;align-items:center;padding:12px 0;border-bottom:1px solid rgba(0,0,0,0.08)";
  const n = document.createElement("div");
  n.style.cssText = "flex:0 0 230px";
  const code = document.createElement("code");
  code.textContent = name;
  code.style.cssText = "font-size:12.5px;font-weight:700;color:#0b3d91";
  const w = document.createElement("div");
  w.textContent = where;
  w.style.cssText = "font-size:12.5px;color:rgba(0,0,0,0.6);margin-top:3px";
  n.append(code, w);
  const s = document.createElement("div");
  s.textContent = scans;
  s.style.cssText = "flex:0 0 130px;font-size:13.5px;color:rgba(0,0,0,0.8)";
  const badge = document.createElement("span");
  const live = state === "Live";
  badge.textContent = state;
  badge.style.cssText =
    `font-size:11px;font-weight:700;letter-spacing:.05em;padding:3px 10px;border-radius:11px;` +
    (live
      ? "color:#1b5e20;background:#e8f5e9;border:1px solid #a5d6a7"
      : "color:rgba(0,0,0,0.55);background:#eee;border:1px solid #ddd");
  const b = document.createElement("div");
  b.style.cssText = "flex:1;text-align:right";
  b.append(badge);
  row.append(n, s, b);
  return row;
};
codes.append(
  codeRow("qr_freshers_fair_2026", "The stand banner and 200 flyers", "48 sign-ins", "Live"),
  codeRow("qr_taster_2026", "Pitchside board at both tasters", "11 sign-ins", "Live"),
  codeRow("qr_freshers_fair_2025", "Last year's banner", "0 sign-ins this season", "Revoked"),
);
mark(codes, 1);

const consequences = panel("What minting and revoking mean");
consequences.append(
  makeRow("Every code points at", "the club's own /join page, never at WhatsApp directly"),
  makeRow("Revoking a code", "kills the poster it is printed on. Nothing else changes."),
  makeRow("A revoked code scanned", "the uniform invalid page — it never says why"),
  makeRow("The group link", "lives in one place and is changed there, not on each code"),
);
mark(consequences, 2);

await settle();
