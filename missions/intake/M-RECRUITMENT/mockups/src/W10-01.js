// W10-01 — The recruitment cycle, in the shipped messaging-schedule's own
// language. Mission 4 owns the scheduler; recruitment declares the cycle.
setHeading(
  "Recruitment cycle",
  "Season 2026-27 · what fires, in what order, and who may change it",
);
const host = drawnPanel(null);
host.style.cssText += ";border:none;box-shadow:none;padding:0";
const step = (n, name, when, on) => {
  const row = document.createElement("div");
  row.style.cssText =
    "display:flex;align-items:center;gap:16px;border:1px solid rgba(0,0,0,0.12);border-radius:8px;padding:13px 16px;margin-bottom:10px;background:#fff";
  const num = document.createElement("div");
  num.textContent = String(n);
  num.style.cssText =
    "flex:0 0 26px;height:26px;border-radius:50%;background:#00695c;color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700";
  const body = document.createElement("div");
  body.style.cssText = "flex:1";
  const t = document.createElement("code");
  t.textContent = name;
  t.style.cssText = "font-size:12.5px;font-weight:700;color:#0b3d91";
  const w = document.createElement("div");
  w.textContent = when;
  w.style.cssText = "font-size:13px;color:rgba(0,0,0,0.7);margin-top:3px";
  body.append(t, w);
  const toggle = document.createElement("div");
  toggle.textContent = on ? "ON" : "OFF";
  toggle.style.cssText = `flex:0 0 auto;font-size:11px;font-weight:700;letter-spacing:.06em;padding:4px 11px;border-radius:12px;color:${on ? "#1b5e20" : "rgba(0,0,0,0.5)"};background:${on ? "#e8f5e9" : "#eee"}`;
  row.append(num, body, toggle);
  return row;
};
host.append(
  step(1, "recruit_welcome", "On capture, from every door", true),
  step(2, "recruit_interest_ask", "Immediately after they accept", true),
  step(3, "recruit_gentle_reminder", "1 day later, only if nothing came back", true),
  step(4, "recruit_details_ask", "1 day after the welcome", true),
  step(5, "recruit_details_reminder", "3 days later, once only", true),
);
const grp = proposedBlock("amber");
blockTitle(grp, "The community-group link");
blockText(
  grp,
  "chat.whatsapp.com/… · last changed 14 April by Caspian Hallowfield · carried by step 1 and every QR page",
);
host.append(grp);
const qr = drawnPanel("QR codes");
qr.append(
  makeRow("Freshers' Fair stand", "Live · 41 submissions · minted 22 Apr"),
  makeRow("Taster poster, Michaelmas", "Live · 7 submissions · minted 2 May"),
  makeRow("Old handout, Hilary 2025-26", "Revoked 14 Apr · 0 since"),
);
host.append(qr);
const anchor = cardTemplate();
(anchor?.parentElement ?? document.body).append(host);
