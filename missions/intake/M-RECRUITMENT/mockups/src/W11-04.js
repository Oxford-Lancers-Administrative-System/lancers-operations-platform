// W11-04 — What the recruit sees when they tap the link: yes or no.
//
// The shipped surface is `/rsvp/[token]` and it already behaves exactly the way
// Brian describes: Attending is one tap, Not attending is a link, and NOTHING
// asks why. Its own file says there is deliberately no navigation into
// `/operate` — "a link would be an oversight", so a recruit never lands in the
// operator shell.
//
// It is drawn rather than photographed because `rsvp_access_tokens` is empty in
// the seed, so no token exists to follow. The behaviour above is running code.
//
// Brian: "They just get an invite to say that, and they click the event and say
// yes or no if they're coming. That's it... They don't need to give a reason.
// They do not give any reason."
captureFormControls();

const card = drawnSurface({
  title: "Taster 2",
  subtitle: "",
  chrome: "oxfordlancers.example/r/7c41",
  width: 460,
});

const facts = document.createElement("div");
facts.style.cssText = "margin:0 0 22px;font-size:15px;line-height:1.7;color:rgba(0,0,0,0.8)";
facts.innerHTML =
  "Sunday 10 May 2026<br>2:00 PM – 4:00 PM<br>Iffley Road Astro<br><br>" +
  "Boots if you have them. Everything else is provided.";
const sub = card.querySelector("p");
if (sub) sub.replaceWith(facts);
else card.append(facts);

const ask = document.createElement("div");
ask.textContent = "Can you make it?";
ask.style.cssText = "font-size:17px;font-weight:700;margin:0 0 14px";
card.append(ask);

const row = document.createElement("div");
row.style.cssText = "display:flex;gap:12px;align-items:center";
const yes = formButton("YES, I'LL BE THERE");
yes.style.flex = "1";
const no = document.createElement("a");
no.textContent = "No, I can't";
no.style.cssText =
  "font-size:15px;color:#0b3d91;text-decoration:underline;padding:10px 4px;white-space:nowrap";
row.append(yes, no);
card.append(row);

card.append(
  note(
    "No reason is asked for and none is recorded. Yes is one tap and No is a link, so it works with scripting off. There is no way from here into the operator shell, and no list of anything else the club has ever invited them to.",
  ),
);

await settle();
