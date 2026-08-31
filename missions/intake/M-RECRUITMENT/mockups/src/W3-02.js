// W3-02 — What the recruit actually receives. Drawn: these are WhatsApp
// messages, and no such conversation is captured anywhere on main — the
// webhook parses only statuses[].
const card = drawnSurface({
  title: "What Rosalind receives",
  subtitle: "The sign-on ladder, in order, from the moment she is captured at the stand",
  chrome: "WhatsApp · Oxford Lancers",
  width: 620,
});
card.append(
  bubbles([
    [
      "Welcome to the Oxford Lancers! Great to meet you at the Freshers' Fair. Here is our community group — come and say hello: chat.whatsapp.com/…",
      "1 · Welcome + group invite · on capture",
    ],
    [
      "Quick one: are you interested in coming along to a session? Just reply yes or no — no commitment either way.",
      "2 · The standard ask · once she accepts",
    ],
    [
      "No rush at all — just checking you saw this. Reply whenever suits.",
      "3 · One polite reminder · the next day, only if nothing came back",
    ],
    [
      "Thanks Rosalind! When you have a minute, this tells us what to put on for you: oxfordlancers.example/a/9f3c…",
      "4 · The W4 form · a day after the welcome",
    ],
  ]),
  note(
    "Four messages, then silence until a person chooses to say something from W9. Never a reminder ladder, never an escalation, never a collection cadence — and never a message telling her she is required to be anywhere. That is the never-harsh rule in the only place it is actually visible.",
  ),
);
