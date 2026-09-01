// W4-01 — Questionnaire A: who you are.
//
// The first of the two questionnaires. Brian, 2026-08-31: "The W4 and W15 should
// have personal details. They should be two separate questionnaires that get
// sent out at different times... It's two questionnaires."
//
// `/a/[token]` exists on main but nothing renders it — both token tables are
// empty in the seed — so this screen is drawn. The CONTROLS are not: they are
// cloned off the live board before the page is cleared, so every field is the
// application's own, and each question uses the control the shipped
// `QuestionField` would give it.
//
// The recruit's own name sits at the top: Brian, "They should have the player
// name near the top as well."
captureFormControls();

const card = drawnSurface({
  title: "Your details",
  subtitle: "",
  chrome: "oxfordlancers.example/a/9f3c…",
  width: 620,
});

recruitFormHead(card, {
  name: "Rosalind Penhaligon",
  title: "Your details",
  blurb:
    "The Oxford Lancers hold these so we can reach you about training and events. " +
    "Correct anything we have wrong. Every question is optional.",
});

for (const question of [
  { prompt: "Preferred name", kind: "text", value: "Rosalind" },
  { prompt: "Mobile number", kind: "text", value: "07700 900318" },
  { prompt: "Email address", kind: "text" },
  {
    prompt: "College",
    kind: "choice",
    value: "Dunsfold",
    options: ["Beaumont", "Dunsfold", "Harewell", "Kestrelhall", "Marlbrook", "Rushbourne"],
  },
  {
    prompt: "Year of matriculation",
    kind: "choice",
    value: "2026",
    options: ["2023", "2024", "2025", "2026"],
  },
]) {
  card.append(questionField(question));
}

card.append(primaryButton("SAVE MY DETAILS"));
card.append(
  note(
    "Answers land on the person record, which Mission 5 owns. This mission owns the asking: minting the link, sending it and receiving what comes back.",
  ),
);

await settle();
