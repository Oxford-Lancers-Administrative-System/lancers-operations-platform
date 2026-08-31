// W8-02 — Nothing waiting.
setHeading("Captures waiting for a decision", "Nothing waiting");
const empty = drawnPanel(null);
empty.style.cssText += ";text-align:center;padding:44px 28px";
const t = document.createElement("div");
t.textContent = "Nothing is waiting";
t.style.cssText = "font-size:17px;font-weight:700;margin-bottom:8px";
const b = document.createElement("div");
b.style.cssText =
  "font-size:14px;color:rgba(0,0,0,0.65);line-height:1.9;max-width:52ch;margin:0 auto";
b.innerHTML =
  "Every capture so far matched cleanly, or was clearly somebody new.<br>" +
  "Captures land here only when the duplicate check cannot decide safely on its own.<br>" +
  "Nothing expires, and nothing resolves itself.";
empty.append(t, b);
const anchor = cardTemplate();
(anchor?.parentElement ?? document.body).append(empty);
