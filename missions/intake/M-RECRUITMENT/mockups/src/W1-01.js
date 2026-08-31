// W1-01 — The recruit board, as an operator first sees it.
//
// The board is CLONED from the shipped roster board, element by element, so the
// banding, sticky header, filter chips and type scale are identical by
// construction rather than by resemblance. The phone card list is rebuilt from
// the same data, so both viewports show the same board — the thing the
// 2026-08-31 sweep got wrong, where the phone side stayed the shipped roster.
//
// Placement — Brian, 2026-08-31: Recruitment is a top-level sidebar destination
// directly under Roster, on its own page under /operate. Not an Administration
// entry.
//
// The board and its data live in the prelude; W1-02 is the same board scrolled
// to the Events band.
buildRecruitBoard();

await settle();
