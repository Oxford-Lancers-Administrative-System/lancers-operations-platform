/* W3-01 — generated from the shared prelude and this screen's body; see the notes inside. */
(async () => {
  /*
   * M-GRANULAR-ROLES-AND-PERMISSIONS — shared proposal prelude.
   *
   * Evaluated into the live page after the current-side photograph. Every
   * element it adds either clones the page's own MUI node (so the emotion class,
   * and with it the theme and the breakpoint behaviour, comes with it) or is
   * styled inline from `src/theme-tokens.ts`. Nothing here is a redesign.
   *
   * The grant model is LAN-424's recorded decisions (Brian, 2026-09-25):
   * twelve roster categories, three per-seat switches, seven event categories;
   * President, General Manager and IT Officer fixed full; Vice-President and
   * Secretary start full; every other seat starts from today's capability map.
   */
  const T = {
    navy: "#002147",
    navyDark: "#001633",
    charcoal: "#211D1C",
    charcoal70: "#5A5754",
    charcoal50: "#8C8987",
    ground: "#F6F5F2",
    divider: "rgba(33, 29, 28, 0.12)",
    outline: "rgba(0, 0, 0, 0.23)",
    successMain: "#1E6F3C",
    successLight: "#E3F1E7",
    neutralLight: "#ECEAE6",
  };

  const ROSTER = [
    "Person",
    "Onboarding",
    "Membership",
    "Availability",
    "Coaching assignments",
    "Offensive assignments",
    "Defensive assignments",
    "Special teams assignments",
    "Warmup assignments",
    "Kit",
    "Contact & emergency",
    "Recruits",
  ];
  const SWITCHES = ["Open roster records", "Open recruit records", "Add to the roster"];
  const EVENTS = [
    "Practice",
    "Strength and conditioning",
    "Chalk",
    "Game",
    "Social",
    "Recruitment",
    "Meeting",
  ];
  const CATEGORY_COLOUR = {
    Practice: ["Blue", "#1565c0", "#e8f1fb"],
    "Strength and conditioning": ["Teal", "#00796b", "#e2f1ef"],
    Chalk: ["Purple", "#4527a0", "#ece7f7"],
    Game: ["Red", "#c62828", "#fbe9e9"],
    Social: ["Orange", "#ef6c00", "#fdf0e2"],
    Recruitment: ["Green", "#2e7d32", "#e8f3e9"],
    Meeting: ["Slate", "#455a64", "#eceff1"],
  };

  /* Seat profiles. `floor` is fixed (Central rule, LAN-423); `full` starts full and is removable. */
  function seed(profile) {
    const all = (v) => Object.fromEntries(ROSTER.map((c) => [c, v]));
    const ev = (v) => Object.fromEntries(EVENTS.map((c) => [c, v]));
    const sw = (on) => Object.fromEntries(SWITCHES.map((s) => [s, on]));
    if (profile === "floor" || profile === "full")
      return { roster: all("Edit"), switches: sw(true), events: ev("Manage") };
    if (profile === "treasurer")
      return {
        roster: { ...all("None"), Membership: "Edit" },
        switches: { ...sw(false), "Add to the roster": true },
        events: ev("View"),
      };
    if (profile === "kit")
      return {
        roster: { ...all("None"), Person: "View", Kit: "Edit" },
        switches: { ...sw(false), "Open roster records": true },
        events: ev("View"),
      };
    return { roster: all("None"), switches: sw(false), events: ev("View") };
  }

  const COACHES = [
    ["Head Coach", "Zenas Yaxlington"],
    ["Offensive Coordinator", "Alwyn Cholmondley"],
    ["Defensive Coordinator", "Ulric Winterbourne-Quy"],
    ["Quarterbacks Coach", "Not assigned"],
    ["Offensive Line Coach", "Not assigned"],
    ["Wide Receivers Coach", "Not assigned"],
    ["Defensive Line Coach", "Not assigned"],
    ["Linebackers Coach", "Not assigned"],
    ["Defensive Backs Coach", "Not assigned"],
    ["Special Teams Coach", "Not assigned"],
  ];
  const GROUPS = [
    {
      label: "Operational Administration",
      seats: [
        ["General Manager", "Jarrah", "floor"],
        ["IT Officer", "Caspian Hallowfield", "floor"],
      ],
    },
    {
      label: "Club Committee",
      seats: [
        ["President", "Bertram", "floor"],
        ["Vice-President", "Kestrel Hawksmoor", "full"],
        ["Secretary", "Caspian Hallowfield", "full"],
        ["Treasurer", "Lysander Caldicott", "treasurer"],
        ["Social Secretary", "Norbert, Marlowe Fairhurst", "ordinary"],
        ["Gameday Secretary", "Osgood Lanthorne, Gideon Thornbury", "ordinary"],
        ["Kit Manager", "Peregrine Oakhanger", "ordinary"],
        ["Media Secretary", "Caspian Hallowfield", "ordinary"],
      ],
    },
    { label: "Coaching Staff", seats: COACHES.map(([s, h]) => [s, h, "coach"]) },
  ];

  /* One line a seat's grants read as, wherever a summary is needed. */
  function summarise(g) {
    const values = ROSTER.map((c) => g.roster[c]);
    let roster;
    if (values.every((v) => v === "Edit")) roster = "Roster: edit all";
    else if (values.every((v) => v === "None")) roster = "Roster: none";
    else {
      const e = ROSTER.filter((c) => g.roster[c] === "Edit");
      const v = ROSTER.filter((c) => g.roster[c] === "View");
      roster =
        "Roster: " +
        [e.length ? `edit ${e.join(", ")}` : null, v.length ? `view ${v.join(", ")}` : null]
          .filter(Boolean)
          .join("; ");
    }
    const on = SWITCHES.filter((s) => g.switches[s]);
    const sw =
      on.length === SWITCHES.length ? "all three switches" : on.length ? on.join(", ") : null;
    const ev = EVENTS.map((c) => g.events[c]);
    let events;
    if (ev.every((v) => v === "Manage")) events = "Events: manage all";
    else if (ev.every((v) => v === "View")) events = "Events: view all";
    else if (ev.every((v) => v === "None")) events = "Events: none";
    else {
      const m = EVENTS.filter((c) => g.events[c] === "Manage");
      const v = EVENTS.filter((c) => g.events[c] === "View");
      events =
        "Events: " +
        [m.length ? `manage ${m.join(", ")}` : null, v.length ? `view ${v.join(", ")}` : null]
          .filter(Boolean)
          .join("; ");
    }
    return [roster, sw, events].filter(Boolean).join(" · ");
  }

  /* ------------------------------------------------------------ helpers */

  const el = (tag, css, html) => {
    const node = document.createElement(tag);
    if (css) node.style.cssText = css;
    if (html !== undefined) node.innerHTML = html;
    return node;
  };

  /* The `Central rule` chip, as docs/ux/mockup-standards.md names it. An outlined small MUI Chip. */
  const centralRule = (text = "Central rule · LAN-423") =>
    `<span style="display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 8px;border-radius:16px;border:1px solid ${T.outline};font-size:12px;font-weight:600;color:${T.charcoal70};white-space:nowrap;vertical-align:middle">` +
    `<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" style="fill:${T.charcoal70}"><path d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zm-6 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm3.1-9H8.9V6a3.1 3.1 0 0 1 6.2 0v2z"/></svg>${text}</span>`;

  const swatch = (name, size = 14) => {
    const [, accent, tint] = CATEGORY_COLOUR[name];
    return `<span aria-hidden="true" style="display:inline-block;width:${size}px;height:${size}px;border-radius:4px;background:${tint};border:2px solid ${accent};flex-shrink:0;vertical-align:middle"></span>`;
  };

  /* The two-button view switch, the same idiom as Events' List | Calendar. */
  function viewSwitch(active) {
    const btn = (label, on) =>
      `<a style="display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:6px 16px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;${
        on
          ? `background:${T.navy};color:#fff;border:1px solid ${T.navy}`
          : `background:#fff;color:${T.navy};border:1px solid rgba(0,33,71,0.5)`
      }">${label}</a>`;
    return el(
      "div",
      "display:flex;gap:12px;flex-wrap:wrap",
      btn("Holders", active === "Holders") + btn("Access", active === "Access"),
    );
  }

  /* Sidebar as another seat would see it: only the destinations that seat reaches, and their name. */
  function signedInAs(name, keepHrefs) {
    const nav = document.querySelector('nav[aria-label="Operator"]');
    if (nav) {
      nav.querySelectorAll("a[href]").forEach((a) => {
        if (!keepHrefs.includes(a.getAttribute("href"))) a.style.display = "none";
      });
      const anyAdmin = keepHrefs.some(
        (h) => h.startsWith("/operate/admin") || h.startsWith("/operate/people"),
      );
      if (!anyAdmin) {
        nav
          .querySelectorAll("hr, li.MuiTypography-overline")
          .forEach((n) => (n.style.display = "none"));
      }
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const hits = [];
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (n.nodeValue.trim() === "Caspian Hallowfield" && !n.parentElement.closest("main"))
        hits.push(n);
    }
    hits.forEach((n) => (n.nodeValue = name));
  }

  /* A ToggleButtonGroup, exclusive, small — the recorder idiom in src/app/participation/record-answer.tsx. */
  function toggleGroup(options, selected, { disabled = false } = {}) {
    /* Below `sm` the group takes the row's full width under its label, three equal thirds. */
    const phone = window.innerWidth < 600;
    return (
      `<span role="group" style="display:inline-flex;border:1px solid ${T.divider};border-radius:8px;overflow:hidden;flex-shrink:0;${
        phone ? "width:100%;" : ""
      }${disabled ? "opacity:0.62" : ""}">` +
      options
        .map((o, i) => {
          const on = o === selected;
          return `<span style="display:inline-flex;align-items:center;justify-content:center;${
            phone ? "flex:1;min-height:44px;" : "min-width:64px;min-height:36px;"
          }padding:0 12px;font-size:13px;font-weight:600;${
            i ? `border-left:1px solid ${T.divider};` : ""
          }${on ? `background:rgba(0,33,71,0.10);color:${T.navy};` : `color:${disabled ? T.charcoal50 : T.charcoal70};`}">${o}</span>`;
        })
        .join("") +
      "</span>"
    );
  }

  /* An MUI Switch, drawn at its own geometry. */
  function muiSwitch(on, disabled = false) {
    return `<span style="position:relative;display:inline-block;width:34px;height:14px;border-radius:7px;margin:0 8px;flex-shrink:0;background:${
      on ? "rgba(0,33,71,0.5)" : "rgba(0,0,0,0.38)"
    };${disabled ? "opacity:0.55" : ""}"><span style="position:absolute;top:-3px;left:${on ? 15 : -1}px;width:20px;height:20px;border-radius:50%;background:${
      on ? T.navy : "#fafafa"
    };box-shadow:0 2px 1px -1px rgba(0,0,0,.2),0 1px 1px 0 rgba(0,0,0,.14),0 1px 3px 0 rgba(0,0,0,.12)"></span></span>`;
  }

  /* A Notice (MUI Alert, standard) in the theme's success tint. */
  function successNotice(text) {
    return el(
      "div",
      `display:flex;gap:12px;align-items:flex-start;padding:8px 16px;border-radius:8px;background:${T.successLight};color:${T.charcoal};font-size:14px;line-height:1.43`,
      `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" style="fill:${T.successMain};flex-shrink:0;margin-top:7px"><path d="M20 12a8 8 0 1 1-8-8 8 8 0 0 1 8 8zm-9.3 3.7 6-6-1.4-1.4-4.6 4.6-2.3-2.3-1.4 1.4z"/></svg><div style="padding:8px 0">${text}</div>`,
    );
  }

  /*
   * W3-01 — the roster board as the Kit Manager would see it after W1-03:
   * Edit on Kit, View on Person, None on the other ten, Open roster records on,
   * Add to the roster off.
   *
   * Photographed signed in as the review account (every grant) and narrowed by
   * this script, because there is no Kit Manager login locally. The sidebar and
   * name are changed to match the seat, and the review note says so.
   *
   * Kit arrives folded for this account (LAN-387). The script opens it, copies
   * the board, and folds it again before drawing, so the account's stored
   * preference is written back exactly as it was.
   */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  signedInAs("Peregrine Oakhanger", ["/operate/roster", "/operate/events"]);

  const add = document.querySelector('[data-testid="add-players"]');
  if (add) add.style.display = "none";

  /* Status is Membership, Availability is Availability, Missing onboarding data is Onboarding: none granted. */
  document.querySelectorAll("main .MuiFormControl-root").forEach((fc) => {
    const label = fc.querySelector("label");
    if (
      label &&
      ["Status", "Availability", "Missing onboarding data"].includes(label.textContent.trim())
    )
      fc.style.display = "none";
  });

  const board =
    document.querySelector('[data-testid="roster-board"] table') ??
    document.querySelector("main table");
  const wide = window.innerWidth >= 900;
  let shown = 0;
  if (board && wide) {
    const kit = document.querySelector('[data-testid="band-toggle-kit"]');
    const wasFolded = kit && kit.getAttribute("aria-expanded") === "false";
    if (wasFolded) {
      kit.click();
      await sleep(600);
    }
    const live =
      document.querySelector('[data-testid="roster-board"] table') ??
      document.querySelector("main table");
    const copy = live.cloneNode(true);
    if (wasFolded) {
      document.querySelector('[data-testid="band-toggle-kit"]').click();
      await sleep(600);
    }
    const target =
      document.querySelector('[data-testid="roster-board"] table') ??
      document.querySelector("main table");
    target.style.display = "none";
    target.after(copy);

    const bandRow = copy.tHead.rows[0];
    const keep = new Set([0]);
    let index = 1;
    Array.from(bandRow.cells)
      .slice(1)
      .forEach((th) => {
        const span = Number(th.getAttribute("colspan") || 1);
        const id = (th.querySelector("[data-testid^=band-toggle-]") || {}).dataset?.testid ?? "";
        const band = id.replace("band-toggle-", "");
        const granted = band === "person" || band === "kit";
        if (!granted) th.style.display = "none";
        for (let i = 0; i < span; i += 1) {
          if (granted) keep.add(index);
          index += 1;
        }
        if (band === "person") th.dataset.viewOnly = "true";
      });
    const personCount = Number(
      Array.from(bandRow.cells)
        .find((c) => c.querySelector('[data-testid="band-toggle-person"]'))
        ?.getAttribute("colspan") || 0,
    );
    const isPerson = (i) => i >= 1 && i <= personCount;
    [copy.tHead.rows[1], ...Array.from(copy.tBodies[0].rows)].forEach((row) => {
      Array.from(row.cells).forEach((cell, i) => {
        if (!keep.has(i)) {
          cell.style.display = "none";
          return;
        }
        if (isPerson(i)) {
          /* View: the value, not a way into editing it. */
          cell.querySelectorAll(".MuiTypography-caption").forEach((c) => {
            if (/edit on the record/.test(c.textContent)) c.textContent = "view";
          });
          cell.querySelectorAll("a[aria-label]").forEach((a) => {
            const span = document.createElement("span");
            span.textContent = a.textContent;
            span.style.cssText = "font-size:13px;color:" + T.charcoal;
            a.replaceWith(span);
          });
        }
      });
    });
    shown = keep.size - 1;

    /* Scroll the board so both granted groups are in the frame: the end of Person and all of Kit. */
    await sleep(50);
    const kitBand = copy.querySelector('[data-testid="band-toggle-kit"]');
    let scroller = copy.parentElement;
    while (
      scroller &&
      scroller !== document.body &&
      getComputedStyle(scroller).overflowX === "visible"
    )
      scroller = scroller.parentElement;
    if (kitBand && scroller) {
      const th = kitBand.closest("th");
      scroller.scrollLeft = 0;
      const offset = th.getBoundingClientRect().left - scroller.getBoundingClientRect().left;
      scroller.scrollLeft = Math.max(0, offset - 480);
    }
  }

  /* The phone's Filters collapse held only the three pinned filters this seat is not granted, so it goes too. */
  document.querySelectorAll("main button").forEach((b) => {
    if (b.textContent.trim() === "Filters") b.style.display = "none";
  });

  /* Phone cards: the status chip is Membership, the missing flag Onboarding, the call button Contact & emergency. */
  document.querySelectorAll('[data-testid="roster-card"]').forEach((card) => {
    card
      .querySelectorAll('[data-domain="membership"], [data-testid="card-missing-flag"]')
      .forEach((n) => n.remove());
    const call = card.querySelector('a[aria-label="Call"]');
    if (call) call.parentElement.style.display = "none";
  });

  const label = document.querySelector('[data-testid="season-label"]');
  /* 6 Person columns and 12 Kit columns, counted on the desktop board above; the phone reads the same line. */
  if (label) label.textContent = label.textContent.replace(/\d+ columns/, `${shown || 18} columns`);
})();
