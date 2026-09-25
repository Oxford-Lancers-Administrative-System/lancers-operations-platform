/* W1-04 — generated from the shared prelude and this screen's body; see the notes inside. */
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
   * The seat page's Access section — one seat at a time, which is also the
   * 375px answer to the matrix. It replaces the read-only Permissions list;
   * what the matrix does not govern stays listed under Other permissions.
   */
  function sectionTitled(title) {
    return Array.from(document.querySelectorAll("main section")).find(
      (s) => s.querySelector("h2") && s.querySelector("h2").textContent.trim() === title,
    );
  }

  function accessSection({ grants, locked = false, notice = null, changed = null }) {
    const permissions = sectionTitled("Permissions");
    const section = permissions.cloneNode(true);
    section.querySelector("h2").textContent = "Access";
    const old = section.querySelector('[data-testid="permissions"]');
    const body = el("div", "display:flex;flex-direction:column;gap:4px");
    old.replaceWith(body);
    const oldLimits = section.querySelector('[data-testid="limits"]');
    if (oldLimits) oldLimits.remove();

    if (notice) body.appendChild(successNotice(notice));
    if (locked) {
      body.appendChild(
        el(
          "div",
          "display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:4px",
          `${centralRule()}<span style="font-size:14px;color:${T.charcoal70}">Fixed for the President, General Manager and IT Officer.</span>`,
        ),
      );
    }

    const over = (label) =>
      el(
        "p",
        `margin:16px 0 0;font-size:12px;letter-spacing:0.08333em;text-transform:uppercase;line-height:2.66;color:${T.charcoal70};font-weight:600`,
        label,
      );
    const row = (label, control, highlight) =>
      el(
        "div",
        `display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px 16px;padding:6px 8px;border-bottom:1px solid ${T.divider};${
          highlight ? "background:rgba(185,214,242,0.45);border-radius:8px;" : ""
        }`,
        `<span style="font-size:14px;color:${T.charcoal};min-width:0">${label}</span>${control}`,
      );

    body.appendChild(over("Roster"));
    ROSTER.forEach((c) =>
      body.appendChild(
        row(
          c,
          toggleGroup(["None", "View", "Edit"], grants.roster[c], { disabled: locked }),
          changed === c,
        ),
      ),
    );
    body.appendChild(over("Records and adding"));
    SWITCHES.forEach((s) =>
      body.appendChild(
        row(
          s,
          `<span style="display:inline-flex;align-items:center;gap:4px;font-size:14px;color:${T.charcoal70}">${muiSwitch(
            grants.switches[s],
            locked,
          )}${grants.switches[s] ? "Yes" : "No"}</span>`,
          changed === s,
        ),
      ),
    );
    body.appendChild(over("Events"));
    EVENTS.forEach((c) =>
      body.appendChild(
        row(
          `<span style="display:inline-flex;align-items:center;gap:8px">${swatch(c)}${c}</span>`,
          toggleGroup(["None", "View", "Manage"], grants.events[c], { disabled: locked }),
          changed === c,
        ),
      ),
    );

    permissions.before(section);

    /* What the matrix does not govern stays where it was, under a narrower name. */
    permissions.querySelector("h2").textContent = "Other permissions";
    return { section, permissions };
  }

  /* Keep only the listed sentences in Other permissions; the rest now derive from Access. */
  function keepOtherPermissions(permissions, keep) {
    const items = Array.from(permissions.querySelectorAll("li"));
    items.forEach((li) => {
      const text = li.textContent.trim();
      if (!keep.some((k) => text.startsWith(k))) li.remove();
    });
    const box = permissions.querySelector('[data-testid="permissions"]');
    if (!permissions.querySelector("li")) {
      const p = el("p", `margin:0;font-size:14px;color:${T.charcoal70}`, "None.");
      if (box) box.replaceWith(p);
    }
    const limits = permissions.querySelector('[data-testid="limits"]');
    if (limits) limits.remove();
  }

  /* The history list as AdministrationHistory draws it: RowCardList at="all", one RowCard per entry. */
  function historyEntries(entries) {
    const heading = Array.from(document.querySelectorAll("main h2")).find(
      (h) => h.textContent.trim() === "Holder history",
    );
    if (!heading) return;
    heading.textContent = "History";
    const empty = document.querySelector('[data-testid="holder-history-empty"]');
    const list = el("div", "display:flex;flex-direction:column;gap:12px");
    entries.forEach(({ title, at, subject, actor }) => {
      list.appendChild(
        el(
          "div",
          `background:#fff;border:1px solid ${T.divider};border-radius:8px;padding:16px;display:flex;flex-direction:column;gap:4px`,
          `<p style="margin:0;font-size:16px;font-weight:600;line-height:1.5;color:${T.charcoal}">${title}</p>` +
            [at, subject, actor]
              .map(
                (l) =>
                  `<div style="font-size:14px;line-height:1.43;color:${T.charcoal70}">${l}</div>`,
              )
              .join(""),
        ),
      );
    });
    if (empty) empty.replaceWith(list);
  }

  /*
   * W1-04 — one seat at a time: the Vice-President, who starts with everything
   * and can lose any one grant. This is the 375px path into the matrix: the
   * Access view's seat card opens this page.
   */
  (() => {
    const { permissions } = accessSection({ grants: seed("full") });
    keepOtherPermissions(permissions, [
      "Can record attendance",
      "Can pause and resume",
      "Can read the Monday",
      "Can anonymise",
      "Can read the operator playbook",
    ]);
  })();
})();
