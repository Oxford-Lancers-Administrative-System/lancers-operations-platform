// W13-01 — Take a recruit off the board.
//
// Rebuilt 2026-08-31. Brian, on the version this replaces: "The W13 has a bunch
// of narrative bullshit on the page. It's not supposed to be narrative in
// nature. If somebody's flipped to the [declined], we don't need a whole other
// screen to pop up and call out on it. That's fucking silly... If they're gone,
// it should be like 'flip to decline' and be like, 'it just declined.'"
//
// So the drawn "What just happened" panel is gone, and the whole screen is one
// chip. That is the point of the workflow: there is no removal mechanism, no
// archive and no delete. Brian, earlier the same day: "that's a status change...
// and then the board resorts, more or less."
//
// This is W1's approved board, unchanged — `buildRecruitBoard` draws the table
// AND the phone card list from one dataset, which is why the phone shot is now
// six recruits rather than the roster's forty-two players. The earlier build
// rewrote the table only.
buildRecruitBoard();

// Clementine Varrow drops from disengaged to declined. Nothing else moves and
// nothing is deleted: the row stays, the record stays, every signal and note
// stays, and the ladder stops reaching them. Removing the person is erasure,
// which is Mission 8's and never recruitment's — owner decision 2026-08-25.
const { chip } = setRecruitStatus("Clementine Varrow", "declined");

mark(chip, 1);

await settle();
