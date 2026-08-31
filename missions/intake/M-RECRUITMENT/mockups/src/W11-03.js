// W11-03 — The YES page, as it ships.
//
// Brian, 2026-08-31: "They do see the page. They just see the yes page or the no
// page: yes, they're registered, or no, they're registered. It needs to go to
// the page like we have in the app. There's no event page for them. They don't
// click to go see the event. It's either yes or no, which is already in the app.
// It's built in the app already."
//
// So this is a PHOTOGRAPH of the shipped saved state at `/rsvp/[token]` with an
// attending response recorded. `SAVED_HEADING` is "Your response is saved" and
// `SAVED_NOTE` says the answer can be changed until the event starts.
//
// WHAT IS DIFFERENT FOR A RECRUIT, and it is one thing: they arrive here
// directly from the WhatsApp invitation. They never pass through the event page,
// because they are not being asked to review an event — they were asked one
// question and answered it in WhatsApp.
//
// `rsvp_access_tokens` is empty in the seed and the route requires a
// 43-character base64url token, so one was minted into the local database and an
// attending response recorded, purely so the running page could be photographed.
const heading = must(
  [...document.querySelectorAll("h1, h2, .MuiTypography-root")].find((n) =>
    /your response is saved/i.test(n.textContent),
  ),
  "the saved page is not showing its heading",
);
mark(heading, 1);

await settle();
