// W11-03 — What the recruit sees: the shipped RSVP page.
//
// Brian, 2026-08-31: "Holy fuck! W11-04, did you just invent this shit? This
// exists in the app today... They should be using established conventions for
// how the onboarding goes in the event board. This should not be new stuff.
// Fucking look it up."
//
// He is right, and the drawn version is deleted. `/rsvp/[token]` ships, and this
// is a PHOTOGRAPH of it. It could not be reached before because
// `rsvp_access_tokens` is empty in the seed and the route requires a
// 43-character base64url token; one was minted into the local database for this
// shoot, so what is below is the running application answering a real link.
//
// Its own words rather than invented ones: "I'm attending" and "I'm not
// attending", under "Your invitation", with "Current answer · Only you can see
// this" and "Late responses accepted until start".
//
// WHAT THIS SCREEN PROVES, and it is a conflict rather than a detail: declining
// from here demands a reason. See W11-04.
const decline = must(
  [...document.querySelectorAll("a, button")].find((b) => /not attending/i.test(b.textContent)),
  "the RSVP page has no Not attending control",
);
mark(decline, 1);

await settle();
