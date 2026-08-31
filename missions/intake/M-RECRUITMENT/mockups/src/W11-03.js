// W11-03 — What the recruit gets: the invitation.
//
// Brian, 2026-08-31: "I need to see workflows related to what they see, what
// their event is, what their invitation looks like after they go through
// WhatsApp, click yes or no, and what they see. That's really important."
//
// This is the first of the three, and it is the only one that is not a page of
// this product at all: it is a WhatsApp template arriving on a phone. Every
// business-initiated message is a Meta-approved template, so this is
// `event_invitation` — the one template that IS already approved — carrying a
// signed link to the RSVP page.
captureFormControls();

const card = drawnSurface({
  title: "",
  subtitle: "",
  chrome: "WhatsApp · Oxford Lancers",
  width: 460,
});
card.style.background = "#e5ddd5";
card.style.padding = "18px";

const bubble = bubbles([
  [
    "Oxford Lancers: Taster 2 is on Sunday 10 May, 2pm, Iffley Road Astro. Let us know if you can make it: oxfordlancers.example/r/7c41",
    "Delivered · 8 May, 09:00",
  ],
]);
card.append(bubble);

card.append(
  note(
    "One invitation. A recruit who does not answer gets at most one more of these and then nothing, ever — no escalation, and nothing reaches the President. That is the recruit ladder, and it is the whole of it.",
  ),
);

await settle();
