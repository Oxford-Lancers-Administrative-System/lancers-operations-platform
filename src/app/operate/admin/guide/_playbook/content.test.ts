// @vitest-environment node
/**
 * The playbook's words — LAN-399.
 *
 * A guide is the one kind of page that can be wholly wrong and still look
 * perfect. Every sentence reads sensibly; nothing throws; no screenshot
 * differs. The failure is silent and it is total — an operator follows a step,
 * hunts for a control that is not on the screen, and stops trusting the guide.
 *
 * So the assertions here are not about the copy being present. They are about
 * the copy being **true**:
 *
 *   * every screen name, control label and state the pages quote appears
 *     verbatim in the application's own source, outside this folder;
 *   * every link under "Where to look" points at a route that exists;
 *   * the seat table is a projection of `capabilities.ts` and holds no data of
 *     its own.
 *
 * This file briefly carried a fourth family. The Messaging page was written
 * against LAN-394 before it merged, and the three labels it quoted from that
 * branch were exempted — with the exemption asserted to be genuinely absent
 * from `src/`, so that the merge broke the test instead of leaving a stale
 * caveat on the page. PR 195 merged, the assertion failed, and the exemption
 * was deleted. That is what the mechanism was for.
 *
 * Plus the house prohibitions: no first person, no marketing, no personal data.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  CAPABILITIES,
  CAPABILITY_KEYS,
  ROLE_LABELS,
  roleCodesPermit,
} from "@/lib/auth/capabilities";
import { capabilityHeading, seatsWithCapabilities } from "./capability-table";
import { ADMINISTRATION_GUIDE_LINK, PLAYBOOK_PAGES, playbookPage } from "./content";
import { quotedClaims, runsToText, type PlaybookPage } from "./types";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../../..");
const SRC = path.join(REPO_ROOT, "src");
/** The playbook's own folder. Excluded, or every claim would match itself. */
const SELF = path.join(SRC, "app/operate/admin/guide/_playbook");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (full.startsWith(SELF)) return [];
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!/\.tsx?$/.test(entry)) return [];
    // Tests are excluded deliberately: a label that exists only in a test file
    // is a label the application does not render.
    if (/\.test\.tsx?$/.test(entry)) return [];
    return [full];
  });
}

/** The whole application's source as one string, read once. */
const APPLICATION_SOURCE = sourceFiles(SRC)
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

const ROUTE_ROOT = path.join(SRC, "app");

function routeExists(href: string): boolean {
  const segments = href.split("/").filter(Boolean);
  let dir = ROUTE_ROOT;
  for (const segment of segments) {
    const entries = readdirSync(dir, { withFileTypes: true }).filter((entry) =>
      entry.isDirectory(),
    );
    const exact = entries.find((entry) => entry.name === segment);
    // A dynamic or grouped segment matches too: `/privacy` lives under
    // `app/(policies)/privacy`, and `/operate/events/[id]` is a real route.
    const dynamic = entries.find((entry) => /^\[.+\]$/.test(entry.name));
    const grouped = entries.find(
      (entry) =>
        /^\(.+\)$/.test(entry.name) && readdirSync(path.join(dir, entry.name)).includes(segment),
    );
    if (exact) dir = path.join(dir, exact.name);
    else if (grouped) dir = path.join(dir, grouped.name, segment);
    else if (dynamic) dir = path.join(dir, dynamic.name);
    else return false;
  }
  return readdirSync(dir).some((entry) => /^page\.tsx?$/.test(entry));
}

const EXPECTED_SLUGS = [
  "recruitment",
  "onboarding",
  "events",
  "messaging",
  "roster",
  "people-and-data",
  "operators-and-roles",
  "reports",
];

describe("the playbook covers the eight workflows Brian named", () => {
  it("has exactly those eight, in the club's own order", () => {
    expect(PLAYBOOK_PAGES.map((page) => page.slug)).toEqual(EXPECTED_SLUGS);
  });

  it("finds each of them by slug, and nothing else", () => {
    for (const slug of EXPECTED_SLUGS) expect(playbookPage(slug)?.slug).toBe(slug);
    expect(playbookPage("attendance")).toBeUndefined();
    expect(playbookPage("")).toBeUndefined();
  });

  it("links the existing How administration works page rather than absorbing it", () => {
    // Brian, 21 September 2026: that page is kept as it is, on its own gate.
    expect(ADMINISTRATION_GUIDE_LINK.href).toBe("/operate/admin/guide");
    expect(PLAYBOOK_PAGES.map((page) => page.slug)).not.toContain("administration");
  });
});

describe("every page carries all four bands", () => {
  // One test per property across all eight pages; each failure names the page.
  it("fills every band", () => {
    const thin = PLAYBOOK_PAGES.flatMap((page: PlaybookPage) =>
      [
        page.name.length > 3 ? null : "name",
        page.summary.length > 20 ? null : "summary",
        /^\/guide\/[a-z-]+\.svg$/.test(page.flowchart.src) ? null : "flowchart src",
        page.flowchart.alt.length > 30 ? null : "flowchart alt",
        // A drawing described in one line is a caption, not a description.
        page.flowchart.description.length >= 3 ? null : "flowchart description",
        page.steps.length >= 6 ? null : "steps",
        page.rules.length >= 5 ? null : "rules",
        page.whereToLook.length >= 2 ? null : "where to look",
      ]
        .filter((band) => band !== null)
        .map((band) => `${page.slug}: ${band}`),
    );
    expect(thin).toEqual([]);
  });

  it("says what the app does between the operator's steps", () => {
    // The requirement's own words: "what the app does between steps".
    // A page of nothing but operator actions is a menu, not a flow.
    const menus = PLAYBOOK_PAGES.filter(
      (page) => page.steps.filter((step) => step.then).length < page.steps.length - 1,
    ).map((page) => page.slug);
    expect(menus).toEqual([]);
  });

  it("labels every rule", () => {
    const badLabels = PLAYBOOK_PAGES.flatMap((page) =>
      page.rules
        .filter(
          (rule) =>
            rule.label.length <= 3 ||
            // A "short labelled fact", not a paragraph.
            rule.label.length >= 60 ||
            runsToText(rule.fact).length <= 20,
        )
        .map((rule) => `${page.slug}: ${rule.label}`),
    );
    expect(badLabels).toEqual([]);
  });
});

describe("every quoted claim is true of the application", () => {
  const rows = PLAYBOOK_PAGES.flatMap((page) =>
    quotedClaims(page).map(
      (claim) =>
        [`${page.slug}: ${claim.kind} ${claim.text}`, page, claim.text] as [
          string,
          PlaybookPage,
          string,
        ],
    ),
  );

  it("finds every quoted claim in the application source", () => {
    const untrue = rows.filter(([, , text]) => !APPLICATION_SOURCE.includes(text));
    expect(untrue.map(([name]) => name)).toEqual([]);
  });

  it("checks a real number of them, so a refactor cannot empty the list", () => {
    expect(rows.length).toBeGreaterThan(120);
  });

  it("reads the application and not itself", () => {
    // The assertion above is worthless if the corpus includes the pages making
    // the claims. This is the guard on the guard.
    expect(APPLICATION_SOURCE).not.toContain("PLAYBOOK_TITLE =");
    expect(APPLICATION_SOURCE).toContain("gateShellPage");
  });
});

describe("every Where to look link goes somewhere", () => {
  const links = PLAYBOOK_PAGES.flatMap((page) =>
    page.whereToLook.map((lookup) => [`${page.slug} → ${lookup.href}`, lookup.href] as const),
  );

  it("resolves every link to a route", () => {
    const broken = links.filter(([, href]) => !href.startsWith("/") || !routeExists(href));
    expect(broken.map(([name]) => name)).toEqual([]);
  });

  it("recognises a route that does not exist", () => {
    expect(routeExists("/operate/nowhere")).toBe(false);
  });
});

describe("the seat table is generated, not typed", () => {
  it("lists exactly the seats that hold at least one capability", () => {
    const expected = Object.keys(ROLE_LABELS).filter((code) =>
      CAPABILITY_KEYS.some((key) => roleCodesPermit([code], key)),
    );
    expect(seatsWithCapabilities()).toEqual(expected);
    // Ten of the twenty hold nothing; a table listing all twenty would be
    // half blank rows.
    expect(seatsWithCapabilities().length).toBeLessThan(Object.keys(ROLE_LABELS).length);
  });

  it("takes every column heading from the capability's own action sentence", () => {
    for (const key of CAPABILITY_KEYS) {
      const heading = capabilityHeading(key);
      expect(heading.length, key).toBeGreaterThan(3);
      expect(CAPABILITIES[key].action.toLowerCase(), key).toContain(heading.toLowerCase());
    }
  });

  it("shows the two grants the IT Officer does not hold as withheld", () => {
    expect(seatsWithCapabilities()).toContain("it_officer");
    expect(roleCodesPermit(["it_officer"], "person_erasure")).toBe(false);
    expect(roleCodesPermit(["it_officer"], "operator_guide")).toBe(false);
  });

  it("hard-codes no seat and no grant in the copy", () => {
    // The requirement is "generated from capabilities.ts, not hand-typed, so it
    // cannot drift". Asserted as a property of the module's text.
    const source = readFileSync(path.join(SELF, "capability-table.tsx"), "utf8");
    for (const code of Object.keys(ROLE_LABELS)) {
      if (code === "it_officer") continue; // named once, in the accessible-label comment
      expect(source, code).not.toContain(`"${code}"`);
    }
    for (const key of CAPABILITY_KEYS) expect(source, key).not.toContain(`"${key}"`);
  });

  it("describes the seat page's Access section, not the retired Permissions panel — LAN-423", () => {
    const page = playbookPage("operators-and-roles");
    expect(page).toBeDefined();
    const text = page!.steps
      .flatMap((step) => [runsToText(step.operator), step.then ? runsToText(step.then) : ""])
      .join(" ");
    expect(text).not.toMatch(/Permissions/);
    expect(text).toContain("Access");
    expect(text).toMatch(/Events and the roster are granted per seat/);
    const headings = CAPABILITY_KEYS.map(capabilityHeading);
    expect(headings).not.toContain("Approve an event");
    expect(headings).not.toContain("Inspect delivery");
    expect(capabilityHeading("event_approval")).toBe("No remaining action");
  });
});

describe("the house prohibitions on what this copy may say", () => {
  const everything = PLAYBOOK_PAGES.map((page) =>
    [
      page.name,
      page.summary,
      page.flowchart.alt,
      ...page.flowchart.description.map(runsToText),
      ...page.steps.flatMap((step) => [
        runsToText(step.operator),
        step.then ? runsToText(step.then) : "",
      ]),
      ...page.rules.map((rule) => `${rule.label} ${runsToText(rule.fact)}`),
      ...page.whereToLook.map((lookup) => `${lookup.label} ${runsToText(lookup.shows)}`),
    ].join(" "),
  ).join("\n");

  it.each([
    ["the first person", /\b(I|we|our|us|my)\b/],
    ["a second-person instruction", /\byou should\b|\byou'll\b|\byou will need\b/i],
    ["marketing", /\beasy\b|\bsimply\b|\bjust click\b|\bpowerful\b|\bseamless\b/i],
    ["a database procedure", /\bsql\b|\bpostgres\b|\bsupabase\b|\bdashboard\b/i],
  ])("contains no %s", (_what, pattern) => {
    expect(everything).not.toMatch(pattern);
  });

  it("names no person", () => {
    // No real names anywhere, and no worked example built on one. Brian is
    // named in the module comments, which are not copy and are not rendered.
    expect(everything).not.toMatch(/\bBrian\b|\bClint\b|\bStewart\b/);
  });

  it("quotes no telephone number and no email address", () => {
    expect(everything).not.toMatch(/\b\d{5}\s?\d{6}\b|\+44|@[a-z0-9-]+\.[a-z]{2,}/i);
  });
});
