// W7-01 — A disputed fact, on the record that already shows who said what.
//
// W5 raises this; W7 settles it. The person record already renders a Fact row
// per person fact and a bordered `By` caption naming who supplied the value —
// so a disputed fact is that row carrying a second value and a second badge,
// not a new component.
//
// Mission 5 shipped none of this deliberately: "There is no contested-value
// field, no verification-mark field and no confidence class anywhere below —
// not struck out, never added." This is the seam it left.
const college = factRow("College");

// 1 — the club's value, and who recorded it. Both already ship: the value in
//     the Fact row, the name in the record's own attribution badge.
setFactValue(college, "Farrowgate");
setFactBadge(college, "Caspian Hallowfield, 28 Aug");
mark(college, 1);

// 2 — and the player's answer, against it. Same row, same type, same badge the
//     record already uses for attribution.
mark(addFactLine(college, "Brasenose", byBadge("Merrick Thornbury, 2 Sep")), 2);

await settle();
