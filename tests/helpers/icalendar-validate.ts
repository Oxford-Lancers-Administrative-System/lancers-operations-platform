/**
 * A structural RFC 5545 conformance check, for `LAN-158`'s "the document
 * validates as iCalendar" acceptance evidence.
 *
 * ## Why a hand-written parser rather than a real validator
 *
 * The obvious proof — feed the document to `icalendar.org`'s validator, or to
 * Google/Microsoft/Apple directly — needs a publicly reachable URL, which the
 * brief is explicit this worker cannot produce locally. Adding a validation
 * *library* is the same dependency question `calendar-feed.ts`'s header
 * already answers: none is on `main`, and adding one puts `package.json` on
 * the merge gate's prohibited-surface list.
 *
 * So this reads the document back the way RFC 5545 defines it to be read:
 * CRLF line endings, the 75-octet fold reversed, each content line's
 * `NAME(;PARAM=VALUE)*:VALUE` grammar checked, `BEGIN`/`END` nesting balanced,
 * and the required properties this mission actually emits — `VERSION` and
 * `PRODID` on `VCALENDAR`; `UID`, `DTSTAMP`, `DTSTART`, `SUMMARY`, `STATUS` and
 * `SEQUENCE` on every `VEVENT` — present with well-formed values. It is a
 * conformance check for the shape this codebase writes, not a general-purpose
 * parser; nothing here reads `VALARM`, `RRULE`, or any property this feed does
 * not emit.
 *
 * Returns every issue found rather than throwing on the first, so a failing
 * test names all of them at once.
 */

const REQUIRED_PROPERTIES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  VCALENDAR: Object.freeze(["VERSION", "PRODID"]),
  VEVENT: Object.freeze(["UID", "DTSTAMP", "DTSTART", "SUMMARY", "STATUS", "SEQUENCE"]),
});

const VALID_STATUS_VALUES = new Set(["CONFIRMED", "CANCELLED", "TENTATIVE"]);

/** `NAME` or `NAME;PARAM=VALUE;PARAM2=VALUE2:VALUE` — RFC 5545 §3.1's contentline. */
const CONTENT_LINE_PATTERN = /^[A-Za-z0-9-]+(;[A-Za-z0-9-]+=[^:;]*)*:.*$/;

/** `YYYYMMDD` or `YYYYMMDDTHHMMSSZ` — the two DATE/DATE-TIME shapes this feed emits. */
const DATE_OR_UTC_DATETIME_PATTERN = /^\d{8}(T\d{6}Z)?$/;

export function validateICalendar(document: string): string[] {
  const issues: string[] = [];

  if (/(?<!\r)\n/.test(document)) {
    issues.push("document contains a bare LF that is not preceded by CR");
  }
  if (!document.endsWith("\r\n")) {
    issues.push("document does not end with CRLF");
  }

  const body = document.endsWith("\r\n") ? document.slice(0, -2) : document;
  const physicalLines = body.length === 0 ? [] : body.split("\r\n");

  for (const [index, line] of physicalLines.entries()) {
    const octets = Buffer.byteLength(line, "utf8");
    if (octets > 75)
      issues.push(`physical line ${index} is ${octets} octets, over the 75-octet fold limit`);
  }

  // Unfold: a physical line beginning with a single space or tab continues the
  // content line before it, per RFC 5545 §3.1.
  const contentLines: string[] = [];
  for (const line of physicalLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && contentLines.length > 0) {
      contentLines[contentLines.length - 1] += line.slice(1);
    } else {
      contentLines.push(line);
    }
  }

  const componentStack: string[] = [];
  const propertyStack: Record<string, string>[] = [];

  for (const line of contentLines) {
    if (line === "") continue;

    if (line.startsWith("BEGIN:")) {
      componentStack.push(line.slice("BEGIN:".length));
      propertyStack.push({});
      continue;
    }

    if (line.startsWith("END:")) {
      const closed = line.slice("END:".length);
      const opened = componentStack.pop();
      const properties = propertyStack.pop();
      if (opened !== closed) {
        issues.push(
          `END:${closed} does not match the innermost BEGIN:${opened ?? "(nothing open)"}`,
        );
      } else if (properties) {
        issues.push(...checkComponent(closed, properties));
      }
      continue;
    }

    if (!CONTENT_LINE_PATTERN.test(line)) {
      issues.push(`content line is not well-formed: ${JSON.stringify(line)}`);
      continue;
    }

    const colon = line.indexOf(":");
    const name = line.slice(0, colon).split(";")[0]!.toUpperCase();
    const value = line.slice(colon + 1);
    const current = propertyStack[propertyStack.length - 1];
    if (current) current[name] = value;
  }

  if (componentStack.length > 0) {
    issues.push(`unclosed component(s) at end of document: ${componentStack.join(", ")}`);
  }

  return issues;
}

function checkComponent(component: string, properties: Readonly<Record<string, string>>): string[] {
  const issues: string[] = [];
  const required = REQUIRED_PROPERTIES[component];
  if (!required) return issues;

  for (const name of required) {
    if (!(name in properties)) issues.push(`${component} is missing required property ${name}`);
  }

  if (component === "VEVENT") {
    if (properties.SEQUENCE !== undefined && !/^\d+$/.test(properties.SEQUENCE)) {
      issues.push(`VEVENT SEQUENCE is not a non-negative integer: ${properties.SEQUENCE}`);
    }
    if (properties.STATUS !== undefined && !VALID_STATUS_VALUES.has(properties.STATUS)) {
      issues.push(
        `VEVENT STATUS is not one of CONFIRMED/CANCELLED/TENTATIVE: ${properties.STATUS}`,
      );
    }
    for (const field of ["DTSTART", "DTEND"]) {
      const value = properties[field];
      if (value !== undefined && !DATE_OR_UTC_DATETIME_PATTERN.test(value)) {
        issues.push(`VEVENT ${field} is not YYYYMMDD or YYYYMMDDTHHMMSSZ: ${value}`);
      }
    }
  }

  return issues;
}
