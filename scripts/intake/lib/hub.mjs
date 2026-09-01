// The mockup review hub, rendered from the ledger rather than maintained by
// hand. The first intake kept `mockups/index.html` correct by remembering to
// edit it; nothing regenerated it and nothing failed when it drifted.
//
// Rendering is deterministic — no dates, no ordering that depends on the
// filesystem, no data that is not already in `state.json` or in the discovered
// specification, mockup and acceptance files — so `--check` is a byte
// comparison against the committed file.

import fs from "node:fs";
import path from "node:path";
import { measuredScreenCount } from "./shoot.mjs";

export const HUB_FILE = path.join("mockups", "index.html");

const escape = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const listFiles = (directory) => (fs.existsSync(directory) ? fs.readdirSync(directory).sort() : []);

/**
 * Discover what actually exists on disk for one workflow: its specification,
 * its mockup, its acceptance record, how many screens the mockup renders, and
 * whether that mockup shows the current build beside the proposal.
 */
export function describeWorkflow(workflow, ledgerRoot) {
  // A rendered specification is linked in preference to its markdown source.
  // The hub is read in a browser, and a `.md` served as a static file arrives
  // as a wall of pipes and asterisks — Brian, 2026-09-01, opening W1's from
  // this table. The markdown remains the artifact of record and is still
  // linked when no rendering exists.
  const workflowFiles = listFiles(path.join(ledgerRoot, "workflows"));
  const rendered = workflowFiles.filter((name) =>
    new RegExp(`^${workflow.id}-.+\\.html$`).test(name),
  );
  const sources = workflowFiles.filter((name) => new RegExp(`^${workflow.id}-.+\\.md$`).test(name));
  const specs = rendered.length === 1 ? rendered : sources;
  const mocks = listFiles(path.join(ledgerRoot, "mockups")).filter((name) =>
    new RegExp(`^${workflow.id}-.+\\.html$`).test(name),
  );
  const acceptanceFile = path.join("acceptance", `${workflow.id}.md`);
  const acceptance = fs.existsSync(path.join(ledgerRoot, acceptanceFile)) ? acceptanceFile : null;

  let screens = 0;
  let disposition = "—";
  if (mocks.length === 1) {
    const html = fs.readFileSync(path.join(ledgerRoot, "mockups", mocks[0]), "utf8");
    screens = new Set(
      [...html.matchAll(new RegExp(`\\b${workflow.id}-([0-9]{2})\\b`, "g"))].map(
        (match) => match[1],
      ),
    ).size;
    // The banding required by docs/ux/mockup-standards.md labels both sides
    // identically on every screen, so its two labels are what we look for.
    const banded = /on\s+`?main`?\s+today/i.test(html) && /this mission/i.test(html);
    const newSurface = /New surface, nothing to compare/i.test(html);
    if (banded && newSurface) disposition = "current vs proposed · new surfaces";
    else if (banded) disposition = "current vs proposed";
    else if (newSurface) disposition = "new surface, nothing to compare";
    else disposition = "proposed only";
  }

  const amendments = (workflow.amendments ?? []).map(
    (amendment) => `${amendment.id ?? "amendment"} (${amendment.status ?? "open"})`,
  );
  const carried = (workflow.carried_questions ?? []).length;
  const open = [
    ...workflow.feedback.map((item) => item.screen_id),
    ...(carried ? [`${carried} carried question${carried === 1 ? "" : "s"}`] : []),
  ];

  return {
    id: workflow.id,
    name: workflow.name,
    state: workflow.state,
    stale: workflow.stale === true,
    spec: specs.length === 1 ? path.posix.join("..", "workflows", specs[0]) : null,
    mock: mocks.length === 1 ? mocks[0] : null,
    acceptance: acceptance ? path.posix.join("..", ...acceptanceFile.split(path.sep)) : null,
    screens,
    disposition,
    amendments,
    open,
  };
}

const link = (href, text) => (href ? `<a href="${escape(href)}">${escape(text)}</a>` : "—");

/**
 * Render the complete hub. The result is not yet Prettier-formatted; callers
 * format it, so that the committed artifact and the generated comparison are
 * produced by exactly the same pipeline.
 */
export function renderMockupHub(state, ledgerRoot) {
  const rows = state.workflows.map((workflow) => describeWorkflow(workflow, ledgerRoot));
  const done = rows.filter((row) => row.state === "done").length;
  const screens = rows.reduce((total, row) => total + row.screens, 0);
  const stale = rows.filter((row) => row.stale).length;
  // Stated, never promised. The first intake's hub claimed every screen was
  // rendered "at a true 375" when both frames held the same desktop markup in
  // a narrow box; this counts the screens a browser context actually reported
  // 375px for (LAN-166).
  const measured = measuredScreenCount(ledgerRoot);

  const summary = [
    `${state.mission_id}`,
    `${rows.length} frozen ${rows.length === 1 ? "workflow" : "workflows"}`,
    `${screens} ${screens === 1 ? "screen" : "screens"}`,
    `${done} of ${rows.length} done`,
    stale > 0 ? `${stale} stale` : null,
    `grounded in ${state.baseline.branch} at ${state.baseline.commit.slice(0, 7)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const body = rows
    .map((row) =>
      [
        "          <tr>",
        `            <td>${escape(row.id)}</td>`,
        `            <td>${link(row.mock, row.name)}</td>`,
        `            <td>${link(row.spec, "specification")}</td>`,
        `            <td>${link(row.acceptance, "acceptance")}</td>`,
        `            <td>${row.screens}</td>`,
        `            <td>${escape(row.disposition)}</td>`,
        `            <td><span class="state ${escape(row.state)}">${escape(row.state)}</span>${
          row.stale ? '<span class="state stale">STALE</span>' : ""
        }</td>`,
        `            <td>${
          row.amendments.length || row.open.length
            ? escape([...row.amendments, ...row.open].join(", "))
            : '<span class="muted">none</span>'
        }</td>`,
        "          </tr>",
      ].join("\n"),
    )
    .join("\n");

  return `<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escape(state.mission_id)} · mockup review</title>
    <style>
      /* Tokens taken from src/theme.ts and MUI defaults. Nothing here is a redesign. */
      body {
        margin: 0;
        font:
          16px/1.55 -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          system-ui,
          Arial,
          sans-serif;
        color: rgba(0, 0, 0, 0.87);
        background: #e7e9ee;
      }
      main {
        max-width: 1080px;
        margin: 48px auto;
        padding: 32px;
        background: #fff;
        border-radius: 8px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
      }
      h1 {
        font-size: 24px;
        margin: 0 0 4px;
      }
      .sub {
        color: rgba(0, 0, 0, 0.6);
        margin: 0 0 24px;
        font-size: 14px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th,
      td {
        text-align: left;
        padding: 10px 12px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.12);
        vertical-align: top;
      }
      th {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: rgba(0, 0, 0, 0.6);
      }
      a {
        color: #0b3d91;
        font-weight: 600;
      }
      .state {
        font-size: 12px;
        padding: 3px 9px;
        border-radius: 999px;
        border: 1px solid rgba(0, 0, 0, 0.23);
        color: rgba(0, 0, 0, 0.6);
        white-space: nowrap;
      }
      .state.done {
        background: #e8f5e9;
        border-color: #2e7d32;
        color: #1b5e20;
      }
      .state.spec_approved,
      .state.mock_approved {
        background: #e3f2fd;
        border-color: #0b3d91;
        color: #0b3d91;
      }
      .state.stale {
        margin-left: 6px;
        background: #fff3e0;
        border-color: #e65100;
        color: #e65100;
      }
      .note {
        margin-top: 24px;
        font-size: 14px;
        color: rgba(0, 0, 0, 0.6);
        border-left: 3px solid rgba(0, 0, 0, 0.12);
        padding-left: 14px;
      }
      .muted {
        color: rgba(0, 0, 0, 0.38);
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escape(state.mission_id)} · mockup review</h1>
      <p class="sub">${escape(summary)}</p>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Workflow</th>
            <th>Specification</th>
            <th>Acceptance</th>
            <th>Screens</th>
            <th>Current vs proposed</th>
            <th>State</th>
            <th>Open items</th>
          </tr>
        </thead>
        <tbody>
${body}
        </tbody>
      </table>
      <p class="note">
        Generated by <code>npm run intake -- hub --write</code> from
        <code>state.json</code> and the files in this ledger. Do not hand-edit it:
        <code>npm run intake -- status</code> fails when it drifts. Feedback is by screen ID, for
        example <code>W1-02</code>.${
          // Added by LAN-166, and silent when no screen has been shot. The hub
          // is byte-compared against every packet already approved on `main`,
          // so an unconditional line here would make `status` refuse on all of
          // them at once.
          measured > 0
            ? ` ${measured} of ${screens} screens were photographed out of the running application at a browser-measured 375px and 1280px; the rest are drawings of surfaces that do not exist yet.`
            : ""
        } Next action: ${escape(state.next_action)}
      </p>
    </main>
  </body>
</html>
`;
}
