// W2-04 — The send that will not fire.
//
// The one screen worth keeping out of W9 when it was folded on 2026-08-31.
// Everything else W9 held had already been built into W2: the buttons, the
// dialog, and the record of what was sent.
//
// NEVER HARSH is a guarantee, so the product enforces it rather than leaving it
// to whoever is holding the phone. Ambrose Kittiwake declined; the club does not
// message him again. The button is still there — hiding it would leave an
// operator wondering whether they had missed something — and the dialog says
// plainly why it will not fire, and what would have to change first.
//
// This is also the shape the refusal has to take under templates-only: there is
// nothing to compose, so there is no "send anyway" to offer. The only way to
// message him again is for his status to stop being `declined`.
//
// ONE FACT, THREE PLACES. The banner states it before anybody acts; the buttons
// are disabled so the refusal is visible rather than discovered; the dialog
// answers the operator who pressed regardless. None of the three is the only
// place the fact lives, which is what Brian meant by getting it ingrained.
captureAlert();
buildRecruitRecord();
const personalButton = pageButton("SEND PERSONAL QUESTIONNAIRE");
const recruitmentButton = pageButton("SEND RECRUITMENT QUESTIONNAIRE");

// The record has to BE Ambrose's, not Tobias's with a new heading. The first
// attempt renamed the page and left the body alone, so a declined recruit
// carried somebody else's answered questionnaire, notes and history — the same
// failure this mission has hit repeatedly, and the reason every screen gets
// looked at before it is shown.
setHeading("Ambrose Kittiwake");
setSubtitle("Recruitment · 2026-27 · opened from the recruit board");
replaceSummaryStrip([
  [{ chip: "declined" }, "Recruitment status"],
  ["3 May 2026", "First contact"],
  ["1", "Events attended"],
]);

setPersonRows([
  recordRow("Name", "Ambrose Kittiwake"),
  recordRow("Aliases", "Not recorded", { muted: true }),
  recordRow("Mobile phone", "07700 900884"),
  recordRow("Personal email", "Not recorded", { muted: true }),
  recordRow("College", "Not recorded", { muted: true }),
  recordRow("Matriculation year", "Not recorded", { muted: true }),
]);

rebuildCard(
  bandedCard("RECRUITMENT"),
  "Recruitment",
  [
    recordRow("Status", null, { chip: "declined" }),
    recordRow("Came in through", "Walk-up · Taster 1"),
    recordRow("First contact", "3 May 2026"),
    recordRow("Declined on", "2 May 2026"),
  ],
  { colour: RECORD_BANDS.recruitment },
);

rebuildCard(
  bandedCard("RECRUITMENT QUESTIONNAIRE"),
  "Recruitment questionnaire",
  [
    recordRow("Questionnaire sent", "Not sent", { muted: true }),
    recordRow("Answered", "Not answered", { muted: true }),
  ],
  { colour: RECORD_BANDS.ask },
);

// His own send record, replacing the one the shared builder left behind.
sentDates(bandedCard("RECRUITMENT QUESTIONNAIRE"), "Recruitment questionnaire sent", []);

setRecruitmentEvents([
  {
    name: "Freshers' Fair",
    date: "30 Apr 2026",
    rsvp: "No",
    attendance: "Absent",
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
    rsvp: NOT_RECORDED,
    attendance: NOT_RECORDED,
    status: "Upcoming",
  },
]);

const notesCard = bandedCard("NOTES");
for (const child of [...notesCard.children].slice(1)) child.remove();
const notesBody = document.createElement("div");
notesBody.style.cssText = "padding:14px 16px";
const note1 = document.createElement("div");
note1.style.cssText = "font-size:14px;line-height:1.6;color:rgba(0,0,0,0.87)";
note1.textContent = "Said rugby clashes. Happy to be asked again next year.";
const by1 = document.createElement("div");
by1.style.cssText = "margin-top:4px;font-size:12px;color:rgba(0,0,0,0.55)";
by1.textContent = "Caspian Hallowfield · 2 May 2026";
notesBody.append(note1, by1);
notesCard.append(notesBody);

const historyCard = bandedCard("STATUS HISTORY");
for (const child of [...historyCard.children].slice(1)) child.remove();
const historyBody = document.createElement("div");
historyBody.style.cssText = "padding:14px 16px";
for (const [what, when] of [
  ["identified → declined · said rugby clashes", "2 May 2026, 20:11 · Caspian Hallowfield"],
  ["Welcome sent · WhatsApp template", "3 May 2026, 18:07 · delivered"],
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

// The status control shows the rung he is actually on.
const statusShown = document.querySelector(".MuiSelect-select");
if (statusShown) statusShown.replaceChildren(document.createTextNode("declined"));

// ---- The fact, at the top, before anybody presses anything ---------------
// Brian: "That should be a status at the very top where they said no to the
// WhatsApp... Figure out how to get it ingrained."
//
// So it is stated three times over, in descending order of how hard it is to
// miss: the banner, the buttons that will not fire, and only then the dialog
// for the operator who pressed anyway.
mark(
  pageAlert(
    "The club will not message Ambrose.",
    "He declined on 2 May 2026. Change his recruitment status if that is wrong.",
  ),
  1,
);
mark(disableButton(personalButton), 2);
disableButton(recruitmentButton);

const scrim = openDialog({
  title: "Ambrose has asked not to be contacted",
  question:
    "He declined on 2 May 2026. The club does not message a recruit who has declined, so this will not send.",
  sent: ["Welcome, 3 May 2026"],
  note: "Change his status if that is wrong. Nothing else here will send to him.",
});

// The send is not offered, because there is nothing to compose and nothing to
// override. Only CANCEL remains.
// openDialog returns the scrim; querying for it by inline style failed because
// cssText normalises the spacing.
const send = [...scrim.querySelectorAll("a, button")].find((b) =>
  /^SEND$/i.test(b.textContent.trim()),
);
if (send) send.remove();

await settle();
