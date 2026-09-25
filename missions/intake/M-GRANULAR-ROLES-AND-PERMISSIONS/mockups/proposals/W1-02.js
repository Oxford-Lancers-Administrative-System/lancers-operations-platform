/* W1-02 — generated from the shared prelude and this screen's body; see the notes inside. */
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
   * W1-02 — the Roles page's Access view: every seat's grants side by side.
   *
   * Two tables, not one: Roster (twelve categories and the three switches) and
   * Events (seven categories). One 22-column grid does not fit the 990px the
   * shell leaves at 1280 without scrolling sideways; two tables of 15 and 7 do,
   * and both keep one row per seat. Column names run down their header, the way
   * the roster board already writes a folded group's name down its column.
   *
   * Editable cells use the board's own editable-cell mark, a dotted underline.
   * The three fixed seats carry no mark and a `Central rule` chip naming LAN-423.
   *
   * Below `md` the tables go and each seat is one RowCard that opens the seat's
   * own page, where its grants are changed one at a time (W1-04).
   */
  (() => {
    const header = document.querySelector('[data-testid="page-header"]');
    const subtitle = document.querySelector('[data-testid="admin-page-subtitle"]');
    if (subtitle) subtitle.textContent = "2026-27 · access by seat";
    if (header) header.after(viewSwitch("Access"));

    const sections = Array.from(document.querySelectorAll("main section"));
    const firstSection = sections[0];
    const heading = firstSection.querySelector("h2");
    const desktopBox = firstSection.querySelector("table").closest(".MuiPaper-root").parentElement;
    const cardList = firstSection.querySelector('[data-testid="role-card"]').parentElement;
    const protoTh = firstSection.querySelector("th");
    const protoTd = firstSection.querySelector("td");
    const protoCard = firstSection.querySelector('[data-testid="role-card"]');
    const hrefFor = {};
    document.querySelectorAll('[data-testid="role-card"]').forEach((c) => {
      hrefFor[c.querySelector(".MuiTypography-subtitle1").textContent.trim()] = c
        .querySelector("a")
        .getAttribute("href");
    });

    const th = (html, css = "") => {
      const c = protoTh.cloneNode(false);
      c.innerHTML = html;
      c.style.cssText = css;
      return c;
    };
    const td = (html, css = "") => {
      const c = protoTd.cloneNode(false);
      c.innerHTML = html;
      c.style.cssText = css;
      return c;
    };
    const vertical = (label) =>
      `<span style="display:inline-block;writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;font-size:12px;line-height:1.2">${label}</span>`;
    const value = (v, locked) => {
      const muted = v === "None" || v === "No";
      const mark = locked ? "" : "border-bottom:1px dotted rgba(33,29,28,0.55);padding-bottom:1px;";
      return `<span style="${mark}color:${muted ? T.charcoal50 : T.charcoal}">${v}</span>`;
    };
    const band = (label, span, first) => {
      const c = th(
        label,
        `background:${T.navy};color:#fff;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;padding:6px 8px;text-align:left;${
          first ? "" : "border-left:2px solid #fff;"
        }`,
      );
      c.colSpan = span;
      return c;
    };

    function table(kind) {
      const cols =
        kind === "roster"
          ? [...ROSTER.map((c) => ["cat", c]), ...SWITCHES.map((s) => ["sw", s])]
          : EVENTS.map((c) => ["ev", c]);
      const t = document.createElement("table");
      t.className = firstSection.querySelector("table").className;
      t.setAttribute("aria-label", kind === "roster" ? "Roster access" : "Event access");
      t.style.tableLayout = "fixed";
      const thead = document.createElement("thead");
      const bands = document.createElement("tr");
      bands.appendChild(th("", "background:#fff;width:190px"));
      if (kind === "roster") {
        bands.appendChild(band("Roster categories", ROSTER.length, true));
        bands.appendChild(band("Records and adding", SWITCHES.length, false));
      } else {
        bands.appendChild(band("Event categories", EVENTS.length, true));
      }
      const names = document.createElement("tr");
      names.appendChild(th("Seat", "vertical-align:bottom"));
      cols.forEach(([k, label], i) =>
        names.appendChild(
          th(
            kind === "ev" || kind === "events" ? label : vertical(label),
            `vertical-align:bottom;padding:8px 6px;text-align:center;${
              kind === "roster" && i === ROSTER.length ? "border-left:2px solid " + T.divider : ""
            }${kind === "events" ? "white-space:normal;font-size:12px" : ""}`,
          ),
        ),
      );
      thead.append(bands, names);
      const tbody = document.createElement("tbody");
      GROUPS.forEach((group) => {
        const gr = document.createElement("tr");
        const gc = td(
          `<span style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;color:${T.charcoal70}">${group.label}</span>`,
          `background:${T.ground};padding:6px 12px`,
        );
        gc.colSpan = cols.length + 1;
        gr.appendChild(gc);
        tbody.appendChild(gr);
        group.seats.forEach(([seat, holder, profile]) => {
          const g = seed(profile);
          const locked = profile === "floor";
          const tr = document.createElement("tr");
          tr.appendChild(
            td(
              `<div style="font-weight:600;white-space:nowrap">${seat}</div><div style="color:${T.charcoal70};font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${holder}</div>${
                locked ? `<div style="margin-top:4px">${centralRule()}</div>` : ""
              }`,
              `width:190px;${locked ? `background:${T.ground}` : ""}`,
            ),
          );
          cols.forEach(([k, label], i) => {
            const v =
              k === "cat"
                ? g.roster[label]
                : k === "sw"
                  ? g.switches[label]
                    ? "Yes"
                    : "No"
                  : g.events[label];
            tr.appendChild(
              td(
                value(v, locked),
                `text-align:center;padding:6px 4px;${locked ? `background:${T.ground};` : ""}${
                  kind === "roster" && i === ROSTER.length
                    ? "border-left:2px solid " + T.divider
                    : ""
                }`,
              ),
            );
          });
          tbody.appendChild(tr);
        });
      });
      t.append(thead, tbody);
      return t;
    }

    /* Replace the three holder sections with the Access view. */
    const container = firstSection.parentElement;
    sections.forEach((s) => s.remove());

    const addSection = (title, kind) => {
      const s = document.createElement("section");
      s.className = firstSection.className;
      const h = heading.cloneNode(false);
      h.textContent = title;
      s.appendChild(h);
      const box = desktopBox.cloneNode(false);
      const paper = desktopBox.firstElementChild.cloneNode(false);
      paper.appendChild(table(kind));
      box.appendChild(paper);
      s.appendChild(box);
      return s;
    };
    const wide = window.innerWidth >= 900;
    const rosterSection = addSection("Roster", "roster");
    const eventSection = addSection("Events", "events");
    container.appendChild(rosterSection);
    container.appendChild(eventSection);
    if (!wide) [rosterSection, eventSection].forEach((s) => (s.style.display = "none"));

    /* Phone: one card per seat, grouped as the index groups them. */
    GROUPS.forEach((group) => {
      const s = document.createElement("section");
      s.className = firstSection.className;
      const h = heading.cloneNode(false);
      h.textContent = group.label;
      // Headings for the phone cards only: hidden where the tables show.
      const list = cardList.cloneNode(false);
      group.seats.forEach(([seat, holder, profile]) => {
        const card = protoCard.cloneNode(true);
        card.querySelector("a").setAttribute("href", hrefFor[seat] ?? "#");
        const title = card.querySelector(".MuiTypography-subtitle1");
        title.textContent = seat;
        const lines = card.querySelectorAll("div.MuiTypography-body2");
        lines[0].textContent = holder;
        lines[1].textContent = summarise(seed(profile));
        if (profile === "floor") title.insertAdjacentHTML("afterend", centralRule());
        list.appendChild(card);
      });
      s.appendChild(h);
      s.appendChild(list);
      s.dataset.phoneOnly = "true";
      container.appendChild(s);
    });
    const phone = window.innerWidth < 900;
    container.querySelectorAll('section[data-phone-only="true"]').forEach((s) => {
      if (!phone) s.style.display = "none";
    });
  })();
})();
