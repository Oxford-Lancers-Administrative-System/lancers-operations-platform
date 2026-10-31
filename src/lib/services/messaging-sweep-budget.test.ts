// @vitest-environment node
/**
 * LAN-514. The sweep's time budget, pinned: a send the tick starts just before
 * it stops claiming must still finish, or be cut off by its own deadline,
 * inside the request the Cloud Run trigger allows. A larger budget or a longer
 * provider deadline that breaks this leaves jobs `processing` when the request
 * is killed.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { EMAIL_TIMEOUT_MS } from "@/lib/delivery/email";
import { PROVIDER_TIMEOUT_MS } from "@/lib/delivery/whatsapp-cloud";

import { SWEEP_BUDGET_MS, SWEEP_REQUEST_LIMIT_MS } from "./messaging-scheduler";

describe("the messaging sweep's budget", () => {
  it("lets an ordinary send started at the last moment end inside the request", () => {
    const longestOrdinarySend = Math.max(EMAIL_TIMEOUT_MS, PROVIDER_TIMEOUT_MS);
    expect(SWEEP_BUDGET_MS + longestOrdinarySend).toBeLessThanOrEqual(SWEEP_REQUEST_LIMIT_MS);
  });
});
