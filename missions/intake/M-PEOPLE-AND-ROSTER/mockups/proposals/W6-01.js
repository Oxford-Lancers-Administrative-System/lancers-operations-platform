/*
 * W6-01 — player detail, rebuilt to the decisions this mission has already made
 * everywhere else. Brian, 2026-08-27: "the current way that it looks, it kind of
 * looks like it's the old thing… I want those really put in place here."
 *
 * Five of them, none invented here:
 *
 *   1. The Person / Onboarding / Season banding from the board (W5), so the two
 *      surfaces read as one product and a field's group is never a guess.
 *   2. Season facts edit in place, exactly as they do on the board: click,
 *      dropdown only where the value set is fixed, commits itself, audited, no
 *      reason asked.
 *   3. Person facts render and route to the person record. Changing one is an
 *      override and W2 owns what that costs.
 *   4. The per-item "Resolve … / SAVE" pair is gone. It is the same edit as
 *      every other cell and now looks like one.
 *   5. History reads in W8's shape — field, from, to, when, who.
 *
 * Nothing here restyles the shell, the type scale or the chips: those are the
 * application's and are left alone.
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

  const body = document.body.innerText;
  const statusRaw = (/^(Active|Inactive|Onboarding|Confirmed|Carried forward|Withdrawn|Departed|Archived)$/m.exec(body) || [])[1] || "Active";
  const standing = LADDER[statusRaw] ?? statusRaw;
  const entry = (/Returning|New/.exec(body) || ["—"])[0];
  const email = (/[\w.+-]+@[\w.-]+\.example/.exec(body) || [])[0] || null;
  const name = (() => {
    const hs = Array.from(document.querySelectorAll("h1,h2,h3,.MuiTypography-h4,.MuiTypography-h5"))
      .map((h) => h.textContent.trim());
    return hs.find((t) => t && !/^Lancers Operations$/.test(t)) || "";
  })();
  const departed = standing === "Departed" || standing === "Archived";

  const GROUPS = {
    person: { label: "Person", band: "#455a64", tint: "rgba(69,90,100,0.05)" },
    onboarding: { label: "Onboarding", band: "#a8560a", tint: "rgba(237,108,2,0.05)" },
    season: { label: "Season · 2026-27", band: "#0b3d91", tint: "rgba(11,61,145,0.05)" },
  };

  /* A season value: click to change it where it sits. */
  const editable = (v) =>
    `<span style="display:inline-block;min-width:40px;border-bottom:1px dashed rgba(0,0,0,0.3);padding-bottom:1px">${v}</span>`;

  const row = (label, value, note) => `
    <div style="display:grid;grid-template-columns:210px 1fr;gap:4px 16px;padding:9px 0;border-bottom:1px solid rgba(0,0,0,0.12);align-items:baseline">
      <div style="color:rgba(0,0,0,0.6);font-size:0.875rem">${label}</div>
      <div style="min-width:0;overflow-wrap:anywhere">${value}${
        note ? `<div style="font-size:0.75rem;color:rgba(0,0,0,0.6);margin-top:2px">${note}</div>` : ""
      }</div>
    </div>`;

  const panel = (group, rows, action) => `
    <div class="MuiPaper-root" style="border:1px solid rgba(0,0,0,0.12);border-radius:10px;overflow:hidden;margin-bottom:20px;background:#fff">
      <div style="background:${group.band};color:#fff;padding:7px 20px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <span>${group.label}</span>${action ?? ""}
      </div>
      <div style="background:${group.tint};padding:6px 20px 16px">${rows}</div>
    </div>`;

  const personRows =
    row("Name", name) +
    row("Aliases", NR) +
    row("Mobile phone", NR) +
    row("Personal email", email || NR) +
    row("College", NR) +
    row("Matriculation year", NR) +
    row("Expected graduation", NR) +
    row("Degree field", NR) +
    row("Date of birth", NR) +
    row("Emergency contact", NR);

  /* The shipped items, read off the page rather than invented, rendered as the
     same click-to-edit value every other season field is. */
  const items = Array.from(document.querySelectorAll(".MuiPaper-root"))
    .filter((c) => /ONBOARDING ITEMS/i.test(c.innerText))
    .flatMap((c) =>
      Array.from(c.querySelectorAll("*"))
        .filter((el) => el.children.length === 0 && /^(Subscription invoiced|Subscription paid|Kit sorted|BUCS Play registration|Hudl access|Squad photo|Comms groups joined)$/.test(el.textContent.trim()))
        .map((el) => el.textContent.trim()),
    );
  const STATE = {
    "Subscription invoiced": "Complete",
    "Subscription paid": "Complete",
    "Kit sorted": "Complete",
    "BUCS Play registration": "Invited",
    "Hudl access": "Invited",
    "Squad photo": "Invited",
    "Comms groups joined": "Complete",
  };
  const onboardingRows =
    (items.length ? items : Object.keys(STATE))
      .map((i) => row(i, editable(STATE[i] ?? "Invited")))
      .join("") || row("Items", NR);

  const seasonRows =
    row("Standing", editable(chip(standing)), departed ? "This season is over. Nothing here changes it." : null) +
    row("Entry", editable(entry)) +
    row("Confirmed", editable((/Confirmed (\d+ \w+ \d{4})/.exec(body) || [null, "—"])[1])) +
    row("Activated", editable((/Activated (\d+ \w+ \d{4})/.exec(body) || [null, "—"])[1])) +
    row("Positions", editable(NR)) +
    row("Jersey — Blue", editable(NR)) +
    row("Jersey — White", editable(NR)) +
    row("Coach group", editable(NR)) +
    row("Formalwear", editable(NR)) +
    row("Half / Full Blue", editable(NR)) +
    row("Eligibility", editable(NR)) +
    row("Availability", editable(NR));

  const historyRows = Array.from(document.querySelectorAll(".MuiPaper-root"))
    .filter((c) => /STATUS HISTORY/i.test(c.innerText))
    .map((c) => c.innerText)
    .join("\n")
    .split("\n")
    .filter((l) => /→|Created as/.test(l))
    .slice(0, 4)
    .map((l) => {
      const clean = l
        .replace(/Carried forward/g, "Onboarding")
        .replace(/Confirmed/g, "Onboarding")
        .replace(/Withdrawn/g, "Departed");
      return `<div style="padding:9px 0;border-bottom:1px solid rgba(0,0,0,0.12)">
          <div style="font-size:0.875rem"><strong>Standing</strong></div>
          <div style="font-size:0.875rem">${clean}</div>
        </div>`;
    })
    .join("");

  const seasonsRows =
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(0,0,0,0.12)">
       <div>${link("2025-26")}<div style="font-size:0.8125rem;color:rgba(0,0,0,0.6)">Blue 24</div></div>${chip("Archived")}
     </div>
     <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0">
       <div>${link("2024-25")}<div style="font-size:0.8125rem;color:rgba(0,0,0,0.6)">Blue 31</div></div>${chip("Archived")}
     </div>`;

  /* Replace the content column, leaving the shell, the head and Back to roster
     exactly as the application renders them. */
  const main = document.querySelector("main");
  if (!main) return;
  const papers = Array.from(main.querySelectorAll(".MuiPaper-root"));
  const first = papers[0];
  if (!first) return;
  /* Mark where the first card sat, so the panels land exactly there rather than
     at the top of the column — the page head and the summary strip are the
     application's and stay above them. */
  const marker = document.createComment("panels");
  first.parentNode.insertBefore(marker, first);
  papers.forEach((p) => p.remove());

  const holder = document.createElement("div");
  holder.innerHTML =
    panel(GROUPS.person, personRows, link("Open the person record →")) +
    panel(GROUPS.onboarding, onboardingRows) +
    panel(GROUPS.season, seasonRows) +
    panel({ label: "Their other seasons", band: "#455a64", tint: "transparent" }, seasonsRows) +
    panel(
      { label: "What changed", band: "#455a64", tint: "transparent" },
      historyRows || row("Nothing yet", NR),
      link("Everything that changed about this person →"),
    );
  marker.parentNode.insertBefore(holder, marker);
  marker.remove();
})();
