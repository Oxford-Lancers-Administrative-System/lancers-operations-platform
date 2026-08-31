// W7-02 — "Have you signed up with us before?"
//
// Brian, 2026-08-31, replacing the parked review queue with something far
// simpler:
//
//   "If somebody puts in their name, first name, last name, and phone number,
//    there should just be a quick check to say, 'Hey, have you already
//    registered before?' and see if their name or information is there. If they
//    say yes, it says, 'Great,' and then pops them to the WhatsApp board. If
//    it's no, it creates it as a new thing. If there's a duplicate, then we can
//    go through the deduplication process in the people table."
//
// The person standing at the stand is the one who knows. Asking them is cheaper
// than any queue, needs no operator, and both answers end in the same place.
//
// PRIVACY — the one thing this screen must not do. A stranger can type any name.
// If the page then showed that person's number and email back, the QR code would
// be a lookup tool for the club's contact details. So the match is confirmed
// only in the narrowest terms: a first name the visitor already typed, and the
// last three digits of a number. Nothing is revealed that the person at the
// keyboard did not already supply. This is the same reasoning as the E1
// uniform-invalid page in W4-03.
captureFormControls();

const card = drawnSurface({
  title: "Have you signed up with us before?",
  subtitle: "",
  chrome: "oxfordlancers.example/join",
  width: 560,
});

const lead = document.createElement("p");
lead.textContent =
  "We may already have you. If that is you, we will not add you twice — you will go straight to the group.";
lead.style.cssText = "margin:0 0 18px;font-size:14px;color:rgba(0,0,0,0.68);line-height:1.6";
const sub = card.querySelector("p");
if (sub) sub.replaceWith(lead);
else card.append(lead);

const found = document.createElement("div");
found.style.cssText =
  "border:1px solid rgba(0,0,0,0.16);border-radius:8px;padding:14px 16px;margin-bottom:20px;background:#fafafa";
const label = document.createElement("div");
label.style.cssText = "font-size:11.5px;font-weight:700;letter-spacing:.06em;color:rgba(0,0,0,0.5)";
label.textContent = "WE FOUND";
const who = document.createElement("div");
who.style.cssText = "margin-top:5px;font-size:15px;font-weight:700";
who.textContent = "Rosalind, mobile ending 318";
const caveat = document.createElement("div");
caveat.style.cssText = "margin-top:5px;font-size:12.5px;color:rgba(0,0,0,0.55)";
caveat.textContent = "Only what you have already typed is shown back to you.";
found.append(label, who, caveat);
card.append(found);

const choices = document.createElement("div");
choices.style.cssText = "display:flex;flex-wrap:wrap;gap:10px";
const yes = formButton("YES, THAT'S ME");
const no = formButton("NO, I'M NEW");
no.className = no.className.replace("MuiButton-contained", "MuiButton-outlined");
no.style.cssText +=
  ";background:transparent;color:#0b3d91;box-shadow:none;border:1px solid rgba(11,61,145,0.5)";
choices.append(yes, no);
card.append(choices);

card.append(
  note(
    "Yes adds nothing and takes them to the group. No creates them as a new person and takes them to the group. Nobody is held, nothing is refused, and a duplicate that slips through is resolved later in the people table's own merge — which already ships and belongs to Mission 5.",
  ),
);

await settle();
