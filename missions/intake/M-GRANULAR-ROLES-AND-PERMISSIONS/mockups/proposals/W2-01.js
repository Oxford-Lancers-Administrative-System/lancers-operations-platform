/* W2-01 — generated from the shared prelude, kit and this screen's body; see the notes inside. */
(async () => {
  /*
   * M-GRANULAR-ROLES-AND-PERMISSIONS — shared proposal prelude, round 3 (palette corrected in round 4).
   *
   * Evaluated into the live page after the current-side photograph. Every
   * element it adds either clones the page's own MUI node (so the emotion class,
   * and with it the theme and the breakpoint behaviour, comes with it) or is
   * styled inline from `src/theme-tokens.ts`. Nothing here is a redesign.
   *
   * The grant model is Brian's call with Stewart (2026-09-25) and his
   * amendments after it:
   *  - Roster: the board's ten groups plus Contact & emergency, None/View/Edit.
   *  - Recruiting: Person information, Recruit details (None/View/Edit) and
   *    Event details (None/View only).
   *  - Event templates: one line per template on main, None/View/Manage. No
   *    event types and no categories; a template keeps its own colour.
   *  - Two switches: May add to the roster; May add recruits. Records open for
   *    anyone who can reach the roster or recruits; there is no records switch.
   *  - President, General Manager and IT Officer hold everything, fixed.
   *    Vice-President and Secretary start full, removable one grant at a time.
   *    Every other seat starts with None everywhere.
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
  ];
  const RECRUITING = ["Person information", "Recruit details", "Event details"];
  /* Event details is None / View only: an event's answers are written by the event, not here. */
  const RECRUITING_LEVELS = {
    "Person information": ["None", "View", "Edit"],
    "Recruit details": ["None", "View", "Edit"],
    "Event details": ["None", "View"],
  };
  const SWITCHES = ["May add to the roster", "May add recruits"];

  /*
   * The palette, `TEMPLATE_COLOUR_PALETTE` in src/lib/services/event-template-input.ts,
   * with Brian's round-4 correction (2026-09-25): the twelve swatches with one
   * change and one addition. Key `blue` becomes Oxford Blue, the brand navy
   * #002147 (theme-tokens `CLUB.oxfordBlue`, the tone the Person band already
   * wears); Lancer Gold #C09723 (theme-tokens `CLUB.gold`) is added. No Lancer
   * Blue, no second blue: thirteen swatches. Every other swatch is unchanged.
   * `tint` is the accent at 10% on white, as the other swatches' tints are.
   * `on` is the text colour a roster band head needs on that swatch: white
   * fails AA on Lancer Gold (2.7:1) and Orange (3.1:1), so those two carry
   * charcoal.
   */
  const PALETTE = [
    {
      key: "blue",
      label: "Oxford Blue",
      accent: "#002147",
      tint: "#E6E9ED",
      on: "#fff",
      change: "renamed, brand navy",
    },
    {
      key: "lancer_gold",
      label: "Lancer Gold",
      accent: "#C09723",
      tint: "#F8F1DC",
      on: T.charcoal,
      change: "added",
    },
    { key: "teal", label: "Teal", accent: "#00796b", tint: "#e2f1ef", on: "#fff" },
    { key: "purple", label: "Purple", accent: "#4527a0", tint: "#ece7f7", on: "#fff" },
    { key: "red", label: "Red", accent: "#c62828", tint: "#fbe9e9", on: "#fff" },
    { key: "orange", label: "Orange", accent: "#ef6c00", tint: "#fdf0e2", on: T.charcoal },
    { key: "green", label: "Green", accent: "#2e7d32", tint: "#e8f3e9", on: "#fff" },
    { key: "slate", label: "Slate", accent: "#455a64", tint: "#eceff1", on: "#fff" },
    { key: "indigo", label: "Indigo", accent: "#283593", tint: "#e8eaf6", on: "#fff" },
    { key: "pink", label: "Pink", accent: "#ad1457", tint: "#fce4ec", on: "#fff" },
    { key: "brown", label: "Brown", accent: "#4e342e", tint: "#efebe9", on: "#fff" },
    { key: "cyan", label: "Cyan", accent: "#00838f", tint: "#e0f7fa", on: "#fff" },
    { key: "lime", label: "Lime", accent: "#827717", tint: "#f9fbe7", on: "#fff" },
  ];
  const paletteOf = (key) => PALETTE.find((p) => p.key === key) || PALETTE[0];

  /*
   * The event templates on main, read from the running templates page, each
   * with the colour its own editor has selected. Nothing is typed in: a
   * template the club adds later appears here the same way.
   */
  async function loadTemplates() {
    const parse = async (url) =>
      new DOMParser().parseFromString(
        await (await fetch(url, { credentials: "same-origin" })).text(),
        "text/html",
      );
    const list = await parse("/operate/events/templates");
    const rows = Array.from(
      list.querySelectorAll('[data-testid="template-row"] a[href^="/operate/events/templates/"]'),
    );
    const out = [];
    for (const a of rows) {
      const page = await parse(a.getAttribute("href"));
      const on = page.querySelector('[data-testid="template-colour-swatch"][aria-pressed="true"]');
      out.push({
        name: a.textContent.trim(),
        colour: on ? on.getAttribute("data-colour") : "blue",
      });
    }
    return out;
  }
  const TEMPLATES = await loadTemplates();
  const TEMPLATE_NAMES = TEMPLATES.map((t) => t.name);

  /* Seat profiles. `floor` is fixed (Central rule, LAN-423); `full` starts full and is removable. */
  function seed(profile) {
    const roster = (v) => Object.fromEntries(ROSTER.map((c) => [c, v]));
    const tpl = (v) => Object.fromEntries(TEMPLATE_NAMES.map((c) => [c, v]));
    const none = {
      roster: roster("None"),
      recruiting: {
        "Person information": "None",
        "Recruit details": "None",
        "Event details": "None",
      },
      switches: { "May add to the roster": false, "May add recruits": false },
      templates: tpl("None"),
    };
    if (profile === "floor" || profile === "full")
      return {
        roster: roster("Edit"),
        recruiting: {
          "Person information": "Edit",
          "Recruit details": "Edit",
          "Event details": "View",
        },
        switches: { "May add to the roster": true, "May add recruits": true },
        templates: tpl("Manage"),
      };
    /* Examples, not seeds: the grants a screen's story gives one seat. */
    if (profile === "kit")
      return { ...none, roster: { ...none.roster, Person: "View", Kit: "Edit" } };
    if (profile === "coach")
      return {
        ...none,
        roster: {
          ...none.roster,
          Person: "View",
          Availability: "Edit",
          "Coaching assignments": "Edit",
          "Offensive assignments": "Edit",
          "Defensive assignments": "Edit",
          "Special teams assignments": "Edit",
          "Warmup assignments": "Edit",
        },
      };
    if (profile === "recruitViewer")
      return { ...none, recruiting: { ...none.recruiting, "Recruit details": "View" } };
    if (profile === "social")
      return { ...none, templates: { ...none.templates, Social: "Manage" } };
    if (profile === "gameView") return { ...none, templates: { ...none.templates, Game: "View" } };
    return none;
  }

  /* ------------------------------------------------------------ helpers */

  const el = (tag, css, html) => {
    const node = document.createElement(tag);
    if (css) node.style.cssText = css;
    if (html !== undefined) node.innerHTML = html;
    return node;
  };
  const PHONE = window.innerWidth < 600;
  const WIDE = window.innerWidth >= 900;

  /* The `Central rule` chip, as docs/ux/mockup-standards.md names it. An outlined small MUI Chip. */
  const LOCK_PATH =
    "M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zm-6 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm3.1-9H8.9V6a3.1 3.1 0 0 1 6.2 0v2z";
  const centralRule = (text = "Central rule · LAN-423") =>
    `<span style="display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 8px;border-radius:16px;border:1px solid ${T.outline};font-size:12px;font-weight:600;color:${T.charcoal70};white-space:nowrap;vertical-align:middle">` +
    `<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" style="fill:${T.charcoal70}"><path d="${LOCK_PATH}"/></svg>${text}</span>`;

  /* A template's own swatch, as the template editor draws it (14px, tint fill, 2px accent edge). */
  const swatchOf = (key, size = 14) => {
    const p = paletteOf(key);
    return `<span aria-hidden="true" style="display:inline-block;width:${size}px;height:${size}px;border-radius:4px;background:${p.tint};border:2px solid ${p.accent};flex-shrink:0;vertical-align:middle"></span>`;
  };
  /* A template keeps its own colour as today: key `blue` is drawn with today's hex, #1565c0. */
  const templateSwatch = (name, size = 14) => {
    const key = (TEMPLATES.find((t) => t.name === name) || {}).colour || "blue";
    const p = key === "blue" ? { accent: "#1565c0", tint: "#e8f1fb" } : paletteOf(key);
    return `<span aria-hidden="true" style="display:inline-block;width:${size}px;height:${size}px;border-radius:4px;background:${p.tint};border:2px solid ${p.accent};flex-shrink:0;vertical-align:middle"></span>`;
  };

  /* The app's own Buttons, fetched from the running events page and re-labelled. */
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
    /* Below `sm` the group takes the row's full width under its label, in equal parts. */
    return (
      `<span role="group" style="display:inline-flex;border:1px solid ${T.divider};border-radius:8px;overflow:hidden;flex-shrink:0;${
        PHONE ? "width:100%;" : ""
      }${disabled ? "opacity:0.62" : ""}">` +
      options
        .map((o, i) => {
          const on = o === selected;
          return `<span style="display:inline-flex;align-items:center;justify-content:center;${
            PHONE ? "flex:1;min-height:44px;" : "min-width:64px;min-height:36px;"
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
  /* ------------------------------------------------ shared drawing kit, round 3 */

  /* An MUI Chip, small. `filled` is the default chip; otherwise outlined. */
  function chip(text, { filled = true, dashed = false } = {}) {
    const border = dashed
      ? `1px dashed ${T.charcoal50}`
      : filled
        ? "1px solid transparent"
        : `1px solid ${T.outline}`;
    const bg = filled && !dashed ? T.neutralLight : "transparent";
    return `<span style="display:inline-flex;align-items:center;height:24px;padding:0 8px;border-radius:16px;border:${border};background:${bg};color:${T.charcoal};font-size:13px;line-height:1;white-space:nowrap;vertical-align:middle">${text}</span>`;
  }
  const proposedChip = (text = "Proposed for owner approval") =>
    chip(text, { filled: false, dashed: true });

  /* The Section disclosure indicator (src/components/section.tsx), open or closed. */
  const disclosure = (open, colour = T.navy) =>
    `<span aria-hidden="true" style="display:inline-block;width:10px;height:10px;flex-shrink:0;border-right:2px solid ${colour};border-bottom:2px solid ${colour};transform:${
      open ? "translateY(3px) rotate(225deg)" : "rotate(45deg)"
    };margin:0 6px"></span>`;

  /* The lock that replaces a locked section's disclosure: MUI LockOutlined geometry, in the band's text colour. */
  const lockIcon = (colour = "#fff", size = 18) =>
    `<svg data-lock-indicator width="${size}" height="${size}" viewBox="0 0 24 24" aria-label="Locked" role="img" style="fill:${colour};flex-shrink:0"><path d="${LOCK_PATH}"/></svg>`;

  /* An MUI Dialog over the page: backdrop and a Paper, actions right-aligned. */
  function dialog(title, bodyHtml, actions, { width = 560 } = {}) {
    const wrap = el(
      "div",
      `position:absolute;top:0;left:0;width:100%;height:${Math.max(document.documentElement.scrollHeight, window.innerHeight)}px;z-index:1300;display:flex;align-items:flex-start;justify-content:center;background:rgba(0,0,0,0.5);padding:${PHONE ? "48px 16px 0" : "96px 0 0"};box-sizing:border-box`,
    );
    const paper = el(
      "div",
      `background:#fff;border-radius:8px;box-shadow:0 11px 15px -7px rgba(0,0,0,.2),0 24px 38px 3px rgba(0,0,0,.14),0 9px 46px 8px rgba(0,0,0,.12);width:${PHONE ? "100%" : width + "px"};display:flex;flex-direction:column`,
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
    return { wrap, paper };
  }

  /* An outlined TextField, drawn at its own geometry; `select` adds the arrow. */
  function textField(
    label,
    value,
    {
      select = false,
      placeholder = "",
      helper = "",
      width = "100%",
      margin = "16px 0 8px",
      startHtml = "",
    } = {},
  ) {
    return `<div style="position:relative;width:${width};margin:${margin}">
      <div style="position:relative;border:1px solid ${T.outline};border-radius:8px;min-height:44px;display:flex;align-items:center;gap:8px;padding:0 10px 0 14px;font-size:15px;color:${value ? T.charcoal : T.charcoal50}">
        ${label ? `<span style="position:absolute;top:-9px;left:10px;padding:0 4px;background:#fff;font-size:12px;color:${T.charcoal70}">${label}</span>` : ""}
        ${startHtml}<span style="flex:1">${value || placeholder}</span>${
          select
            ? `<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" style="fill:${T.charcoal70}"><path d="M7 10l5 5 5-5z"/></svg>`
            : ""
        }</div>${helper ? `<div style="font-size:12px;color:${T.charcoal70};margin:4px 14px 0">${helper}</div>` : ""}</div>`;
  }

  /* Every grant a seat holds, as `Category: before → after` lines, for a mass action's audit entry. */
  function grantDiff(before, after) {
    const lines = [];
    ROSTER.forEach(
      (c) =>
        before.roster[c] !== after.roster[c] &&
        lines.push(`${c}: ${before.roster[c]} → ${after.roster[c]}`),
    );
    RECRUITING.forEach(
      (c) =>
        before.recruiting[c] !== after.recruiting[c] &&
        lines.push(`${c}: ${before.recruiting[c]} → ${after.recruiting[c]}`),
    );
    TEMPLATE_NAMES.forEach(
      (c) =>
        before.templates[c] !== after.templates[c] &&
        lines.push(`${c} (template): ${before.templates[c]} → ${after.templates[c]}`),
    );
    SWITCHES.forEach(
      (s) =>
        before.switches[s] !== after.switches[s] &&
        lines.push(
          `${s}: ${before.switches[s] ? "Yes" : "No"} → ${after.switches[s] ? "Yes" : "No"}`,
        ),
    );
    return lines;
  }

  /* Short counts a group reads as when folded. */
  function countsOf(values, top) {
    const n = (v) => values.filter((x) => x === v).length;
    if (values.every((v) => v === "None")) return "None";
    if (values.every((v) => v === top)) return `${top} all`;
    return ["Edit", "Manage", "View"]
      .filter((v) => n(v))
      .map((v) => `${v} ${n(v)}`)
      .join(" · ");
  }

  function sectionTitled(title) {
    return Array.from(document.querySelectorAll("main section")).find(
      (s) => s.querySelector("h2") && s.querySelector("h2").textContent.trim() === title,
    );
  }

  /* The two mass edits, as the app's outlined Buttons, each marked as not assumed. */
  function massActions() {
    const row = el(
      "div",
      "display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px",
    );
    row.appendChild(appButton("outlined", "Copy access from another seat"));
    row.appendChild(appButton("outlined", "Grant everything"));
    row.appendChild(el("span", "", proposedChip()));
    return row;
  }

  /*
   * The seat page's Access section. It replaces the read-only Permissions list
   * (round 2 removed that list; round 3 keeps it removed). Four groups, in the
   * order Brian gave: Roster (eleven categories), Recruiting (three), Event
   * templates (one line per template on main), Adding people (two switches).
   * `fold` draws each group as the Section disclosure, closed, with its count.
   */
  function accessSection({
    grants,
    locked = false,
    notice = null,
    changed = null,
    fold = false,
    actions = false,
  }) {
    const permissions = sectionTitled("Permissions");
    const section = permissions.cloneNode(true);
    section.querySelector("h2").textContent = "Access";
    const old = section.querySelector('[data-testid="permissions"]');
    const body = el("div", "display:flex;flex-direction:column;gap:4px");
    old.replaceWith(body);
    const oldLimits = section.querySelector('[data-testid="limits"]');
    if (oldLimits) oldLimits.remove();

    if (actions) body.appendChild(massActions());
    if (notice) body.appendChild(successNotice(notice));
    if (locked)
      body.appendChild(
        el(
          "div",
          "display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:4px",
          `${centralRule()}<span style="font-size:14px;color:${T.charcoal70}">Fixed for the President, General Manager and IT Officer.</span>`,
        ),
      );

    const over = (label, summary) =>
      fold
        ? el(
            "div",
            `display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;padding:12px 8px;border:1px solid ${T.divider};border-radius:8px`,
            `<span style="font-size:12px;letter-spacing:0.08333em;text-transform:uppercase;font-weight:600;color:${T.charcoal70}">${label}</span><span style="display:inline-flex;align-items:center;gap:4px;font-size:14px;color:${T.charcoal}">${summary}${disclosure(false)}</span>`,
          )
        : el(
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
    const levels = (opts, v) => toggleGroup(opts, v, { disabled: locked });

    body.appendChild(
      over(
        "Roster",
        countsOf(
          ROSTER.map((c) => grants.roster[c]),
          "Edit",
        ),
      ),
    );
    if (!fold)
      ROSTER.forEach((c) =>
        body.appendChild(row(c, levels(["None", "View", "Edit"], grants.roster[c]), changed === c)),
      );

    body.appendChild(
      over(
        "Recruiting",
        countsOf(
          RECRUITING.map((c) => grants.recruiting[c]),
          "Edit",
        ),
      ),
    );
    if (!fold)
      RECRUITING.forEach((c) =>
        body.appendChild(
          row(
            c,
            PHONE
              ? levels(RECRUITING_LEVELS[c], grants.recruiting[c])
              : `<span style="display:inline-flex;min-width:${3 * 64 + 2}px;justify-content:flex-end">${levels(RECRUITING_LEVELS[c], grants.recruiting[c])}</span>`,
            changed === c,
          ),
        ),
      );

    body.appendChild(
      over(
        "Event templates",
        countsOf(
          TEMPLATE_NAMES.map((c) => grants.templates[c]),
          "Manage",
        ),
      ),
    );
    if (!fold)
      TEMPLATE_NAMES.forEach((c) =>
        body.appendChild(
          row(
            `<span style="display:inline-flex;align-items:center;gap:8px">${templateSwatch(c)}${c}</span>`,
            levels(["None", "View", "Manage"], grants.templates[c]),
            changed === c,
          ),
        ),
      );

    const on = SWITCHES.filter((s) => grants.switches[s]).length;
    body.appendChild(over("Adding people", on ? `${on} of 2` : "None"));
    if (!fold)
      SWITCHES.forEach((s) =>
        body.appendChild(
          row(
            s,
            `<span style="display:inline-flex;align-items:center;gap:4px;font-size:14px;color:${T.charcoal70}">${muiSwitch(grants.switches[s], locked)}${grants.switches[s] ? "Yes" : "No"}</span>`,
            changed === s,
          ),
        ),
      );

    permissions.before(section);
    permissions.remove();
    return section;
  }

  /* The history list as AdministrationHistory draws it: one RowCard per entry; `grants` are its per-grant lines. */
  function historyEntries(entries) {
    const heading = Array.from(document.querySelectorAll("main h2")).find(
      (h) => h.textContent.trim() === "Holder history",
    );
    if (!heading) return;
    heading.textContent = "History";
    const empty = document.querySelector('[data-testid="holder-history-empty"]');
    const list = el("div", "display:flex;flex-direction:column;gap:12px");
    entries.forEach(({ title, at, subject, actor, grants = [] }) => {
      list.appendChild(
        el(
          "div",
          `background:#fff;border:1px solid ${T.divider};border-radius:8px;padding:16px;display:flex;flex-direction:column;gap:4px`,
          `<p style="margin:0;font-size:16px;font-weight:600;line-height:1.5;color:${T.charcoal}">${title}</p>` +
            [at, subject, actor]
              .filter(Boolean)
              .map(
                (l) =>
                  `<div style="font-size:14px;line-height:1.43;color:${T.charcoal70}">${l}</div>`,
              )
              .join("") +
            (grants.length
              ? `<ul style="margin:8px 0 0;padding:8px 0 0 20px;border-top:1px solid ${T.divider};font-size:14px;line-height:1.6;color:${T.charcoal}">${grants.map((g) => `<li>${g}</li>`).join("")}</ul>`
              : ""),
        ),
      );
    });
    if (empty) empty.replaceWith(list);
    else {
      const existing = heading.parentElement.querySelector('[data-testid="holder-history"]');
      if (existing) existing.before(list);
    }
  }

  /* ------------------------------------------------ boards: only granted groups' columns */

  const plainOf = (node, css = "") => {
    const span = document.createElement("span");
    span.innerHTML = node.innerHTML;
    span.style.cssText = css;
    node.replaceWith(span);
    return span;
  };

  /*
   * Narrow a banded board (roster or recruitment) to the granted bands. The
   * first column (the name) always stays and still opens the record. A
   * view-only band's values lose their edit links and read "view". The board
   * is copied and the copy drawn, so the live board reports nothing back.
   */
  function narrowBoard(table, { granted, viewOnly = [] }) {
    const copy = table.cloneNode(true);
    table.style.display = "none";
    table.after(copy);
    const bandRow = copy.tHead.rows[0];
    const keep = new Set([0]);
    const viewCols = new Set();
    let index = Number(bandRow.cells[0].getAttribute("colspan") || 1);
    Array.from(bandRow.cells)
      .slice(1)
      .forEach((th) => {
        const span = Number(th.getAttribute("colspan") || 1);
        const id = (th.querySelector("[data-testid^=band-toggle-]") || {}).dataset?.testid ?? "";
        const band = id.replace("band-toggle-", "").replace(/:.*/, "");
        const ok = granted.includes(band);
        if (!ok) th.style.display = "none";
        for (let i = 0; i < span; i += 1) {
          if (ok) keep.add(index);
          if (viewOnly.includes(band)) viewCols.add(index);
          index += 1;
        }
      });
    let shown = 0;
    Array.from(copy.tHead.rows)
      .slice(1)
      .concat(Array.from(copy.tBodies[0].rows))
      .forEach((row, r) => {
        let col = 0;
        Array.from(row.cells).forEach((cell) => {
          const i = col;
          col += Number(cell.getAttribute("colspan") || 1);
          if (!keep.has(i)) {
            cell.style.display = "none";
            return;
          }
          if (r === 0 && i > 0) shown += 1;
          if (viewCols.has(i)) {
            cell.querySelectorAll(".MuiTypography-caption").forEach((c) => {
              if (/edit on the record|edit here/.test(c.textContent)) c.textContent = "view";
            });
            cell
              .querySelectorAll(
                'a[aria-label^="Opens the person record"], a[href^="/operate/recruitment/"]',
              )
              .forEach((a) => plainOf(a, `font-size:13px;color:${T.charcoal}`));
            cell.querySelectorAll(".MuiFormControl-root").forEach((fc) => {
              const shownValue =
                (fc.querySelector(".MuiSelect-select") || fc).textContent.trim() || "—";
              const span = document.createElement("span");
              span.textContent = shownValue;
              span.style.cssText = `font-size:14px;color:${/^Not recorded$|^—$/.test(shownValue) ? T.charcoal50 : T.charcoal}`;
              fc.replaceWith(span);
            });
            cell.querySelectorAll("button").forEach((b) => {
              if (!b.closest("thead")) plainOf(b, `font-size:14px;color:${T.charcoal}`);
            });
          }
        });
      });
    return { copy, shown };
  }

  async function scrollBoardTo(copy, bandTestId, leftPad = 420) {
    await new Promise((r) => setTimeout(r, 50));
    let scroller = copy.parentElement;
    while (
      scroller &&
      scroller !== document.body &&
      getComputedStyle(scroller).overflowX === "visible"
    )
      scroller = scroller.parentElement;
    const band = copy.querySelector(`[data-testid="${bandTestId}"]`);
    if (band && scroller) {
      scroller.scrollLeft = 0;
      scroller.scrollLeft = Math.max(
        0,
        band.closest("th").getBoundingClientRect().left -
          scroller.getBoundingClientRect().left -
          leftPad,
      );
    }
  }

  /* ------------------------------------------------ records: locked sections */

  /*
   * A category the seat holds None on: the section stays in its place,
   * collapsed, with a lock where the disclosure was. It cannot be opened and
   * its contents are never sent, so everything below the band head is removed.
   */
  function lockSection(details) {
    if (details.tagName !== "DETAILS") {
      /* A plain banded Section: keep its band head, drop the body, put the lock in the head. */
      const h = details.querySelector("h2, h3");
      let head = h;
      while (head && head.parentElement !== details) head = head.parentElement;
      Array.from(details.children).forEach((c) => {
        if (c !== head) c.remove();
      });
      if (head) {
        head.querySelectorAll("a, button").forEach((a) => a.remove());
        head.style.display = "flex";
        head.style.justifyContent = "space-between";
        head.style.alignItems = "center";
        head.insertAdjacentHTML("beforeend", lockIcon(getComputedStyle(h).color));
      }
      return details;
    }
    details.removeAttribute("open");
    details.open = false;
    const summary = details.querySelector("summary");
    Array.from(details.children).forEach((c) => {
      if (c !== summary) c.remove();
    });
    if (summary) {
      summary.style.cursor = "default";
      summary.setAttribute("aria-disabled", "true");
      summary.addEventListener("click", (e) => e.preventDefault());
      const ind = summary.querySelector("[data-disclosure-indicator]");
      const colour = getComputedStyle(summary.querySelector("h2, h3") || summary).color;
      if (ind) ind.outerHTML = lockIcon(colour);
      else {
        const head = summary.querySelector("h2, h3");
        if (head && head.parentElement)
          head.parentElement.insertAdjacentHTML("beforeend", lockIcon(colour));
      }
      /* The band head's action (e.g. "Open the person record →") is a way in; a locked section offers none. */
      summary.querySelectorAll("a, button").forEach((a) => a.remove());
    }
    return details;
  }

  /* Open a collapsed section on a copy, so the live disclosure never reports a toggle. */
  function openCopy(details) {
    const copy = details.cloneNode(true);
    copy.open = true;
    copy.setAttribute("open", "");
    const ind = copy.querySelector("[data-disclosure-indicator]");
    if (ind) ind.style.transform = "translateY(3px) rotate(225deg)";
    details.replaceWith(copy);
    return copy;
  }

  /* View, not edit: a section's values read as values. */
  function readOnly(root) {
    root.querySelectorAll("a").forEach((a) => {
      if (a.closest("summary")) return;
      plainOf(a);
    });
    root.querySelectorAll("button").forEach((b) => {
      if (!b.closest("summary")) b.remove();
    });
  }
  /*
   * W2-01 — the roster page with an "Edit categories" control at the top
   * right, beside Add players. Round 4 (Brian, 2026-09-25: "It should be the
   * same size as Add players"): the control is a copy of the page's own Add
   * players Button — the same contained variant, the same size and minimum
   * height, the same emotion class — re-labelled, with its menu wiring
   * removed. The two sit side by side. It opens W2-02. Only the seats that may
   * change roster group colours see it (who that is: an open question; drawn
   * for the review account, which holds every grant). Nothing else on the page
   * changes.
   */
  const main = document.querySelector("main");
  const add =
    main.querySelector('[data-testid="add-players"]') ||
    Array.from(main.querySelectorAll("a, button")).find(
      (b) => b.textContent.trim() === "Add players",
    );
  /* A twin of Add players: same element, same classes, its own label; no id, test id or menu attributes. */
  const twinOfAdd = (label) => {
    const b = add.cloneNode(true);
    ["id", "data-testid", "aria-haspopup", "aria-controls", "aria-expanded"].forEach((a) =>
      b.removeAttribute(a),
    );
    b.textContent = label;
    b.setAttribute("data-proposed", "edit-categories");
    return b;
  };
  if (add) {
    const wrap = el(
      "div",
      "display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;align-items:center",
    );
    add.replaceWith(wrap);
    wrap.append(twinOfAdd("Edit categories"), add);
  }
})();
