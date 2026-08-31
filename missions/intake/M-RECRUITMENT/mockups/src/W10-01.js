// W10-01 — The recruitment cycle, in the shipped messaging-schedule's language.
//
// Two corrections. It used to append its panels to the end of a 2,800px page,
// so the review box showed the top of an untouched messaging screen and Brian
// reported, correctly, "you just screenshotted it." The cycle now lands above
// the page's first card. And it explained itself in a coloured card inside the
// frame; the words are in the screen head now, and the regions are outlined.
setHeading(
  "Recruitment cycle",
  "Season 2026-27 · what fires, in what order, and who may change it",
);

const anchor = cardTemplate();

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

// 1. The cycle as an ordered sequence of named steps, each able to be turned off.
const cycle = proposedRegion("The cycle");
const steps = [
  step(1, "recruit_welcome", "On capture, from every door", true),
  step(2, "recruit_interest_ask", "Immediately after they accept", true),
  step(3, "recruit_gentle_reminder", "1 day later, only if nothing came back", true),
  step(4, "recruit_details_ask", "1 day after the welcome", true),
  step(5, "recruit_details_reminder", "3 days later, once only", false),
];
cycle.append(...steps);
placeBefore(anchor, cycle);
mark(cycle, 1);

// 2. The community-group link, and when it last changed. The most likely silent
//    failure in the mission is a rotated link nobody notices.
const link = proposedRegion("The community-group link");
link.append(
  makeRow("Current link", "chat.whatsapp.com/HxK2s…"),
  makeRow("Last changed", "14 April 2026 by Caspian Hallowfield"),
  makeRow("Carried by", "Step 1, and every QR landing page"),
);
placeBefore(anchor, link);
mark(link, 2);

// 3. The step that is off. Stated on the cycle, so a recruit going quiet is not
//    mistaken for disinterest when the club simply stopped asking.
mark(steps[4], 3);
