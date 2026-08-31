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
// The event names now live in the BAND row — each event is its own band over
// its RSVP and Attendance columns — so the scroll target is found there.
const firstEvent = must(
  [...document.querySelectorAll("thead tr:first-child th")].find((th) =>
    /Freshers' Fair/.test(th.textContent),
  ),
  "the board has no first event band to scroll to",
);
// Measure against the SCROLLER, not the offset parent. `offsetLeft` is relative
// to the table, which left the first event's RSVP column hidden behind the
// sticky Recruit column.
const pinnedWidth = document
  .querySelector("thead tr:last-child th")
  .getBoundingClientRect().width;
scroller.scrollLeft +=
  firstEvent.getBoundingClientRect().left -
  scroller.getBoundingClientRect().left -
  pinnedWidth;

if (scroller.scrollLeft === 0 && scroller.scrollWidth > scroller.clientWidth) {
  throw new Error("The board did not scroll; the Events band would not be in frame.");
}

await settle();
