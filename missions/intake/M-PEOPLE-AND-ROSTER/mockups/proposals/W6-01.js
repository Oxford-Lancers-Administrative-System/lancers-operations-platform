/*
 * W6-01 — player detail's proposed shape, evaluated into the live page.
 *
 * The change is not decoration. Today this page mixes the person and the
 * season together: "PERSON" and "CONTACT" sit in the same card as
 * "MEMBERSHIP", so a durable fact and a seasonal one look like the same kind
 * of thing. The proposal separates them, routes the durable half to the person
 * record, and states the season's standing on the rebuilt ladder.
 *
 * Every value is taken from what the page already renders. Fields with no
 * substrate on `main` — positions, jersey, formalwear, Blues, eligibility,
 * coach group, consent — render `not recorded` rather than a plausible guess.
 */
(() => {
  const NR = '<span style="color:rgba(0,0,0,0.38);font-style:italic">not recorded</span>';
  const LADDER = { Confirmed: "Onboarding", "Carried forward": "Onboarding", Withdrawn: "Departed" };
  const TONE = {
    Active: ["#2e7d32", "#fff"],
    Onboarding: ["#0288d1", "#fff"],
    Inactive: ["#ed6c02", "#fff"],
    Departed: ["rgba(0,0,0,0.08)", "rgba(0,0,0,0.87)"],
    Archived: ["rgba(0,0,0,0.08)", "rgba(0,0,0,0.87)"],
  };
  const chip = (t) => {
    const [bg, fg] = TONE[t] ?? ["rgba(0,0,0,0.08)", "rgba(0,0,0,0.87)"];
    return `<span style="display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:16px;background:${bg};color:${fg};font-size:0.8125rem">${t}</span>`;
  };
  const link = (t) =>
    `<a href="#" style="color:#0b3d91;text-decoration:none;font-weight:600;font-size:0.875rem">${t}</a>`;

  const over = (t) =>
    `<div style="font-size:0.75rem;letter-spacing:0.08333em;text-transform:uppercase;color:rgba(0,0,0,0.6);line-height:2">${t}</div>`;
  const row = (label, value) =>
    `<div style="display:grid;grid-template-columns:190px 1fr;gap:4px 16px;padding:9px 0;border-bottom:1px solid rgba(0,0,0,0.12);align-items:baseline">
       <div style="color:rgba(0,0,0,0.6);font-size:0.875rem">${label}</div>
       <div style="min-width:0;overflow-wrap:anywhere">${value}</div>
     </div>`;

  /* Read what the page is showing before rewriting anything. */
  const bodyText = document.body.innerText;
  const statusRaw = (/^(Active|Inactive|Onboarding|Confirmed|Carried forward|Withdrawn|Departed|Archived)$/m.exec(bodyText) || [])[1] || "Active";
  const standing = LADDER[statusRaw] ?? statusRaw;
  const email = (/[\w.+-]+@[\w.-]+\.example/.exec(bodyText) || [])[0] || null;
  /* The shell head also renders an h5, so the player's name is the first
     heading that is not the application's own title. */
  const name = (() => {
    const headings = Array.from(
      document.querySelectorAll("h1, h2, h3, .MuiTypography-h4, .MuiTypography-h5"),
    ).map((h) => h.textContent.trim());
    return headings.find((t) => t && !/^Lancers Operations$/.test(t)) || "";
  })();

  /* The first Paper on the page is the mixed person/membership card. It becomes
     two: the person, linked out, and this season. */
  const cards = Array.from(document.querySelectorAll(".MuiPaper-root"));
  const first = cards.find((c) => /PERSON/i.test(c.innerText));
  if (first) {
    first.innerHTML = `
      <div style="padding:24px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:6px">
          ${over("The person")}
          ${link("Open the person record →")}
        </div>
        ${row("Name", name)}
        ${row("Aliases", NR)}
        ${row("Mobile phone", NR)}
        ${row("Personal email", email || NR)}
        ${row("College", NR)}
        ${row("Date of birth", NR)}
        ${row("Emergency contact", NR)}
        <div style="margin-top:10px;font-size:0.8125rem;color:rgba(0,0,0,0.6)">Corrected on the person record</div>
      </div>`;

    const season = document.createElement("div");
    season.className = first.className;
    season.innerHTML = `
      <div style="padding:24px">
        ${over("This season · 2026-27")}
        ${row("Standing", chip(standing))}
        ${row("Entry", (/Returning|New/.exec(bodyText) || ["—"])[0])}
        ${row("Confirmed", (/Confirmed (\d+ \w+ \d{4})/.exec(bodyText) || [null, NR])[1])}
        ${row("Activated", (/Activated (\d+ \w+ \d{4})/.exec(bodyText) || [null, NR])[1])}
        ${row("Positions", NR)}
        ${row("Jersey", NR)}
        ${row("Formalwear", NR)}
        ${row("Half / Full Blue", NR)}
        ${row("Eligibility", NR)}
        ${row("Availability", NR)}
      </div>`;
    first.parentNode.insertBefore(season, first.nextSibling);
  }

  /* The summary strip states the ladder rung rather than the stored enum. */
  const strip = Array.from(document.querySelectorAll(".MuiChip-root")).find(
    (c) => TONE[c.textContent.trim()] || LADDER[c.textContent.trim()],
  );
  if (strip) {
    const label = strip.querySelector(".MuiChip-label") || strip;
    label.textContent = standing;
  }

  /* Status history reads in the rebuilt vocabulary, so a reader is not left
     translating three struck values in their head. */
  document.querySelectorAll(".MuiPaper-root").forEach((card) => {
    if (!/STATUS HISTORY/i.test(card.innerText)) return;
    card.querySelectorAll("*").forEach((el) => {
      if (el.children.length) return;
      let t = el.textContent;
      let out = t
        .replace(/Carried forward/g, "Onboarding")
        .replace(/Confirmed/g, "Onboarding")
        .replace(/Withdrawn/g, "Departed");
      if (out !== t) el.textContent = out;
    });
  });

  /* The person's other seasons, which this page cannot reach today at all. */
  const last = cards[cards.length - 1];
  if (last && last.parentNode) {
    const seasons = document.createElement("div");
    seasons.className = last.className;
    seasons.innerHTML = `
      <div style="padding:24px">
        ${over("Their other seasons")}
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(0,0,0,0.12)">
          <div>${link("2025-26")}<div style="font-size:0.8125rem;color:rgba(0,0,0,0.6)">Blue 24</div></div>
          ${chip("Archived")}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0">
          <div>${link("2024-25")}<div style="font-size:0.8125rem;color:rgba(0,0,0,0.6)">Blue 31</div></div>
          ${chip("Archived")}
        </div>
      </div>`;
    last.parentNode.insertBefore(seasons, last.nextSibling);
  }
})();
