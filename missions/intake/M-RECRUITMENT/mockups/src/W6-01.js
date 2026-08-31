// W6-01 — Adding a recruit by hand, in the shipped add-a-person form. One
// addition: this is the only door carrying no natural opt-in.
setHeading("Add a recruit");
fill("givenName", "Marguerite");
fill("familyName", "Ashdown");
fill("phone", "07700 900461");
const box = proposedBlock("amber");
blockTitle(box, "How did the club come by this number?");
blockText(
  box,
  "Met her at the Freshers' Fair; she gave me her number so we could tell her about sessions.",
);
box.append(checkboxRow("She knows the club will message her", true));
afterField("phone", box) ?? document.querySelector("form")?.append(box);
