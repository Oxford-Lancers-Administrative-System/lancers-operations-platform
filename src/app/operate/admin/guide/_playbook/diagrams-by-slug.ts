/**
 * Slug → diagram, so the generator and the pages agree by construction.
 *
 * Separate from `diagrams.ts` only so that file stays a list of drawings with
 * nothing else in it; the keys here are the URL segments, and
 * `flowchart.test.ts` asserts they are exactly the eight the playbook has.
 */
import type { FlowDiagram } from "./flowchart";
import {
  EVENTS_DIAGRAM,
  MESSAGING_DIAGRAM,
  ONBOARDING_DIAGRAM,
  OPERATORS_DIAGRAM,
  PEOPLE_DIAGRAM,
  RECRUITMENT_DIAGRAM,
  REPORTS_DIAGRAM,
  ROSTER_DIAGRAM,
} from "./diagrams";

export const DIAGRAMS: Readonly<Record<string, FlowDiagram>> = Object.freeze({
  recruitment: RECRUITMENT_DIAGRAM,
  onboarding: ONBOARDING_DIAGRAM,
  events: EVENTS_DIAGRAM,
  messaging: MESSAGING_DIAGRAM,
  roster: ROSTER_DIAGRAM,
  "people-and-data": PEOPLE_DIAGRAM,
  "operators-and-roles": OPERATORS_DIAGRAM,
  reports: REPORTS_DIAGRAM,
});
