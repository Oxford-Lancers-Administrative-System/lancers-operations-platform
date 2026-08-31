// W8-02 — The empty queue. A queue nobody can see is a queue nobody works, so
// the count is on the board; this is what it looks like at zero.
setHeading("Captures waiting for a decision", "Nothing waiting");
const empty = drawnPanel("Nothing is waiting");
empty.style.textAlign = "center";
empty.style.padding = "40px 28px";
const body = document.createElement("div");
body.style.cssText =
  "font-size:14px;color:rgba(0,0,0,0.7);line-height:1.9;max-width:52ch;margin:0 auto";
body.innerHTML =
  "Every capture so far matched cleanly or was clearly somebody new.<br>" +
  "Captures land here only when the duplicate check cannot decide safely on its own.";
empty.append(body);
empty.append(
  note(
    "Nothing expires and nothing is auto-resolved. A forgotten queue is visible on the board as a count rather than silently draining itself.",
  ),
);
const anchor = cardTemplate();
(anchor?.parentElement ?? document.body).append(empty);
