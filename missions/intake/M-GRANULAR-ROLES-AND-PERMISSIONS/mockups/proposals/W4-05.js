/* W4-05 — generated from the shared prelude, kit and this screen's body; see the notes inside. */
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
   * twelve roster categories, four per-seat switches, seven event categories;
   * President, General Manager and IT Officer fixed full; Vice-President and
   * Secretary start full; every other seat starts from today's capability map.
   *
   * Round 2 (Brian, 2026-09-25): four switches, not three; the seed rule wins,
   * so the Treasurer starts with nothing on the roster and every coaching seat
   * starts with None on every event category.
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
  const SWITCHES = [
    "May open individual records (roster)",
    "May open individual records (recruits)",
    "May add people to the roster",
    "May add recruits",
  ];
  /* The shorter name a switch takes inside a count or chip, where the group already says which. */
  const SWITCH_SHORT = {
    "May open individual records (roster)": "Open roster records",
    "May open individual records (recruits)": "Open recruit records",
    "May add people to the roster": "Add to the roster",
    "May add recruits": "Add recruits",
  };
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
    /* The seed rule wins: nothing on the roster for the Treasurer. */
    if (profile === "treasurer")
      return { roster: all("None"), switches: sw(false), events: ev("View") };
    /* Coaches: nothing on the roster, None on every event category. */
    if (profile === "coach")
      return { roster: all("None"), switches: sw(false), events: ev("None") };
    /* Not a seed: the Kit Manager after W1-03's example change. */
    if (profile === "kit")
      return {
        roster: { ...all("None"), Person: "View", Kit: "Edit" },
        switches: { ...sw(false), "May open individual records (roster)": true },
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
      on.length === SWITCHES.length
        ? "all four switches"
        : on.length
          ? on.map((x) => SWITCH_SHORT[x]).join(", ")
          : null;
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

  /*
   * The view switch is the app's own ViewSwitch (src/app/calendar/view-switch.tsx),
   * the List | Calendar control on /operate/events and /operate/events/calendar.
   * It is fetched from /operate/events and its MUI Buttons are re-labelled, so
   * the node and its emotion styles are the running component's, not a copy.
   */
  let APP_BUTTONS = null;
  async function appButtons() {
    if (APP_BUTTONS) return APP_BUTTONS;
    const html = await (await fetch("/operate/events", { credentials: "same-origin" })).text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("style").forEach((st) => {
      if ((st.getAttribute("data-emotion") || "").length || st.textContent.includes(".css-"))
        document.head.appendChild(st.cloneNode(true));
    });
    const nav = document.importNode(doc.querySelector('[data-testid="events-view-switch"]'), true);
    const contained = nav.querySelector('a[aria-current="page"]');
    const outlined = nav.querySelector("a:not([aria-current])");
    const create = doc.querySelector("main .MuiButton-contained:not([aria-current])");
    APP_BUTTONS = { nav, contained, outlined, create };
    return APP_BUTTONS;
  }
  function appButton(kind, label, href = "#") {
    const b = APP_BUTTONS[kind].cloneNode(true);
    b.textContent = label;
    b.setAttribute("href", href);
    b.removeAttribute("aria-current");
    b.removeAttribute("data-testid");
    return b;
  }
  async function viewSwitch(active) {
    await appButtons();
    const nav = APP_BUTTONS.nav.cloneNode(false);
    nav.setAttribute("aria-label", "Roles view");
    nav.setAttribute("data-testid", "roles-view-switch");
    [
      ["Holders", "/operate/admin/roles"],
      ["Access", "/operate/admin/roles?view=access"],
    ].forEach(([label, href]) => {
      const b = appButton(label === active ? "contained" : "outlined", label, href);
      if (label === active) b.setAttribute("aria-current", "page");
      nav.appendChild(b);
    });
    return nav;
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

  /* ------------------------------------------------ shared drawing kit, round 2 */

  const PHONE = window.innerWidth < 600;
  const WIDE = window.innerWidth >= 900;

  /* An MUI Chip, small. `filled` is the default chip; otherwise outlined. */
  function chip(text, { filled = true, accent = null, dashed = false } = {}) {
    const border = dashed
      ? `1px dashed ${T.charcoal50}`
      : filled
        ? "1px solid transparent"
        : `1px solid ${T.outline}`;
    const bg = accent ? accent[1] : filled ? T.neutralLight : "transparent";
    const fg = accent ? accent[0] : T.charcoal;
    return `<span style="display:inline-flex;align-items:center;height:24px;padding:0 8px;border-radius:16px;border:${border};background:${bg};color:${fg};font-size:13px;line-height:1;white-space:nowrap;vertical-align:middle">${text}</span>`;
  }
  const proposedChip = (text = "Proposed for owner approval") =>
    chip(text, { filled: false, dashed: true });

  /* The Section disclosure indicator (src/components/section.tsx), open or closed. */
  const disclosure = (open) =>
    `<span aria-hidden="true" style="display:inline-block;width:10px;height:10px;flex-shrink:0;border-right:2px solid ${T.navy};border-bottom:2px solid ${T.navy};transform:${
      open ? "translateY(3px) rotate(225deg)" : "rotate(45deg)"
    };margin:0 6px"></span>`;

  /* A Section card (Paper outlined, h3 heading), as src/components/section.tsx draws `plain`. */
  function sectionCard(title, bodyHtml, { action = "" } = {}) {
    return el(
      "section",
      `background:#fff;border:1px solid ${T.divider};border-radius:8px;padding:${PHONE ? 16 : 24}px`,
      `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;margin-bottom:16px"><h2 style="margin:0;font-size:20px;font-weight:600;line-height:1.3;color:${T.charcoal}">${title}</h2>${action}</div>${bodyHtml}`,
    );
  }

  /* An MUI Dialog over the page: backdrop and a Paper, actions right-aligned. */
  function dialog(title, bodyHtml, actions) {
    const wrap = el(
      "div",
      `position:absolute;top:0;left:0;width:100%;height:${document.documentElement.scrollHeight}px;z-index:1300;display:flex;align-items:flex-start;justify-content:center;background:rgba(0,0,0,0.5);padding:${PHONE ? "96px 16px 0" : "180px 0 0"};box-sizing:border-box`,
    );
    const paper = el(
      "div",
      `background:#fff;border-radius:8px;box-shadow:0 11px 15px -7px rgba(0,0,0,.2),0 24px 38px 3px rgba(0,0,0,.14),0 9px 46px 8px rgba(0,0,0,.12);width:${PHONE ? "100%" : "560px"};display:flex;flex-direction:column`,
      `<h2 style="margin:0;padding:16px 24px;font-size:20px;font-weight:600;color:${T.charcoal}">${title}</h2><div style="padding:0 24px 8px;font-size:14px;color:${T.charcoal}">${bodyHtml}</div>`,
    );
    const bar = el(
      "div",
      "display:flex;justify-content:flex-end;gap:8px;padding:8px 24px 16px;flex-wrap:wrap",
    );
    actions.forEach((a) => bar.appendChild(a));
    paper.appendChild(bar);
    wrap.appendChild(paper);
    document.body.appendChild(wrap);
    return wrap;
  }

  /* An outlined TextField, drawn at its own geometry; `select` adds the arrow. */
  function textField(
    label,
    value,
    { select = false, placeholder = "", helper = "", width = "100%" } = {},
  ) {
    return `<div style="position:relative;width:${width};margin:16px 0 ${helper ? 4 : 8}px">
      <div style="position:relative;border:1px solid ${T.outline};border-radius:8px;min-height:48px;display:flex;align-items:center;padding:0 14px;font-size:16px;color:${value ? T.charcoal : T.charcoal50}">
        <span style="position:absolute;top:-9px;left:10px;padding:0 4px;background:#fff;font-size:12px;color:${T.charcoal70}">${label}</span>
        <span style="flex:1">${value || placeholder}</span>${
          select
            ? `<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" style="fill:${T.charcoal70}"><path d="M7 10l5 5 5-5z"/></svg>`
            : ""
        }</div>${
          helper
            ? `<div style="font-size:12px;color:${T.charcoal70};margin:4px 14px 0">${helper}</div>`
            : ""
        }</div>`;
  }

  /* Every grant a seat holds, as `Category: before → after` lines, for a mass action's audit entry. */
  function grantDiff(before, after) {
    const lines = [];
    ROSTER.forEach(
      (c) =>
        before.roster[c] !== after.roster[c] &&
        lines.push(`${c}: ${before.roster[c]} → ${after.roster[c]}`),
    );
    SWITCHES.forEach(
      (s) =>
        before.switches[s] !== after.switches[s] &&
        lines.push(
          `${s}: ${before.switches[s] ? "Yes" : "No"} → ${after.switches[s] ? "Yes" : "No"}`,
        ),
    );
    EVENTS.forEach(
      (c) =>
        before.events[c] !== after.events[c] &&
        lines.push(`${c}: ${before.events[c]} → ${after.events[c]}`),
    );
    return lines;
  }

  /* Short counts a seat's grants read as in one cell. */
  function counts(g) {
    const r = (v) => ROSTER.filter((c) => g.roster[c] === v).length;
    const e = (v) => EVENTS.filter((c) => g.events[c] === v).length;
    const roster =
      r("Edit") === 12
        ? "Edit all"
        : r("None") === 12
          ? "None"
          : [r("Edit") ? `Edit ${r("Edit")}` : "", r("View") ? `View ${r("View")}` : ""]
              .filter(Boolean)
              .join(" · ");
    const events =
      e("Manage") === 7
        ? "Manage all"
        : e("View") === 7
          ? "View all"
          : e("None") === 7
            ? "None"
            : [e("Manage") ? `Manage ${e("Manage")}` : "", e("View") ? `View ${e("View")}` : ""]
                .filter(Boolean)
                .join(" · ");
    const on = SWITCHES.filter((s) => g.switches[s]).length;
    return { roster, events, switches: on ? `${on} of 4` : "None" };
  }

  /* Hide the Roles index's holder sections and return what a view is rebuilt from. */
  function rolesScaffold() {
    const sections = Array.from(document.querySelectorAll("main section"));
    const first = sections[0];
    const ctx = {
      container: first.parentElement,
      sectionClass: first.className,
      heading: first.querySelector("h2"),
      tableClass: first.querySelector("table").className,
      desktopBox: first.querySelector("table").closest(".MuiPaper-root").parentElement,
      cardList: first.querySelector('[data-testid="role-card"]').parentElement,
      protoCard: first.querySelector('[data-testid="role-card"]'),
      protoTh: first.querySelector("th"),
      protoTd: first.querySelector("td"),
      textButton: first.querySelector("td a.MuiButton-root"),
      hrefFor: {},
    };
    document.querySelectorAll('[data-testid="role-card"]').forEach((c) => {
      ctx.hrefFor[c.querySelector(".MuiTypography-subtitle1").textContent.trim()] = c
        .querySelector("a")
        .getAttribute("href");
    });
    sections.forEach((s) => s.remove());
    ctx.th = (html, css = "") => {
      const c = ctx.protoTh.cloneNode(false);
      c.innerHTML = html;
      c.style.cssText = css;
      return c;
    };
    ctx.td = (html, css = "") => {
      const c = ctx.protoTd.cloneNode(false);
      c.innerHTML = html;
      c.style.cssText = css;
      return c;
    };
    ctx.section = (title) => {
      const s = document.createElement("section");
      s.className = ctx.sectionClass;
      if (title) {
        const h = ctx.heading.cloneNode(false);
        h.textContent = title;
        s.appendChild(h);
      }
      ctx.container.appendChild(s);
      return s;
    };
    ctx.frame = (table) => {
      const box = ctx.desktopBox.cloneNode(false);
      box.style.display = "block";
      const paper = ctx.desktopBox.firstElementChild.cloneNode(false);
      paper.appendChild(table);
      box.appendChild(paper);
      return box;
    };
    ctx.table = (label) => {
      const t = document.createElement("table");
      t.className = ctx.tableClass;
      t.setAttribute("aria-label", label);
      t.append(document.createElement("thead"), document.createElement("tbody"));
      return t;
    };
    ctx.textBtn = (label, href = "#") => {
      const b = ctx.textButton.cloneNode(true);
      b.textContent = label;
      b.setAttribute("href", href);
      return b;
    };
    ctx.card = (title, sublines, href) => {
      const card = ctx.protoCard.cloneNode(true);
      card.querySelector("a").setAttribute("href", href ?? "#");
      card.querySelector(".MuiTypography-subtitle1").innerHTML = title;
      const lines = card.querySelectorAll("div.MuiTypography-body2");
      lines[0].innerHTML = sublines[0] ?? "";
      if (lines[1]) lines[1].innerHTML = sublines[1] ?? "";
      sublines.slice(2).forEach((l) => {
        const extra = lines[0].cloneNode(false);
        extra.innerHTML = l;
        lines[lines.length - 1].after(extra);
      });
      return card;
    };
    return ctx;
  }

  /* The Roles page's Access view head: subtitle, the app's ViewSwitch, and room for a toolbar. */
  async function accessViewHead(subtitleText = "2026-27 · access by seat") {
    const header = document.querySelector('[data-testid="page-header"]');
    const subtitle = document.querySelector('[data-testid="admin-page-subtitle"]');
    if (subtitle) subtitle.textContent = subtitleText;
    const sw = await viewSwitch("Access");
    header.after(sw);
    return sw;
  }

  /* The two mass edits, as the app's outlined Buttons. */
  function massButtons() {
    return [
      appButton("outlined", "Copy access from another seat"),
      appButton("outlined", "Grant everything"),
    ];
  }
  const buttonRow = (buttons, css = "") => {
    const row = el("div", `display:flex;gap:8px;flex-wrap:wrap;align-items:center;${css}`);
    buttons.forEach((b) => row.appendChild(b));
    return row;
  };

  const ALL_SEATS = GROUPS.flatMap((g) =>
    g.seats.map(([seat, holder, profile]) => ({ group: g.label, seat, holder, profile })),
  );
  /*
   * W4-05 — one game as a seat with View on Game (the Gameday Secretary in
   * this example). View shows everything in the event: audience, answers,
   * reasons, attendance, the messaging plan's steps. No create, edit,
   * delete, send or schedule control exists anywhere: the controls are
   * absent, not disabled. Recording attendance is not a grant and stays
   * (decision 5); the register panel is unchanged.
   *
   * Photographed as the review account and narrowed by script.
   */
  signedInAs("Osgood Lanthorne", ["/operate/events"]);
  const main = document.querySelector("main");
  const MANAGE = [
    "Edit event",
    "Roster form",
    "Cancel event",
    "Delivery",
    "Duplicate",
    "Amend event",
    "Send",
    "Send now",
    "Resend",
    "Delete draft",
    "Approve",
    "Release",
  ];
  main.querySelectorAll("a, button").forEach((b) => {
    const t = b.textContent.trim();
    if (MANAGE.includes(t)) b.remove();
    else if (t === "Record answer") {
      const span = document.createElement("span");
      span.textContent = "—";
      span.style.color = T.charcoal70;
      b.replaceWith(span);
    }
  });
})();
