// W5-02 — The real form at ?add=walk-up, with the read-back step Task 04 D-4
// requires and main does not implement. The four fields are the shipped ones.
fill("givenName", "Marguerite");
fill("familyName", "Ashdown");
fill("phone", "07700 900461");
const box = proposedBlock("amber");
blockTitle(box, "Read the number back before you save");
blockText(box, "“I have oh-seven-seven-double-oh, nine-oh-oh, four-six-one — is that right?”");
box.append(checkboxRow("They confirmed it", false));
afterField("phone", box) ?? document.querySelector("form")?.append(box);
