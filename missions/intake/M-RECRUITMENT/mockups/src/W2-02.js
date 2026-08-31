// W2-02 — The same record, with something on it.
//
// W2-01 shows the page at its emptiest, which is the honest top-of-funnel case
// but means the recruit-stage ask is only ever seen as seven rows of "Not
// answered" and the editing Brian asked for is asserted and never shown.
//
// Brian, 2026-08-31: "I should be able to make edits and updates as it makes
// sense for that particular user. I should see when they fill out information. I
// should be able to fill in my own information where it makes sense for me to be
// able to do that, and that's that."
//
// So this is one screen doing both jobs, and it replaced two that did neither:
// the old W2-02 was the same page for a different recruit, and the old W2-03 was
// a narrated sign-on ladder. Both are deleted.
//
// Tobias Wrenfield is the second of the two recruits actually seeded at
// main@e669331.
selectRecruitmentNav();

setHeading("Tobias Wrenfield");
setSubtitle("Recruitment · 2026-27 · opened from the recruit board");

replaceSummaryStrip([
  [{ chip: "engaged" }, "Recruitment status"],
  ["3 May 2026", "First contact"],
  ["2", "Events attended"],
  ["Answered", "Recruit-stage ask"],
]);

setPersonRows([
  recordRow("Name", "Tobias Wrenfield"),
  recordRow("Aliases", "Toby"),
  recordRow("Mobile phone", "07700 900412"),
  recordRow("Personal email", "t.wrenfield@example.ac.uk"),
  recordRow("College", "Marlbrook"),
  recordRow("Matriculation year", "2025"),
  recordRow("Expected graduation", "2028"),
  recordRow("Degree field", "Engineering Science"),
]);

// ---- RECRUITMENT, with one field open for editing -------------------------
rebuildCard(
  bandedCard("ONBOARDING"),
  "Recruitment",
  [
    recordRow("Status", null, { chip: "engaged" }),
    recordRow("Came in through", "Walk-up · Taster 1"),
    recordRow("First contact", "3 May 2026"),
    recordRow("Committed on", "Not recorded", { muted: true }),
  ],
  { colour: RECORD_BANDS.recruitment },
);

// The editing state, drawn from the application's own text field rather than
// invented: an operator has clicked into Status and the ladder is open.
const recruitmentCard = bandedCard("RECRUITMENT");
const statusRow = must(
  [...recruitmentCard.querySelectorAll('[data-testid="record-row"]')].find((r) =>
    /^Status/.test(r.innerText.trim()),
  ),
  "the RECRUITMENT card has no Status row to open for editing",
);
const valueBox = must(statusRow.children[1], "the Status row has no value cell");
valueBox.replaceChildren();

const editor = document.createElement("div");
editor.style.cssText =
  "display:inline-flex;flex-direction:column;gap:6px;border:2px solid #00695c;border-radius:6px;" +
  "padding:8px 10px;background:#fff;min-width:220px";
const editorLabel = document.createElement("div");
editorLabel.textContent = "Status";
editorLabel.style.cssText = "font-size:11px;font-weight:700;color:#00695c;letter-spacing:.06em";
editor.append(editorLabel);
for (const rung of ["identified", "engaged", "committed", "declined", "disengaged"]) {
  const option = document.createElement("div");
  option.style.cssText =
    "display:flex;align-items:center;gap:8px;font-size:13.5px;padding:3px 2px;" +
    (rung === "engaged" ? "font-weight:700" : "");
  const dot = document.createElement("span");
  dot.style.cssText = `width:10px;height:10px;border-radius:50%;background:${LADDER[rung] ?? "#78909c"}`;
  const text = document.createElement("span");
  text.textContent = rung;
  option.append(dot, text);
  if (rung === "engaged") {
    const tick = document.createElement("span");
    tick.textContent = "✓";
    tick.style.cssText = "margin-left:auto;color:#00695c;font-weight:800";
    option.append(tick);
  }
  editor.append(option);
}
const editorNote = document.createElement("div");
editorNote.textContent = "joined is not chosen here — it goes through W14";
editorNote.style.cssText =
  "margin-top:4px;padding-top:6px;border-top:1px solid rgba(0,0,0,0.10);font-size:11.5px;color:rgba(0,0,0,0.55)";
editor.append(editorNote);
valueBox.append(editor);

// ---- THE RECRUIT-STAGE ASK, answered --------------------------------------
rebuildCard(
  bandedCard("SEASON"),
  "The recruit-stage ask",
  [
    recordRow("Ask", "Sent 4 May · answered 5 May 2026"),
    recordRow("Played American football before?", "No"),
    recordRow("Watched American football before?", "Yes"),
    recordRow("Position interest", "Wide receiver, or wherever you need"),
    recordRow("Gear owned", "None"),
    recordRow("How they heard of us", "A friend on my staircase plays"),
    recordRow("Anything else", "Played rugby at school. Asked about kit costs."),
  ],
  { colour: RECORD_BANDS.ask },
);

// ---- RECRUITMENT EVENTS, with content -------------------------------------
setRecruitmentEvents([
  {
    name: "Freshers' Fair",
    date: "30 Apr 2026",
    rsvp: "Yes",
    attendance: "Present",
    status: "Occurred",
  },
  {
    name: "Taster 1",
    date: "3 May 2026",
    rsvp: NOT_RECORDED,
    attendance: "Present",
    status: "Occurred",
  },
  {
    name: "Taster 2",
    date: "10 May 2026",
    rsvp: "Yes",
    attendance: NOT_RECORDED,
    status: "Upcoming",
  },
]);

// ---- NOTES ----------------------------------------------------------------
recolourCard("THEIR OTHER SEASONS", "Notes", RECORD_BANDS.person);
const notesCard = bandedCard("NOTES");
for (const child of [...notesCard.children].slice(1)) child.remove();
const notesBody = document.createElement("div");
notesBody.style.cssText = "padding:14px 16px";
for (const [text, by] of [
  [
    "Played at school. Asked about kit — told him the club has spares.",
    "Caspian Hallowfield · 3 May 2026",
  ],
  ["Turned up to Taster 1 without an RSVP. Keen.", "Caspian Hallowfield · 3 May 2026"],
]) {
  const body = document.createElement("div");
  body.style.cssText = "font-size:14px;line-height:1.6;color:rgba(0,0,0,0.87);margin-top:10px";
  body.textContent = text;
  const meta = document.createElement("div");
  meta.style.cssText = "margin-top:4px;font-size:12px;color:rgba(0,0,0,0.55)";
  meta.textContent = by;
  notesBody.append(body, meta);
}
const addNote = document.createElement("div");
addNote.style.cssText =
  "margin-top:14px;border:1px dashed rgba(0,0,0,0.28);border-radius:6px;padding:11px 13px;" +
  "font-size:14px;color:rgba(0,0,0,0.38)";
addNote.textContent = "Add a note…";
notesBody.append(addNote);
notesCard.append(notesBody);

// ---- STATUS HISTORY -------------------------------------------------------
recolourCard("STATUS HISTORY", "Status history", RECORD_BANDS.person);
const historyCard = bandedCard("STATUS HISTORY");
for (const child of [...historyCard.children].slice(1)) child.remove();
const historyBody = document.createElement("div");
historyBody.style.cssText = "padding:14px 16px";
for (const [what, when] of [
  [
    "identified → engaged · answered the recruit-stage ask",
    "5 May 2026, 19:40 · Caspian Hallowfield",
  ],
  ["Added as identified · walk-up at Taster 1", "3 May 2026, 18:05 · Caspian Hallowfield"],
]) {
  const line = document.createElement("div");
  line.style.cssText = "font-size:14px;color:rgba(0,0,0,0.87);margin-top:10px";
  line.textContent = what;
  const meta = document.createElement("div");
  meta.style.cssText = "margin-top:3px;font-size:12px;color:rgba(0,0,0,0.55)";
  meta.textContent = when;
  historyBody.append(line, meta);
}
historyCard.append(historyBody);

relabelButton("back to roster", "BACK TO RECRUITMENT");
window.history.replaceState(null, "", "/operate/recruitment/tobias-wrenfield");

await settle();
