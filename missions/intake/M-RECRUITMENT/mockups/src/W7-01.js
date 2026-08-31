// W7-01 — Sign yourself in. Drawn: there is no public self-entry page on main.
const card = drawnSurface({
  title: "Join the Oxford Lancers",
  subtitle: "Leave your name and number and we will be in touch about the next session.",
  chrome: "oxfordlancers.example/join",
});
card.append(
  field("First name", "", { required: true }),
  field("Last name", "", { required: true }),
  field("Mobile", "", {
    required: true,
    help: "So we can send you the group invite and let you know about sessions.",
  }),
  field("Email", "Optional"),
  primaryButton("COUNT ME IN"),
  note(
    "The QR points at the club's own page on the club's own domain — Brian, 2026-08-28. Submitting lands them in the community group, which is the whole of his 2026-08-31 flow: scan, form, submit, group invite.",
  ),
);
const already = drawnPanel("If we already have them");
already.style.marginTop = "18px";
already.append(
  makeRow("What they see", "“You are already on our list, Rosalind — we will be in touch.”"),
  makeRow("What is created", "Nothing"),
  makeRow("What is sent", "Nothing"),
  note(
    "Brian, 2026-08-31: they should see if they are already in the list. The page confirms only what the submitter themselves typed — a public page that volunteers who else the club holds would be a membership oracle.",
  ),
);
document.querySelector("div").append(already);
