/**
 * The three constructors the playbook's copy is written with — LAN-399.
 *
 * Short on purpose: the eight page modules are mostly calls to these, and a
 * longer name would bury the sentence under the markup. Each one is a claim
 * `content.test.ts` checks against `src/`, which is why the copy names them at
 * all rather than writing plain strings everywhere.
 */
import type { GuideRun } from "./types";

/** A page or section title the reader will see. */
export const screen = (name: string): GuideRun => ({ screen: name });

/** A button, field, tab or menu label the reader will click or fill in. */
export const control = (label: string): GuideRun => ({ control: label });

/** A status value the reader will read off a record. */
export const state = (label: string): GuideRun => ({ state: label });
