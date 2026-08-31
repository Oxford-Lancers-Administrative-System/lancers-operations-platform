// W4-01 — Fill in your details. Drawn: no signed-link token exists in the
// seeded data, so no such page renders anywhere on main.
const card = drawnSurface({
  title: "Tell us a bit about yourself",
  subtitle: "Oxford Lancers · this link is just for you, Rosalind",
  chrome: "oxfordlancers.example/a/9f3c…",
});
card.append(
  field("Have you played before?", "Never · A bit · Yes, properly"),
  field("Any position you fancy?", "Not sure yet", {
    help: "Nothing binding — it just gives a coach something to talk to you about.",
  }),
  field("Do you have any gear?", "Nothing · Boots · Boots and a helmet"),
  field("How did you hear about us?", "Freshers' Fair"),
  field("Anything else we should know?", "Optional"),
  primaryButton("SEND"),
  note(
    "Every field is optional and nothing here decides anything. Missing information never blocks a capture and never blocks the flip — Task 09 D5 and invariant 4. The link acts as Rosalind and exposes nothing else about the club.",
  ),
);
