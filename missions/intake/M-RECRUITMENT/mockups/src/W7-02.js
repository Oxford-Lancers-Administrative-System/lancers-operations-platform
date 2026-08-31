// W7-02 — Signed in, and on to WhatsApp.
//
// The step the earlier draft was missing. Brian, 2026-08-31: "Is it that once
// they sign up, they get a link to go to our WhatsApp when they approve and they
// send this in?... It should take them to WhatsApp then. After they do the
// information, you'll get the sign-in, and then they go to WhatsApp, right?
// That's part of W7."
//
// This is also why W7 is the door with a natural opt-in and W6 is not: the
// recruit presses the button themselves, so joining the group IS the consent,
// and nothing has to be asked about how the club came by the number.
//
// The already-known case is NOT a separate dead end any more. Brian: "we should
// just take their contact information regardless." Somebody who signs in a
// second time is the common case at a second event; they see the same page and
// the same way into the group, and nothing reads as an error.
captureFormControls();

const card = drawnSurface({
  title: "You're in, Rosalind",
  subtitle: "",
  chrome: "oxfordlancers.example/join",
  width: 560,
});

const lead = document.createElement("p");
lead.textContent =
  "Last thing — join the WhatsApp group. That is where the club says when and where the next session is.";
lead.style.cssText = "margin:0 0 20px;font-size:14px;color:rgba(0,0,0,0.72);line-height:1.6";
const sub = card.querySelector("p");
if (sub) sub.replaceWith(lead);
else card.append(lead);

card.append(formButton("JOIN THE WHATSAPP GROUP"));

card.append(
  note(
    "Pressing this is the opt-in. It is the recruit's own act, which is why this door carries a natural one and the operator-add door in W6 has to ask for it. Somebody signing in a second time sees this same page: their details are taken again and reconciled later, and nothing reads as an error.",
  ),
);

await settle();
