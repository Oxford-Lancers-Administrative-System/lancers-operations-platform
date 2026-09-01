// W5-02 — The shipped walk-up form, filled in.
//
// The four fields are the application's own and the form is the application's
// own. Nothing is added to it: the read-back step an earlier draft proposed
// here is gone, and so are the duplicate-check and no-mobile screens that stood
// beside it — W8 owns duplicates, and an edge case is not a step in this flow.
//
// Brian, 2026-08-31: "There are basically needless extensions on this and
// narration, particularly on W5-02. It should just be the normal workflow."
fill("givenName", "Marguerite");
fill("familyName", "Ashdown");
fill("phone", "07700 900461");

await settle();
