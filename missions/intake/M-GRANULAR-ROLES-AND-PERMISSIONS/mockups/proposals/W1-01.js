/* W1-01 — generated from the shared prelude and this screen's body; see the notes inside. */
(async () => {
  /*
   * M-GRANULAR-ROLES-AND-PERMISSIONS — shared proposal prelude, round 3.
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
   * with round 3's change read literally: the current blue (key `blue`)
   * becomes Lancer Blue, the team blue, drawn as the brand board's Royal Blue
   * #1D42A6 until Brian names the hex; Lancer Gold (brand board Gold, #C09723)
   * is added beside it; the old blue #1565c0 is kept under the name Oxford
   * Blue. Every other swatch is unchanged. `on` is the text colour a roster
   * band head needs on that swatch: white fails AA on Lancer Gold (2.7:1) and
   * Orange (3.1:1).
   */
  const PALETTE = [
    {
      key: "blue",
      label: "Lancer Blue",
      accent: "#1D42A6",
      tint: "#E3EBF8",
      on: "#fff",
      change: "renamed, team blue",
    },
    {
      key: "lancer_gold",
      label: "Lancer Gold",
      accent: "#C09723",
      tint: "#F8F1DC",
      on: T.charcoal,
      change: "added",
    },
    {
      key: "oxford_blue",
      label: "Oxford Blue",
      accent: "#1565c0",
      tint: "#e8f1fb",
      on: "#fff",
      change: "the old blue, kept",
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
  /*
   * W1-01 — the Roles index. Round 3 (Brian and Stewart, 2026-09-25): access
   * is edited on the seat page and nowhere else, so the index stays exactly as
   * it is on main. This proposal changes nothing; the two photographs are the
   * evidence that nothing changes here. (The prelude still runs and reads the
   * templates, so the proposal is produced the same way as every other screen.)
   */
  void TEMPLATES;
})();
