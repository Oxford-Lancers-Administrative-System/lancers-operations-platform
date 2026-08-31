// W10-01 — The recruitment cycle: what the club sends, and when.
//
// Rebuilt on 2026-08-31 after Brian: "W10 is just not correct. It's using the
// wrong pages. I don't even know what it's doing here."
//
// It was prepending its content to /operate/admin/messaging, so it sat above
// Mission 4's per-event-type cadence forms. Those settings decide how an EVENT
// chases people; recruitment's cycle is a different thing on a different page,
// so the body is replaced rather than decorated.
//
// WHAT THIS SCREEN HAS TO ANSWER, and did not:
//
//   * The WhatsApp flow, per door. W7's recruit joins the group themselves at
//     the stand, so the welcome is not for them. W5 and W6 capture a number with
//     no group membership, so for those two the welcome IS the way in.
//   * Two questionnaires, not one. Brian settled that after this screen was
//     drawn, and the cycle still named a single ask.
//   * Never harsh, inherited from W9 when it folded: one reminder per ask, then
//     silence, and nothing fires at a recruit who has declined.
selectRecruitmentNav();
setHeading("Recruitment cycle");
pageSubtitle("Season 2026-27 · what the club sends, and when");
const host = clearPageBody();

const panel = (title) => {
  const box = proposedRegion(title);
  box.style.marginBottom = "18px";
  host.append(box);
  return box;
};

// ---- 1. Getting them into WhatsApp, which differs by door -----------------
const doors = panel("Getting them into WhatsApp");
const doorRow = (door, optIn, first) => {
  const row = document.createElement("div");
  row.style.cssText =
    "display:flex;gap:16px;align-items:baseline;padding:11px 0;border-bottom:1px solid rgba(0,0,0,0.08)";
  const d = document.createElement("div");
  d.textContent = door;
  d.style.cssText = "flex:0 0 190px;font-size:14px;font-weight:700";
  const o = document.createElement("div");
  o.textContent = optIn;
  o.style.cssText = "flex:0 0 200px;font-size:13.5px;color:rgba(0,0,0,0.7)";
  const f = document.createElement("div");
  f.textContent = first;
  f.style.cssText = "flex:1;font-size:13.5px;color:rgba(0,0,0,0.87)";
  row.append(d, o, f);
  return row;
};
doors.append(
  doorRow("Door", "Opt-in", "First message"),
  doorRow("W7 · QR sign-in", "They joined at the stand", "None. They are already in the group."),
  doorRow("W5 · Walk-up", "None captured", "recruit_welcome, carrying the group link"),
  doorRow(
    "W6 · Operator add",
    "How we came by the number",
    "recruit_welcome, carrying the group link",
  ),
);
doors.firstElementChild.nextElementSibling.style.fontWeight = "700";
mark(doors, 1);

// ---- 2. The cycle itself ---------------------------------------------------
const cycle = panel("The cycle");
const step = (n, name, when, on, note) => {
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
  w.style.cssText = "font-size:13px;color:rgba(0,0,0,0.72);margin-top:3px";
  body.append(t, w);
  if (note) {
    const n2 = document.createElement("div");
    n2.textContent = note;
    n2.style.cssText = "font-size:12.5px;color:rgba(0,0,0,0.55);margin-top:2px";
    body.append(n2);
  }
  const toggle = document.createElement("div");
  toggle.textContent = on ? "ON" : "OFF";
  toggle.style.cssText =
    `flex:0 0 auto;font-size:11px;font-weight:700;letter-spacing:.06em;padding:4px 11px;border-radius:12px;` +
    `color:${on ? "#1b5e20" : "rgba(0,0,0,0.5)"};background:${on ? "#e8f5e9" : "#eee"}`;
  row.append(num, body, toggle);
  return row;
};
cycle.append(
  step(
    1,
    "recruit_welcome",
    "On capture — walk-up and operator-add only",
    true,
    "Carries the community-group link. A QR recruit is already in the group and is skipped.",
  ),
  step(
    2,
    "recruit_details_ask",
    "1 day after capture",
    true,
    "Questionnaire A — who you are. Person facts, so they land on the person record.",
  ),
  step(
    3,
    "recruit_details_reminder",
    "3 days later, once only",
    true,
    "Never harsh: one reminder, then silence.",
  ),
  step(
    4,
    "recruit_interest_ask",
    "3 days after capture",
    true,
    "Questionnaire B — how you came to football.",
  ),
  step(
    5,
    "recruit_interest_reminder",
    "3 days later, once only",
    false,
    "Currently off. A recruit going quiet is then not disinterest — the club stopped asking.",
  ),
);
mark(cycle, 2);

// ---- 3. What the cycle never does -----------------------------------------
const never = panel("What the cycle never does");
never.append(
  makeRow("A recruit who declined", "Nothing fires. Ever."),
  makeRow("More than one reminder", "There is no second. Never harsh, inherited from W9."),
  makeRow("Event invitations", "Not here — an event sends its own, on its own terms (W11)."),
  makeRow("Free text", "Impossible. Every message is a Meta-approved template."),
);
mark(never, 3);

// ---- 4. The community-group link ------------------------------------------
const link = panel("The community-group link");
link.append(
  makeRow("Current link", "chat.whatsapp.com/HxK2s…"),
  makeRow("Last changed", "14 April 2026 by Caspian Hallowfield"),
  makeRow("Carried by", "recruit_welcome, and every QR landing page"),
);
mark(link, 4);

await settle();
