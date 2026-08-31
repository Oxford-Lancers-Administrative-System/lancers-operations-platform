// W11-05 — What the recruit sees after answering.
//
// The third of the three Brian asked for. It is deliberately almost nothing: an
// answer is recorded, the club knows, and the recruit is not given a dashboard,
// an events list, or an account.
//
// The one question this screen settles is whether a recruit sees anything else.
// Brian: "they don't see an events page, and they don't see other things that
// they've been invited to. They just see that, or maybe they do see other
// events, but it should be yes or no."
//
// PROPOSED, and the smaller answer: they see this and nothing more. A recruit
// holds no membership, so a list of "your events" would be a list of one; and a
// page that accumulates is a page that has to be secured, kept current and
// reasoned about at the season boundary. If Brian wants the larger answer, the
// shipped `/me/[token]` player home is the surface it would be built on.
captureFormControls();

const card = drawnSurface({
  title: "You're down for Taster 2",
  subtitle: "",
  chrome: "oxfordlancers.example/r/7c41",
  width: 460,
});

const body = document.createElement("div");
body.style.cssText = "font-size:15px;line-height:1.7;color:rgba(0,0,0,0.8)";
body.innerHTML =
  "Sunday 10 May 2026, 2:00 PM<br>Iffley Road Astro<br><br>" +
  "See you there. If something changes, this link still works — open it again and change your answer.";
const sub = card.querySelector("p");
if (sub) sub.replaceWith(body);
else card.append(body);

card.append(
  note(
    "Changing the answer is the same link and the same two options. Nothing else appears here: no other events, no history, no account. A recruit holds no membership, so there is nothing for such a page to hold.",
  ),
);

await settle();
