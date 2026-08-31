// W6-01 — Adding a recruit by hand.
//
// The shipped add-a-person form at /operate/people/new, which already carries
// given name, family name, mobile and personal email, and already runs the
// club's duplicate check.
//
// Brian, 2026-08-31: "I think we can add more personal details about them here.
// If we're trying to add a recruit, we should add name, phone number, and
// information, whatever details we have about them. At the minimum, we need the
// name, first name, last name, and phone number. And then maybe the other
// details underneath it."
//
// So the four shipped fields stay as they are and a second block is proposed
// beneath them. Its fields are not invented: they are the person record's own,
// in the order `MISSING_FILTER_FIELDS` lists them — college, matriculation year
// — which is the same inventory the Missing data queue names and filters by.
//
// The opt-in question is a FIELD here rather than the amber callout an earlier
// draft used. Task 09 §9.1 says an operator adding somebody by hand has no
// natural opt-in, so this door has to capture one; a control captures it, a
// callout only talks about it.
//
// They render as text fields because that is what this form and the shipped
// person-edit form use — College and Matriculation year are `CorrectableField`
// text inputs there, under a section headed "Academic", not dropdowns. "How we
// came by this number" IS a fixed set and should be a select; no select renders
// on this route to clone, so its options are listed rather than drawn.
selectRecruitmentNav();
captureFormControls();

setHeading("Add a recruit");
// The way back is recruitment, not People: this door is reached from the board.
relabelButton("← People", "← Recruitment");
fill("givenName", "Marguerite");
fill("familyName", "Ashdown");
fill("mobile", "07700 900461");
fill("personalEmail", "m.ashdown@example.ac.uk");

const extra = proposedRegion("Academic");
extra.style.marginTop = "18px";
for (const question of [
  {
    prompt: "College",
    kind: "choice",
    value: "Kestrelhall",
    options: ["Beaumont", "Dunsfold", "Harewell", "Kestrelhall", "Marlbrook", "Rushbourne"],
  },
  {
    prompt: "Matriculation year",
    kind: "choice",
    value: "2026",
    options: ["2023", "2024", "2025", "2026"],
  },
  {
    prompt: "How we came by this number",
    kind: "choice",
    value: "They gave it to us at the Freshers' Fair",
    options: [
      "They gave it to us at the Freshers' Fair",
      "They gave it to us at a taster",
      "A current player passed it on",
      "Somewhere else",
    ],
  },
]) {
  extra.append(questionField(question));
}

const anchor = must(
  document.querySelector('input[name="personalEmail"]')?.closest(".MuiFormControl-root")
    ?.parentElement,
  "the form has no personal email field to sit beneath",
);
anchor.after(extra);
mark(extra, 1);

await settle()
