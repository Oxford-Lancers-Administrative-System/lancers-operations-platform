// W4-02 — The link that no longer works. One page for expired, revoked and
// unknown, because telling them apart tells an attacker which tokens exist.
const card = drawnSurface({
  title: "This link is no longer valid",
  subtitle: "It may have expired, or it may have been replaced by a newer one.",
  chrome: "oxfordlancers.example/a/9f3c…",
  width: 620,
});
card.append(
  note(
    "One page for expired, revoked, and never-existed. The uniform invalid page is the E1 404-uniformity precedent: distinguishing them would let somebody probe which tokens are real. It exposes nothing about the club, the person, or whether the link was ever valid.",
  ),
);
const ops = drawnPanel("What an operator sees");
ops.style.marginTop = "18px";
ops.append(
  makeRow("On her record", "Ask sent 8 May · link expired 15 May · not answered"),
  makeRow("What they can do", "Send it again — a new link, and the old one stays dead"),
  makeRow("What they cannot do", "Revive the old link"),
);
document.querySelector("div").append(ops);
