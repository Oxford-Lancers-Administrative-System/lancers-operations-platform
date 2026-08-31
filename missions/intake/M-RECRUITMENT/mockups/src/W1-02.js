// W1-02 — The same board, scrolled to the Events band.
//
// Boundary item 36, Brian 2026-08-28: "almost copy how normal event attendance
// works, except for recruitment… I want to see them as one line." So the event
// columns are appended at the right end in date order and the pinned Recruit
// column stays put while they scroll, exactly as the roster board's eighteen
// columns do.
//
// This screen exists to show that scroll and the event cells at full size. It
// is the identical board to W1-01 — same builder, same data — so the two can
// never disagree.
buildRecruitBoard();

// Scroll the board's own container, not the window: the pinned first column is
// sticky inside it, and scrolling the page would prove nothing.
//
// Asking for the Events band's own left edge clamps to the container's maximum
// here, because the table is only a little wider than the viewport: the board's
// right end IS this position. So the Notes column stays half in frame, which is
// what a scrolled board actually looks like and not a defect to hide.
const scroller = must(
  document.querySelector(".MuiTableContainer-root"),
  "the board has no scrolling container",
);
const headers = [...document.querySelectorAll("thead tr:last-child th")];
const firstEvent = must(
  headers.find((th) => /Freshers' Fair/.test(th.textContent)),
  "the board has no first event column to scroll to",
);
const pinnedWidth = headers[0].getBoundingClientRect().width;
scroller.scrollLeft = firstEvent.offsetLeft - pinnedWidth;

if (scroller.scrollLeft === 0 && scroller.scrollWidth > scroller.clientWidth) {
  throw new Error("The board did not scroll; the Events band would not be in frame.");
}

await settle();
