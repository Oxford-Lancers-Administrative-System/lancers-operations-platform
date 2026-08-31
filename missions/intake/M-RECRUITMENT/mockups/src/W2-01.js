// W2-01 — One recruit's record.
//
// Built on the shipped player record at `/operate/roster/[membershipId]`, card
// for card, because Brian asked for exactly that on 2026-08-31: "The pages
// underneath should be very similar to the roster in the way that it's done,
// except it's the recruit player page, not the roster player page… We shouldn't
// invent UI elements here."
//
// Rosalind Penhaligon is one of the two recruits actually seeded at
// main@e669331. She is early in the funnel: identified, one event, the
// recruit-stage ask not yet sent, no notes. That is the ordinary case at the top
// of the funnel and the page has to read well when almost nothing is known.
selectRecruitmentNav();

setHeading("Rosalind Penhaligon");

// "It should be very clear at the top that this is underneath the recruitment.
// This is /recruitment, not /roster." So the line under the name names the
// section and the season, and the button at the foot goes back to recruitment.
setSubtitle("Recruitment · 2026-27 · opened from the recruit board");

replaceSummaryStrip([
  [{ chip: "identified" }, "Recruitment status"],
  ["28 Apr 2026", "First contact"],
  ["1", "Events attended"],
]);

// ---- PERSON — kept as the shipped card, read-only, routing out -------------
// Mission 5 owns these and owns correcting them. The card already carries its
// "Open the person record →" action, so nothing here needs inventing.
removeCardAction(bandedCard("PERSON"));
setPersonRows([
  recordRow("Name", "Rosalind Penhaligon"),
  recordRow("Aliases", "Not recorded", { muted: true }),
  recordRow("Mobile phone", "07700 900318"),
  recordRow("Personal email", "Not recorded", { muted: true }),
  recordRow("College", "Dunsfold"),
  recordRow("Matriculation year", "2026"),
  recordRow("Expected graduation", "2029"),
  recordRow("Degree field", "Human Sciences"),
]);

// ---- ONBOARDING -> RECRUITMENT --------------------------------------------
// The recruit's own stored fields, and only those. `On WhatsApp` is gone: Brian
// struck it from the board on the same day because it is not a recruit field,
// and it is not one here either.
const recruitmentCardRef = rebuildCard(
  bandedCard("ONBOARDING"),
  "Recruitment",
  [
    recordRow("Status", null, { chip: "identified" }),
    recordRow("Came in through", "QR · Freshers' Fair stand"),
    recordRow("First contact", "28 April 2026"),
    recordRow("Committed on", "Not recorded", { muted: true }),
  ],
  { colour: RECORD_BANDS.recruitment },
);

// ---- SEASON -> THE RECRUIT-STAGE ASK --------------------------------------
// "I should see when they fill out information." Before they have, the card
// says so plainly and offers the send; W2-02 is the same card answered.
const questionnaireCardRef = rebuildCard(
  bandedCard("SEASON"),
  "Recruitment questionnaire",
  [
    recordRow("Questionnaire sent", "Not sent", { muted: true }),
    recordRow("Answered", "Not answered", { muted: true }),
    recordRow("Played American football before?", "Not answered", { muted: true }),
    recordRow("Watched American football before?", "Not answered", { muted: true }),
    recordRow("Position interest", "Not answered", { muted: true }),
    recordRow("Gear owned", "Not answered", { muted: true }),
    recordRow("How they heard of us", "Not answered", { muted: true }),
    recordRow("Anything else", "Not answered", { muted: true }),
  ],
  { colour: RECORD_BANDS.ask },
);

// ---- ATTENDANCE -> RECRUITMENT EVENTS -------------------------------------
// The shipped attendance table, kept whole. Same columns Brian approved on the
// board that morning, same violet the record already gives this card.
const eventsCardRef = setRecruitmentEvents([
  {
    name: "Freshers' Fair",
    date: "30 Apr 2026",
    rsvp: NOT_RECORDED,
    attendance: "Absent",
    status: "Occurred",
  },
  {
    name: "Taster 1",
    date: "3 May 2026",
    rsvp: NOT_RECORDED,
    attendance: NOT_RECORDED,
    status: "Occurred",
  },
  {
    name: "Taster 2",
    date: "10 May 2026",
    rsvp: NOT_RECORDED,
    attendance: NOT_RECORDED,
    status: "Upcoming",
  },
]);

// ---- THEIR OTHER SEASONS -> NOTES -----------------------------------------
// "I should be able to fill in my own information where it makes sense for me to
// be able to do that." Notes are the operator's own, attributed and dated.
recolourCard("THEIR OTHER SEASONS", "Notes", RECORD_BANDS.person);
const notes = bandedCard("NOTES");
for (const child of [...notes.children].slice(1)) child.remove();
const notesBody = document.createElement("div");
notesBody.style.cssText = "padding:14px 16px";
const oneNote = document.createElement("div");
oneNote.style.cssText = "font-size:14px;line-height:1.6;color:rgba(0,0,0,0.87)";
oneNote.textContent = "Came to the stand with a friend from Dunsfold.";
const byline = document.createElement("div");
byline.style.cssText = "margin-top:6px;font-size:12px;color:rgba(0,0,0,0.55)";
byline.textContent = "Caspian Hallowfield · 28 April 2026";
const addNote = document.createElement("div");
addNote.style.cssText =
  "margin-top:14px;border:1px dashed rgba(0,0,0,0.28);border-radius:6px;padding:11px 13px;" +
  "font-size:14px;color:rgba(0,0,0,0.38)";
addNote.textContent = "Add a note…";
notesBody.append(oneNote, byline, addNote);
notes.append(notesBody);

// ---- STATUS HISTORY — recruitment's own changes ---------------------------
recolourCard("STATUS HISTORY", "Status history", RECORD_BANDS.person);
const historyCard = bandedCard("STATUS HISTORY");
for (const child of [...historyCard.children].slice(1)) child.remove();
const historyBody = document.createElement("div");
historyBody.style.cssText = "padding:14px 16px";
for (const [what, when] of [
  ["Welcome sent · WhatsApp template", "28 Apr 2026, 14:14 · delivered"],
  ["Added as identified · QR scan at the Freshers' Fair stand", "28 Apr 2026, 14:12"],
]) {
  const line = document.createElement("div");
  line.style.cssText = "font-size:14px;color:rgba(0,0,0,0.87)";
  line.textContent = what;
  const meta = document.createElement("div");
  meta.style.cssText = "margin-top:3px;font-size:12px;color:rgba(0,0,0,0.55)";
  meta.textContent = when;
  historyBody.append(line, meta);
}
historyCard.append(historyBody);

// The way back is to recruitment, not to the roster.
// ---- One button, top right -----------------------------------------------
// Not four links in card headers, and no Flip to joined: the flip is a status
// change, which the status control makes and W14 interrupts.
pageButton("SEND PERSONAL QUESTIONNAIRE");
pageButton("SEND RECRUITMENT QUESTIONNAIRE");

// ---- The send record, embedded at the foot of each card -------------------
sentDates(bandedCard("PERSON"), "Personal details questionnaire sent", []);
sentDates(questionnaireCardRef, "Recruitment questionnaire sent", []);

relabelButton("back to roster", "BACK TO RECRUITMENT");

window.history.replaceState(null, "", "/operate/recruitment/rosalind-penhaligon");

await settle();
