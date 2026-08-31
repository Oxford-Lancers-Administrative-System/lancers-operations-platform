// W2-03 — Sending a questionnaire, from the recruit's record.
//
// Brian, 2026-08-31: "It's a button. I press it, a pop-up comes up, and it says,
// 'Send questionnaire. Do you want to send the questionnaire?' Then here are the
// last times we've sent them a questionnaire, because we don't want to fucking
// bug them that many times."
//
// Every message the club sends is a Meta-approved template —
// `src/lib/delivery/config.ts:168`, "`template` is the only production shape" —
// so this chooses a template and fires it. There is nothing to type and there is
// no composer anywhere in this mission.
//
// Tobias's record underneath, so the dialog is seen over the page it opens from.
// The whole record, the same one W2-02 shows, so the dialog opens over the page
// it belongs to rather than over the shipped player record.
buildRecruitRecord();
pageButton("SEND PERSONAL QUESTIONNAIRE");
pageButton("SEND RECRUITMENT QUESTIONNAIRE");

// The dialog the button opens. Two templates, because there are two
// questionnaires; each shows when it last went out, which is the whole point.
// The dialog SEND RECRUITMENT QUESTIONNAIRE opens. There is no chooser in it,
// because the button already chose: there are two questionnaires and therefore
// two buttons. Brian, 2026-08-31: "There's one for the personal, and there's one
// for the recruitment."
openDialog({
  title: "Send the recruitment questionnaire?",
  question:
    "Tobias Wrenfield will get a WhatsApp message with a link to the questions about how he came to football.",
  sent: ["4 May 2026", "reminder 6 May 2026"],
  note: "He answered it on 7 May. Sending again asks him the same questions.",
});

await settle();
