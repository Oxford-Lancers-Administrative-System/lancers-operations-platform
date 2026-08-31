// W5-01 — The sheet, and the way in. The control exists; what it does not say is
// that using it creates a recruit and sends that person a message.
const entry = $$("a, button").find((b) => /add walk-up/i.test(b.textContent));
if (entry) {
  entry.textContent = "ADD A WALK-ON";
  const hint = document.createElement("div");
  hint.textContent = "Adds them to recruitment and sends the club's welcome";
  hint.style.cssText = "font-size:12px;color:rgba(0,0,0,0.55);margin-top:6px";
  entry.parentElement?.insertBefore(hint, entry.nextSibling);
}
