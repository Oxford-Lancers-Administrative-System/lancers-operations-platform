// W5-05 — Saved. This is the shipped success state at ?added=walk-up; the
// proposal adds where she went, because "in recruitment" is not a place an
// operator can click to.
const box = proposedBlock("green");
blockTitle(box, "Marguerite Ashdown is on the recruit board");
blockText(box, "Recruit · identified · welcome and community-group invite sent");
const link = document.createElement("div");
link.textContent = "Open her recruit record →";
link.style.cssText = "font-size:13.5px;font-weight:700;color:#1b5e20;margin-top:10px";
box.append(link);
const alert = $(".MuiAlert-root");
if (alert) alert.parentElement?.insertBefore(box, alert.nextSibling);
else ($("h1")?.parentElement ?? document.body).append(box);
