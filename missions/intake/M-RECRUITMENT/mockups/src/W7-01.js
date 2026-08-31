// W7-01 — Sign yourself in, at the QR code.
//
// There is no public self-entry page on main, so the surface is drawn — but the
// controls are cloned from the shipped add-a-person form, which carries exactly
// these four fields, so the field height, border, label behaviour and type scale
// are the application's own.
//
// Brian, 2026-08-31: "The duplicate should be very simple. It should be based on
// email or phone number or whatever, and we should just take their contact
// information regardless." So this form refuses nobody and blocks on nothing: it
// takes what they give and reconciles later, exactly as the walk-up door does.
captureFormControls();

const card = drawnSurface({
  title: "Join the Oxford Lancers",
  subtitle: "",
  chrome: "oxfordlancers.example/join",
  width: 560,
});

const lead = document.createElement("p");
lead.textContent =
  "Leave your name and a way to reach you. We will send you a WhatsApp message about the next session.";
lead.style.cssText = "margin:0 0 20px;font-size:14px;color:rgba(0,0,0,0.65);line-height:1.6";
const sub = card.querySelector("p");
if (sub) sub.replaceWith(lead);
else card.append(lead);

for (const question of [
  { prompt: "First name", kind: "text" },
  { prompt: "Last name", kind: "text" },
  { prompt: "Mobile number", kind: "text" },
  { prompt: "Email address", kind: "text" },
]) {
  card.append(questionField(question));
}

card.append(formButton("SIGN ME UP"));
card.append(
  note(
    "One name and one way to reach them is the whole ask. Everything else the club wants comes later, on a link sent to this number — this is a stand at a Freshers' Fair, not a registration.",
  ),
);

await settle();
