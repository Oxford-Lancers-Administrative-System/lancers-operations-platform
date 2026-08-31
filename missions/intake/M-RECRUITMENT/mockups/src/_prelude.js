// Shared mockup prelude — M-RECRUITMENT.
//
// Every proposal in this mission is evaluated into the running application at
// main@e669331, so both sides of a screen are photographs of the same page
// differing only by the change. These helpers exist so each screen expresses
// only its own idea: they CLONE elements the application already rendered
// rather than authoring markup, which is why the banding, chips, type scale
// and spacing cannot drift from what shipped.
//
// Generated file. Edit mockups/src/<screen>.js and rerun build-proposals.mjs.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const setHeading = (title, subtitle) => {
  const h1 = $("h1");
  if (h1) h1.textContent = title;
  if (!subtitle) return;
  for (const p of $$(".MuiTypography-body2")) {
    if (/players|columns|recruits|people|Season 20/i.test(p.textContent)) {
      p.textContent = subtitle;
      return;
    }
  }
};

const relabelButton = (from, to) => {
  for (const b of $$("a, button")) {
    if (new RegExp(`^\\s*${from}\\s*$`, "i").test(b.textContent)) {
      b.textContent = to;
      return b;
    }
  }
  return null;
};

// Inject a stylesheet. React owns the navigation and re-renders it after a
// mutation, reverting class and attribute changes; a stylesheet is not part of
// its diff, so rules survive where attribute edits do not.
const injectStyle = (css) => {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  return style;
};

// Add a Recruits item to the Administration list and move the selected
// treatment onto it.
const selectRecruitsNav = (label = "Recruits", href = "/operate/recruits") => {
  const links = $$("nav a");
  const people = links.find((a) => a.textContent.trim() === "People");
  const current = links.find((a) => a.classList.contains("Mui-selected"));
  if (!people) return null;

  const item = people.cloneNode(true);
  const text = item.querySelector(".MuiListItemText-primary") ?? item;
  text.textContent = label;
  item.setAttribute("href", href);
  item.setAttribute(
    "class",
    current ? current.getAttribute("class") : people.getAttribute("class"),
  );
  people.after(item);

  if (current) {
    const currentHref = current.getAttribute("href");
    injectStyle(
      `nav a[href="${currentHref}"]{background-color:transparent !important}` +
        `nav a[href="${href}"]{background-color:rgb(66,66,66) !important}`,
    );
  }
  return item;
};

// The recruit ladder's colours, used by every screen that shows a status.
const LADDER = {
  identified: "#78909c",
  engaged: "#00695c",
  committed: "#2e7d32",
  joined: "#0b3d91",
  declined: "#8d6e63",
  disengaged: "#b26a00",
  void: "#546e7a",
};

// Paint a cloned MUI chip as a ladder rung.
const asRung = (chip, value) => {
  chip.className = chip.className.replace(/MuiChip-color\w+/, "MuiChip-colorDefault");
  chip.style.backgroundColor = LADDER[value] ?? "#78909c";
  chip.style.color = "#fff";
  chip.style.fontWeight = "600";
  const label = chip.querySelector(".MuiChip-label") ?? chip;
  label.textContent = value;
  label.style.color = "#fff";
  return chip;
};

// A muted "not recorded" paragraph in the application's own grey.
const muted = (node, text) => {
  node.textContent = text;
  node.style.color = "rgba(0,0,0,0.38)";
  node.style.fontStyle = "italic";
  return node;
};

// A drawn panel for a surface the application has no analogue for, built from
// the page's own Paper so the border, radius and shadow are the real ones.
const drawnPanel = (title) => {
  const paper = $(".MuiPaper-root");
  const panel = paper ? paper.cloneNode(false) : document.createElement("div");
  panel.style.padding = "24px";
  panel.style.marginBottom = "16px";
  if (title) {
    const h = document.createElement("p");
    h.className = $("h1")?.className ?? "";
    h.style.cssText = "font-size:15px;font-weight:700;margin:0 0 12px;letter-spacing:0.01em";
    h.textContent = title;
    panel.append(h);
  }
  return panel;
};
