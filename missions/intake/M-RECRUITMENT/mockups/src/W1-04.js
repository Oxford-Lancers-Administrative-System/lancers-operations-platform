// W1-04 — The QR code page.
//
// Brian, 2026-08-31: "There should still be a separate QR code page, but I think
// it should be at the top and then take me to a page and say, 'That's it.' Then
// people can either scan it on their phone, have it as their wallpaper,
// whatever, and the QR code takes them to the sign-up."
//
// Reached from QR CODE on the recruit board. One code, minted once a season,
// pointing at the club's own /join page — which is W7's door, and the only thing
// this code ever does.
//
// The shell is the application's own; only the code itself is drawn, because a
// QR code has no analogue anywhere in this product to photograph.
selectRecruitmentNav();
setHeading("Sign-up QR code");
pageSubtitle("Season 2026-27 · scan it, screenshot it, or print it");
const host = clearPageBody();

// Take the shell's contained button BEFORE removing the board's own: the first
// attempt removed ADD PLAYER and then had nothing left to clone for DOWNLOAD.
const primary = must(
  [...document.querySelectorAll("a, button")].find((b) =>
    b.className.includes("MuiButton-contained"),
  ),
  "the shell has no contained button to clone",
).cloneNode(true);

// The board's ADD control belongs to the board, not to this page.
for (const control of $$("a, button")) {
  if (/add (a )?(player|recruit)/i.test(control.textContent)) control.remove();
}

const card = proposedRegion("");
card.style.cssText += ";text-align:center;padding:32px 24px";
host.append(card);

// The code itself. Drawn — there is nothing in this product to clone.
const code = document.createElement("div");
code.textContent = "▦";
code.style.cssText = "font-size:220px;line-height:1;color:#111;letter-spacing:-8px;margin:0 0 8px";
card.append(code);

const points = document.createElement("div");
points.textContent = "oxfordlancers.example/join";
points.style.cssText =
  "font-family:ui-monospace,monospace;font-size:15px;color:rgba(0,0,0,0.75);margin-bottom:6px";
card.append(points);

const count = document.createElement("div");
count.textContent = "59 people have signed in through it this season";
count.style.cssText = "font-size:13.5px;color:rgba(0,0,0,0.6);margin-bottom:22px";
card.append(count);

const actions = document.createElement("div");
actions.style.cssText = "display:flex;gap:10px;justify-content:center;flex-wrap:wrap";
for (const [label, strong] of [
  ["DOWNLOAD", true],
  ["COPY LINK", false],
]) {
  const b = primary.cloneNode(true);
  b.textContent = label;
  b.removeAttribute("href");
  if (!strong) {
    b.className = b.className.replace("MuiButton-contained", "MuiButton-outlined");
    b.style.cssText =
      "background:transparent;color:#0b3d91;box-shadow:none;border:1px solid rgba(11,61,145,0.5)";
  }
  actions.append(b);
}
card.append(actions);

const note2 = document.createElement("p");
note2.textContent =
  "One code for the whole season. Anyone who scans it lands on the club's own sign-up page, and from there in the WhatsApp group.";
note2.style.cssText =
  "margin:22px auto 0;max-width:460px;font-size:13px;color:rgba(0,0,0,0.55);line-height:1.6";
card.append(note2);

mark(card, 1);

await settle();
