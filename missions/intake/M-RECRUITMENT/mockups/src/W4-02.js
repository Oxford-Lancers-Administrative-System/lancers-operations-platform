// W4-02 — Questionnaire B: how you came to football.
//
// The second questionnaire, sent at a different time from the first. Brian
// settled its fields on 2026-08-31 and struck the casual wording of the earlier
// draft: "The questions are a little bit too casual. They should really ask
// these things about this."
//
// Each question uses the control the shipped `QuestionField` would give it —
// the two "have you ever" questions are `boolean`, so they are Yes/No selects,
// not free text.
captureFormControls();

const card = drawnSurface({
  title: "About your football experience",
  subtitle: "",
  chrome: "oxfordlancers.example/a/7b21…",
  width: 620,
});

recruitFormHead(card, {
  name: "Rosalind Penhaligon",
  title: "About your football experience",
  blurb:
    "So the coaches know where to start with you. There are no wrong answers and " +
    "nothing here decides whether you can play. Every question is optional.",
});

for (const question of [
  { prompt: "Have you played American football before?", kind: "boolean" },
  { prompt: "Have you watched American football before?", kind: "boolean" },
  {
    prompt: "Which position interests you?",
    kind: "choice",
    options: [
      "No preference",
      "Quarterback",
      "Running back",
      "Wide receiver",
      "Offensive line",
      "Defensive line",
      "Linebacker",
      "Defensive back",
      "Kicker",
    ],
  },
  {
    prompt: "What playing gear do you already own?",
    kind: "choice",
    options: ["None", "Boots only", "Boots and gloves", "Full pads", "Something else"],
  },
  {
    prompt: "How did you hear about the Lancers?",
    kind: "choice",
    options: [
      "Freshers' Fair",
      "A friend or teammate",
      "A poster or QR code",
      "Social media",
      "Somewhere else",
    ],
  },
  { prompt: "Anything else you would like us to know?", kind: "text" },
]) {
  card.append(questionField(question));
}

card.append(primaryButton("SEND MY ANSWERS"));
card.append(
  note(
    "Nothing here gates anything: missing answers never block a capture and never block the flip — Task 09 D5 and invariant 4. One polite reminder follows if it goes unanswered, and then nothing.",
  ),
);

await settle();
