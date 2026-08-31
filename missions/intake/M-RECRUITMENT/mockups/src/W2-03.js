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
pageButton("SEND A QUESTIONNAIRE");

// The dialog the button opens. Two templates, because there are two
// questionnaires; each shows when it last went out, which is the whole point.
openDialog({
  title: "Send a questionnaire",
  question: "Which questionnaire do you want to send to Tobias Wrenfield?",
  choices: [
    {
      name: "Who you are",
      template: "recruit_personal_details",
      sent: [],
    },
    {
      name: "How you came to football",
      template: "recruit_questionnaire",
      sent: ["4 May 2026", "reminder 6 May 2026"],
      warning: "Answered on 7 May. Sending again will ask them the same questions.",
    },
  ],
});

await settle();
