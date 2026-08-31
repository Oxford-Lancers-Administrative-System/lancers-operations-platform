// W12-02 — The same sheet opened by a coach. What is absent is the point.
setHeading("Attendance · Freshers' Fair — stand", "Opened by Zenas Yaxlington, Head Coach");
const box = proposedBlock("amber");
blockTitle(box, "What a coach never receives");
const rows = document.createElement("div");
rows.style.cssText = "margin-top:6px;font-size:13.5px;line-height:2";
rows.innerHTML =
  "Recruitment status &mdash; <strong>not in the page, not in the payload</strong><br>" +
  "Contact values &mdash; <strong>not in the page, not in the payload</strong><br>" +
  "Notes and signals &mdash; <strong>not in the page, not in the payload</strong><br>" +
  "The recruit board &mdash; <strong>not reachable from this surface at all</strong>";
box.append(rows);
blockText(
  box,
  "Absent rather than hidden — the LAN-75 contract. The data never reaches the browser, so there is nothing to reveal by inspecting the page.",
);
const anchor = cardTemplate();
anchor?.parentElement?.insertBefore(box, anchor);
