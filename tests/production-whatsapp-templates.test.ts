// @vitest-environment node
/**
 * The checked-in record of what the club submitted to Meta — LAN-348.
 *
 * `scripts/production/whatsapp-templates.json` is the build sheet the owner
 * types into WhatsApp Manager: fourteen names, their approved bodies, the
 * meaning of every positional slot, and each button's base URL. Until it
 * existed, WhatsApp Manager was the only record of what the club sends, and a
 * registry that drifted from it produced `132000` at Meta or, worse, a message
 * delivered with its sentences in the wrong order.
 *
 * This binds the two together. The record cannot gain a slot the registry does
 * not send, the registry cannot gain a button the approved template has no room
 * for, and neither can point at a host or a route that is not the club's.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { MESSAGE_KINDS, MESSAGE_TEMPLATES, TEMPLATE_NAMES } from "../src/lib/delivery/templates";
import type { MessageKind } from "../src/lib/delivery/provider";

interface SubmissionRecord {
  readonly name: string;
  readonly kind: MessageKind;
  readonly category: string;
  readonly language: string;
  readonly environment: string;
  readonly validityPeriodHours: number;
  readonly body: string;
  readonly samples: readonly { readonly slot: string; readonly meaning: string }[];
  readonly buttons: readonly { readonly label: string; readonly url: string }[];
  readonly replaces: string;
}

const PRODUCTION_HOST = "https://app.oxfordlancers.com";

const records: SubmissionRecord[] = JSON.parse(
  readFileSync(join(process.cwd(), "scripts/production/whatsapp-templates.json"), "utf8"),
);
const byKind = new Map(records.map((record) => [record.kind, record]));

describe("the checked-in production submission records", () => {
  it("covers every kind exactly once, under the name the registry sends", () => {
    expect(records).toHaveLength(MESSAGE_KINDS.length);
    expect([...byKind.keys()].sort()).toEqual([...MESSAGE_KINDS].sort());
    for (const kind of MESSAGE_KINDS) expect(byKind.get(kind)?.name).toBe(TEMPLATE_NAMES[kind]);
  });

  it("is Utility throughout, which is the entire point of the generation", () => {
    // A Marketing template cannot reach a United States number, and cannot be
    // reclassified once accepted. One row slipping back to Marketing would
    // silently cut off the people this rebuild exists to reach.
    for (const record of records) {
      expect(record.category, record.name).toBe("UTILITY");
      expect(record.environment, record.name).toBe("Production");
      // Meta's default validity is ten minutes, which discards any message
      // whose recipient was asleep when the scheduler fired.
      expect(record.validityPeriodHours, record.name).toBe(12);
    }
  });

  for (const kind of MESSAGE_KINDS) {
    it(`${kind}: the record's slots and buttons are what the registry sends`, () => {
      const record = byKind.get(kind);
      if (!record) throw new Error(`No submission record for ${kind}.`);
      const template = MESSAGE_TEMPLATES[kind];

      // Every slot the approved body uses, in the order Meta numbers them, is
      // a parameter the registry declares — by name, not merely by count.
      const slots = [...record.body.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
      expect(slots).toEqual(record.samples.map((_, index) => index + 1));
      expect(record.samples.map((sample) => sample.meaning)).toEqual([...template.parameterNames]);

      expect(record.buttons).toHaveLength(template.buttonCount ?? 0);
      for (const button of record.buttons) {
        // The host lives in the approved template and nowhere else: the sender
        // supplies only the dynamic suffix. A button pointing anywhere but the
        // club's own domain is a link the club does not control.
        expect(button.url.startsWith(`${PRODUCTION_HOST}/`), button.url).toBe(true);
        expect(button.url.endsWith("/{{1}}"), button.url).toBe(true);
      }
      // Meta refuses two dynamic buttons sharing one base URL: Submit for
      // review is silently disabled, with nothing marked invalid.
      expect(new Set(record.buttons.map((button) => button.url)).size).toBe(record.buttons.length);

      // Every URL in a body is hardcoded rather than a variable, because Meta
      // refuses a body parameter holding one — that is why neither escalation
      // sends its queue link as a parameter.
      for (const url of record.body.match(/https?:\/\/\S+/g) ?? [])
        expect(url.startsWith(PRODUCTION_HOST), url).toBe(true);
    });
  }

  it("names a distinct Marketing original for each row, all of them retired", () => {
    const replaced = records.map((record) => record.replaces);
    expect(new Set(replaced).size).toBe(records.length);
    // A `_v2` name that still matched its own predecessor would mean the club
    // never moved off the Marketing template at all.
    for (const record of records) expect(record.name).not.toBe(record.replaces);
  });
});
