/**
 * The playbook, in the order it is listed — LAN-399.
 *
 * The order is the club's year rather than the application's menu: people
 * arrive (Recruitment, Onboarding), the club runs (Events, Messaging, Roster),
 * and then the things that hold it together (People and data, Operators and
 * roles, Reports). An operator reading top to bottom reads the season.
 */
import { EVENTS_PAGE } from "./pages/events";
import { MESSAGING_PAGE } from "./pages/messaging";
import { ONBOARDING_PAGE } from "./pages/onboarding";
import { OPERATORS_AND_ROLES_PAGE } from "./pages/operators-and-roles";
import { PEOPLE_AND_DATA_PAGE } from "./pages/people-and-data";
import { RECRUITMENT_PAGE } from "./pages/recruitment";
import { REPORTS_PAGE } from "./pages/reports";
import { ROSTER_PAGE } from "./pages/roster";
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
  capabilities: "What each seat may do",
} as const);

/** The existing page, linked from the index rather than folded into it. */
export const ADMINISTRATION_GUIDE_LINK = Object.freeze({
  href: "/operate/admin/guide",
  label: "How administration works",
  summary:
    "The step-by-step answers for each administrative act, and what each account state means.",
});

export const PLAYBOOK_PAGES: readonly PlaybookPage[] = Object.freeze([
  RECRUITMENT_PAGE,
  ONBOARDING_PAGE,
  EVENTS_PAGE,
  MESSAGING_PAGE,
  ROSTER_PAGE,
  PEOPLE_AND_DATA_PAGE,
  OPERATORS_AND_ROLES_PAGE,
  REPORTS_PAGE,
]);

export function playbookPage(slug: string): PlaybookPage | undefined {
  return PLAYBOOK_PAGES.find((page) => page.slug === slug);
}
