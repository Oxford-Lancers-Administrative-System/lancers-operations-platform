import { describe, expect, it } from "vitest";

import {
  attachmentsFit,
  clubMessageParagraphs,
  draftProblems,
  encodedAttachmentBytes,
  formatMegabytes,
  MAX_ATTACHMENT_BYTES,
  RESEND_ENCODED_EMAIL_LIMIT_BYTES,
} from "./club-message-input";

const NOW = new Date("2026-10-29T12:00:00Z");

function draft(patch: Partial<Parameters<typeof draftProblems>[0]> = {}) {
  return {
    subject: "Playbook",
    body: "Here is this week's playbook.",
    attachmentSizes: [],
    scheduledFor: null,
    ...patch,
  };
}

describe("LAN-514 — what one email may carry", () => {
  it("caps one message's files at 20 MB, well inside Resend's 40 MB after encoding", () => {
    expect(RESEND_ENCODED_EMAIL_LIMIT_BYTES).toBe(40_000_000);
    expect(MAX_ATTACHMENT_BYTES).toBe(20_000_000);
    expect(encodedAttachmentBytes([MAX_ATTACHMENT_BYTES])).toBeLessThan(
      RESEND_ENCODED_EMAIL_LIMIT_BYTES,
    );
    expect(formatMegabytes(MAX_ATTACHMENT_BYTES)).toBe("20.0 MB");
  });

  it("takes 10 MB and exactly 20 MB, and refuses anything over 20 MB together", () => {
    expect(attachmentsFit([10_000_000])).toBe(true);
    expect(attachmentsFit([MAX_ATTACHMENT_BYTES])).toBe(true);
    expect(attachmentsFit([10_000_000, 10_000_000])).toBe(true);
    expect(attachmentsFit([MAX_ATTACHMENT_BYTES + 1])).toBe(false);
    expect(attachmentsFit([10_000_000, 10_000_001])).toBe(false);
    expect(attachmentsFit([15_000_000, 15_000_000])).toBe(false);
  });

  it("refuses an oversized draft with the size problem, and nothing else", () => {
    expect(draftProblems(draft({ attachmentSizes: [12_000_000, 9_000_000] }), NOW)).toEqual([
      "attachments_too_large",
    ]);
  });

  it("asks for a subject and a body, and for a future time when scheduled", () => {
    expect(
      draftProblems(
        draft({ subject: " ", body: "", scheduledFor: new Date("2026-10-29T11:00:00Z") }),
        NOW,
      ),
    ).toEqual(["subject_missing", "body_missing", "schedule_in_past"]);
    expect(draftProblems(draft({ scheduledFor: new Date("2026-10-30T09:00:00Z") }), NOW)).toEqual(
      [],
    );
  });

  it("refuses more than ten files", () => {
    expect(draftProblems(draft({ attachmentSizes: Array(11).fill(1000) }), NOW)).toEqual([
      "too_many_attachments",
    ]);
  });

  it("writes sizes in decimal megabytes, as the limit is stated", () => {
    expect(formatMegabytes(12_400_000)).toBe("12.4 MB");
    expect(formatMegabytes(5_000)).toBe("0.1 MB");
    expect(formatMegabytes(0)).toBe("0.0 MB");
  });

  it("sends the body one paragraph per non-blank line, as typed", () => {
    expect(clubMessageParagraphs("Hello all,\n\nPlaybook attached.\r\n  \nKirsty")).toEqual([
      "Hello all,",
      "Playbook attached.",
      "Kirsty",
    ]);
  });
});
