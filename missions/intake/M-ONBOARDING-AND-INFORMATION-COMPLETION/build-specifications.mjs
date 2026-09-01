// Render the approved ledger as one formatted reading page.
//
// Run from the worktree root:
//   node missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION/build-specifications.mjs
//
// M-PEOPLE-AND-ROSTER established the artifact: one `specifications.html`
// holding the overview, the boundary, the inventory and every workflow
// specification, in the house style. This generates it from the markdown rather
// than restating it, for the same reason the mockup hub is generated: a second
// hand-maintained copy of the same facts goes stale, and nothing fails when it
// does.
//
// The markdown subset is the one the ledger actually uses: headings, GFM
// tables, bullet and ordered lists, blockquotes, fenced code, and inline
// strong/em/code/link. Anything outside it falls through to a paragraph rather
// than being silently dropped.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { format, resolveConfig } from "prettier";

const ROOT = "missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION";
const STATE = JSON.parse(readFileSync(path.join(ROOT, "state.json"), "utf8"));

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Code spans are lifted out first so nothing inside one is re-parsed as
// emphasis, then put back. The placeholder is a private-use code point, which
// cannot appear in the ledger's own prose.
const HOLD = "";

function inline(text) {
  const code = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => {
    code.push(`<code>${esc(c)}</code>`);
    return `${HOLD}${code.length - 1}${HOLD}`;
  });
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, h) => `<a href="${h}">${t}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/(^|\s)_([^_\n]+)_/g, "$1<em>$2</em>");
  return s.replace(new RegExp(`${HOLD}(\\d+)${HOLD}`, "g"), (_, i) => code[Number(i)]);
}

const splitRow = (line) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, "|"));

const isDivider = (line) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line ?? "");

/**
 * One list block, nested by indent.
 *
 * `block` is every line of the list: its bullets and the indented lines that
 * wrap them. The shallowest indent present is this level; anything deeper
 * belongs to the item above it and is rendered by recursion.
 */
function renderList(block) {
  const bullets = block.filter((l) => /^(\s*)([-*+]|\d+\.)\s+/.test(l));
  if (bullets.length === 0) return "";
  const base = Math.min(...bullets.map((l) => /^\s*/.exec(l)[0].length));
  const ordered = /^\s*\d/.test(bullets[0]);

  const items = [];
  for (const line of block) {
    const m = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(line);
    if (m && m[1].length === base) {
      items.push({ text: [m[3]], children: [] });
      continue;
    }
    if (items.length === 0) continue;
    const item = items[items.length - 1];
    // Deeper bullet, or a line under one: it belongs to this item.
    if (m || item.children.length) item.children.push(line);
    else item.text.push(line.trim());
  }

  const tag = ordered ? "ol" : "ul";
  return `<${tag}>${items
    .map((item) => {
      const nested = item.children.length ? renderList(item.children) : "";
      return `<li>${inline(item.text.join(" "))}${nested}</li>`;
    })
    .join("")}</${tag}>`;
}

function render(md, idPrefix) {
  const lines = md.split("\n");
  const out = [];
  const headings = [];
  let i = 0;
  let n = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) {
      i += 1;
      continue;
    }

    if (/^```/.test(line)) {
      const body = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i += 1;
      out.push(`<pre><code>${esc(body.join("\n"))}</code></pre>`);
      continue;
    }

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const id = `${idPrefix}-h${(n += 1)}`;
      out.push(`<h${level} id="${id}">${inline(h[2])}</h${level}>`);
      if (level === 2) headings.push({ id, text: h[2].replace(/[`*]/g, "") });
      i += 1;
      continue;
    }

    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      out.push("<hr />");
      i += 1;
      continue;
    }

    if (line.includes("|") && isDivider(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const body = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        body.push(splitRow(lines[i++]));
      }
      out.push(
        `<div class="tablewrap"><table><thead><tr>${head
          .map((c) => `<th>${inline(c)}</th>`)
          .join("")}</tr></thead><tbody>${body
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table></div>`,
      );
      continue;
    }

    if (/^>\s?/.test(line)) {
      const body = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote>${render(body.join("\n"), `${idPrefix}q${n}`).html}</blockquote>`);
      continue;
    }

    // Lists, including nested ones. A wrapped line is indented under its
    // bullet and joins that item; a bullet indented further than its
    // predecessor opens a child list. The first version ignored indent
    // entirely and rendered every sub-bullet flat, which read as one long
    // list where the specification meant a hierarchy.
    if (/^(\s*)([-*+]|\d+\.)\s+(.*)$/.test(line)) {
      const block = [];
      while (i < lines.length) {
        if (/^(\s*)([-*+]|\d+\.)\s+/.test(lines[i]) || /^\s+\S/.test(lines[i])) {
          block.push(lines[i++]);
          continue;
        }
        if (/^\s*$/.test(lines[i])) {
          const next = lines[i + 1] ?? "";
          if (/^(\s*)([-*+]|\d+\.)\s+/.test(next) || /^\s+\S/.test(next)) {
            i += 1;
            continue;
          }
        }
        break;
      }
      out.push(renderList(block));
      continue;
    }

    const para = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6}\s|>|```)/.test(lines[i])) {
      if (/^(\s*)([-*+]|\d+\.)\s+/.test(lines[i])) break;
      if (lines[i].includes("|") && isDivider(lines[i + 1])) break;
      para.push(lines[i++]);
    }
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    else i += 1;
  }

  return { html: out.join("\n"), headings };
}

const workflowDir = path.join(ROOT, "workflows");
const specs = existsSync(workflowDir)
  ? readdirSync(workflowDir)
      .filter((f) => /^W\d+-.+\.md$/.test(f))
      .sort((a, b) => Number(/^W(\d+)/.exec(a)[1]) - Number(/^W(\d+)/.exec(b)[1]))
  : [];

const sections = [
  { file: "01-overview.md", title: "Overview", approvalKey: "overview" },
  { file: "00-boundary.md", title: "Boundary", approvalKey: "boundary" },
  { file: "02-workflows.md", title: "Frozen workflow inventory", approvalKey: "inventory" },
  {
    file: "item-and-ask-inventory.md",
    title: "Item and ask inventory",
    approvalKey: "item_and_ask_inventory",
  },
  ...specs.map((f) => {
    const id = /^W\d+/.exec(f)[0];
    return {
      file: path.posix.join("workflows", f),
      title: `${id} — ${STATE.workflows.find((w) => w.id === id)?.name ?? f}`,
      workflow: id,
    };
  }),
].filter((s) => existsSync(path.join(ROOT, s.file)));

/**
 * The chip states what the ledger says, never what the page wishes. A workflow
 * is only "spec approved" when `approvals.spec` holds Brian's words.
 */
function statusChip(section) {
  if (section.workflow) {
    const workflow = STATE.workflows.find((w) => w.id === section.workflow);
    if (workflow?.approvals?.spec) return '<span class="chip ok">spec approved</span>';
    if (workflow?.state === "not_started") return '<span class="chip idle">not started</span>';
    return '<span class="chip warn">draft, not approved</span>';
  }
  return STATE.approvals?.[section.approvalKey]
    ? '<span class="chip ok">approved</span>'
    : '<span class="chip warn">not approved</span>';
}

const rendered = sections.map((section, index) => {
  const { html, headings } = render(
    readFileSync(path.join(ROOT, section.file), "utf8"),
    `s${index}`,
  );
  return { ...section, id: `sec${index}`, html, headings };
});

const page = `<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${STATE.mission_id} · specifications</title>
    <style>
      :root {
        --primary: #0b3d91;
        --text: rgba(0, 0, 0, 0.87);
        --sec: rgba(0, 0, 0, 0.6);
        --divider: rgba(0, 0, 0, 0.12);
        --grey50: #fafafa;
        --grey100: #f5f5f5;
        --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial,
          sans-serif;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: var(--font);
        color: var(--text);
        background: #e7e9ee;
        line-height: 1.65;
      }
      .bar {
        position: sticky;
        top: 0;
        z-index: 5;
        background: #212121;
        color: #fff;
        padding: 11px 22px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        flex-wrap: wrap;
      }
      .bar .who { font-weight: 700; font-size: 0.95rem; }
      .bar .who span { color: #bdbdbd; font-weight: 400; margin-left: 8px; font-size: 0.8rem; }
      .bar a {
        color: #fff;
        text-decoration: none;
        font-size: 0.85rem;
        border: 1px solid rgba(255, 255, 255, 0.35);
        border-radius: 6px;
        padding: 4px 10px;
        margin-left: 8px;
      }
      .bar a:hover { background: rgba(255, 255, 255, 0.12); }
      .layout {
        display: flex;
        gap: 26px;
        max-width: 1220px;
        margin: 26px auto 90px;
        padding: 0 22px;
        align-items: flex-start;
      }
      nav.toc {
        position: sticky;
        top: 68px;
        flex: 0 0 252px;
        background: #fff;
        border: 1px solid var(--divider);
        border-radius: 10px;
        padding: 16px 8px 16px 16px;
        max-height: calc(100vh - 104px);
        overflow: auto;
      }
      nav.toc h2 {
        font-size: 11px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--sec);
        margin: 0 0 10px;
        border: 0;
        padding: 0;
      }
      nav.toc ol { list-style: none; margin: 0; padding: 0; }
      nav.toc > ol > li { margin-bottom: 4px; }
      nav.toc a {
        display: block;
        color: var(--text);
        text-decoration: none;
        font-size: 13.5px;
        padding: 4px 8px;
        border-radius: 5px;
      }
      nav.toc a:hover { background: var(--grey100); }
      nav.toc .sub { padding-left: 11px; margin-bottom: 6px; }
      nav.toc .sub a { color: var(--sec); font-size: 12.5px; padding: 2px 8px; }
      main { flex: 1 1 auto; min-width: 0; }
      section.doc {
        background: #fff;
        border: 1px solid var(--divider);
        border-radius: 10px;
        padding: 4px 34px 30px;
        margin-bottom: 22px;
      }
      section.doc > header {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        padding: 16px 0 11px;
        border-bottom: 1px solid var(--divider);
      }
      section.doc > header h2 {
        font-size: 1.02rem;
        margin: 0;
        border: 0;
        padding: 0;
      }
      section.doc > header .file {
        font-size: 12px;
        color: var(--sec);
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        margin-left: auto;
      }
      h1 { font-size: 1.45rem; margin: 22px 0 10px; letter-spacing: -0.01em; }
      h2 { font-size: 1.1rem; margin: 30px 0 8px; padding-top: 16px; border-top: 1px solid var(--divider); }
      h3 { font-size: 0.98rem; margin: 20px 0 6px; }
      h4 { font-size: 0.92rem; margin: 16px 0 4px; color: var(--sec); }
      p, li { font-size: 0.95rem; }
      ul, ol { padding-left: 22px; }
      li { margin: 5px 0; }
      code { background: var(--grey100); padding: 1px 5px; border-radius: 4px; font-size: 0.85em; }
      pre { background: var(--grey100); padding: 12px 14px; border-radius: 8px; overflow-x: auto; }
      pre code { background: none; padding: 0; }
      blockquote {
        margin: 12px 0;
        padding: 6px 16px;
        border-left: 3px solid var(--divider);
        color: var(--sec);
      }
      .tablewrap { overflow-x: auto; margin: 14px 0; }
      table { border-collapse: collapse; width: 100%; font-size: 0.875rem; }
      th, td {
        border: 1px solid var(--divider);
        padding: 8px 10px;
        text-align: left;
        vertical-align: top;
      }
      thead th {
        background: var(--grey50);
        font-size: 0.78rem;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        color: var(--sec);
      }
      a { color: var(--primary); }
      hr { border: 0; border-top: 1px solid var(--divider); margin: 22px 0; }
      .chip {
        display: inline-block;
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.02em;
        padding: 2px 9px;
        border-radius: 11px;
        white-space: nowrap;
      }
      .chip.ok { background: #edf7ed; color: #1b5e20; }
      .chip.warn { background: #fff4e5; color: #663c00; }
      .chip.idle { background: var(--grey100); color: var(--sec); }
      @media (max-width: 900px) {
        .layout { display: block; padding: 0 12px; }
        nav.toc { position: static; width: auto; margin-bottom: 18px; max-height: none; }
        section.doc { padding: 4px 18px 24px; }
      }
    </style>
  </head>
  <body>
    <div class="bar">
      <div class="who">
        Specifications<span>${STATE.mission_id} · stage ${STATE.stage} · main@${STATE.baseline.commit.slice(0, 7)}</span>
      </div>
      <div>
        <a href="mockups/index.html">Index</a>
        <a href="mockups/W1-bring-last-seasons-squad-in.html">W1 screens</a>
      </div>
    </div>
    <div class="layout">
      <nav class="toc">
        <h2>On this page</h2>
        <ol>
${rendered
  .map(
    (s) => `          <li>
            <a href="#${s.id}">${esc(s.title)}</a>
            <ol class="sub">
${s.headings.map((h) => `              <li><a href="#${h.id}">${esc(h.text)}</a></li>`).join("\n")}
            </ol>
          </li>`,
  )
  .join("\n")}
        </ol>
      </nav>
      <main>
${rendered
  .map(
    (s) => `        <section class="doc" id="${s.id}">
          <header>
            <h2>${esc(s.title)}</h2>
            ${statusChip(s)}
            <span class="file">${esc(s.file)}</span>
          </header>
${s.html}
        </section>`,
  )
  .join("\n")}
      </main>
    </div>
  </body>
</html>
`;

const target = path.join(ROOT, "specifications.html");
writeFileSync(
  target,
  await format(page, { ...(await resolveConfig(target)), parser: "html", filepath: target }),
);
console.log(`built specifications.html from ${rendered.length} ledger documents`);
