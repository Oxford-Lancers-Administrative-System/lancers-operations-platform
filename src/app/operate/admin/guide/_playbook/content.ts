/**
 * The playbook, in the order it is listed — LAN-399.
 *
 * The order is the club's year rather than the application's menu: people
 * arrive (Recruitment, Onboarding), the club runs (Events, Messaging, Roster),
 * and then the things that hold it together (People and data, Operators and
 * roles, Reports). An operator reading top to bottom reads the season.
 */
import type { PlaybookPage } from "./types";

/** The index page's own words. */
export const PLAYBOOK_TITLE = "Guide";
export const PLAYBOOK_SUBTITLE = "How each workflow runs";

/** The four bands every page carries, in order, named once so the pages and the tests agree. */
export const BAND_HEADINGS = Object.freeze({
  flowchart: "The flow",
  description: "The flow, in words",
  steps: "The steps",
  rules: "The rules",
  whereToLook: "Where to look",
  notYetMerged: "Not yet released",
  capabilities: "What each seat may do",
} as const);

/** The existing page, linked from the index rather than folded into it. */
export const ADMINISTRATION_GUIDE_LINK = Object.freeze({
  href: "/operate/admin/guide",
  label: "How administration works",
  summary:
    "The step-by-step answers for each administrative act, and what each account state means.",
});

export const PLAYBOOK_PAGES: readonly PlaybookPage[] = Object.freeze([]);

export function playbookPage(slug: string): PlaybookPage | undefined {
  return PLAYBOOK_PAGES.find((page) => page.slug === slug);
}
