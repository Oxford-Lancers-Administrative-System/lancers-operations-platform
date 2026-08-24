// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  ENVIRONMENT_DISPOSITIONS,
  environmentDefects,
  environmentRecordPath,
  newEnvironmentId,
  readEnvironment,
  supervisorAlive,
  writeEnvironment,
} from "../scripts/lib/visual-environment.mjs";
import { coordinatorPaths } from "../scripts/lib/local-supabase-coordinator.mjs";

const roots: string[] = [];
const SHA = "a".repeat(40);
const OTHER = "b".repeat(40);
const NOW = 1_760_000_000_000;
const HOUR = 3_600_000;

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lancers-visual-env-"));
  roots.push(root);
  fs.mkdirSync(path.join(root, ".lancers-runtime"), { recursive: true });
  return root;
}

function pending(overrides: Record<string, unknown> = {}) {
  return {
    environmentId: "env-primary-aaaaaaaaaaaa-0f0f0f0f",
    headSha: SHA,
    url: "http://127.0.0.1:3000",
    slot: "primary",
    applicationPort: 3000,
    disposition: "pending",
    livenessIntervalMs: 60_000,
    startedAt: new Date(NOW).toISOString(),
    lastLiveness: new Date(NOW).toISOString(),
    supervisorPid: 4242,
    ...overrides,
  };
}

const alive = () => true;
const dead = () => {
  throw Object.assign(new Error("missing"), { code: "ESRCH" });
};

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("the pending visual environment record", () => {
  it("round-trips, and reports nothing rather than throwing when there is none", () => {
    const root = fixture();
    expect(readEnvironment(root)).toBeNull();
    const record = pending();
    writeEnvironment(root, record);
    expect(readEnvironment(root)).toEqual(record);
    expect(fs.existsSync(environmentRecordPath(root))).toBe(true);
  });

  it("gives every environment an identity carrying its slot and head", () => {
    const first = newEnvironmentId(SHA, "primary");
    const second = newEnvironmentId(SHA, "primary");
    expect(first).toMatch(/^env-primary-aaaaaaaaaaaa-[0-9a-f]{8}$/);
    expect(first).not.toBe(second);
  });

  it("holds no secret", () => {
    const root = fixture();
    writeEnvironment(root, pending());
    const raw = fs.readFileSync(environmentRecordPath(root), "utf8");
    expect(raw).not.toMatch(/password|secret|key|token/i);
  });
});

describe("visual environment disposition cleanup", () => {
  it.each(["approved", "rejected", "obsolete", "abandoned"])(
    "releases the database lease when disposition becomes %s",
    (disposition) => {
      const root = fixture();
      const coordinatorRoot = path.join(root, "coordinator");
      const token = "fixture-token";
      writeEnvironment(root, pending({ supervisorPid: null }));
      fs.writeFileSync(
        path.join(root, ".lancers-runtime", "lease.json"),
        `${JSON.stringify({ token, slot: "primary" })}\n`,
      );
      const env = { ...process.env, LANCERS_COORDINATOR_ROOT: coordinatorRoot };
      const paths = coordinatorPaths(root, env);
      fs.mkdirSync(path.dirname(paths.registry), { recursive: true });
      fs.writeFileSync(
        paths.registry,
        `${JSON.stringify({
          version: 1,
          slots: {
            primary: {
              slot: "primary",
              token,
              repoPath: fs.realpathSync(root),
              attachedRepoPaths: [],
              state: "review-ready",
            },
          },
        })}\n`,
      );

      const result = spawnSync(
        process.execPath,
        [
          path.join(__dirname, "..", "scripts", "visual-environment.mjs"),
          "disposition",
          "--set",
          disposition,
        ],
        { cwd: root, env, encoding: "utf8" },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toMatch(new RegExp(`is now ${disposition}; released primary`));
      expect(readEnvironment(root)).toEqual(
        expect.objectContaining({ disposition, releasedAt: expect.any(String) }),
      );
      expect(JSON.parse(fs.readFileSync(paths.registry, "utf8")).slots.primary.state).toBe(
        "released",
      );
    },
  );
});

describe("whether Brian can be told an environment is ready", () => {
  /**
   * LAN-148 §B, and the acceptance criterion the first live run failed: the
   * environment has to still be there after the worker has gone and the night
   * has passed. Its supervisor is its own process, so it survives the worker;
   * the eight hours are the part nothing previously covered, because the lease
   * stopped being refreshed the moment the worker exited.
   */
  it("stays ready after its worker exits and eight hours pass", () => {
    const supervised = pending({
      lastLiveness: new Date(NOW + 8 * HOUR - 60_000).toISOString(),
    });
    expect(
      environmentDefects(supervised, {
        headSha: SHA,
        now: NOW + 8 * HOUR,
        probe: alive,
      }),
    ).toEqual([]);
  });

  it("refuses when the supervisor has gone, however recent the record looks", () => {
    expect(
      environmentDefects(pending(), { headSha: SHA, now: NOW, probe: dead }).join("\n"),
    ).toMatch(/supervisor is gone; the application and the lease have no owner/);
  });

  it("refuses an environment that has stopped proving itself live", () => {
    expect(
      environmentDefects(pending(), { headSha: SHA, now: NOW + 6 * 60_000, probe: alive }).join(
        "\n",
      ),
    ).toMatch(/last proof of life was 6 minutes ago/);
    expect(
      environmentDefects(pending({ lastLiveness: null }), {
        headSha: SHA,
        now: NOW,
        probe: alive,
      }).join("\n"),
    ).toMatch(/never proved itself live/);
  });

  /**
   * The failure that is worse than being dead: it looks fine and shows Brian
   * something that is no longer what would merge.
   */
  it("refuses an environment whose branch has moved past the head it serves", () => {
    expect(
      environmentDefects(pending(), { headSha: OTHER, now: NOW, probe: alive }).join("\n"),
    ).toMatch(/Brian would be approving something that is not what would merge/);
  });

  it.each(["approved", "rejected", "obsolete", "abandoned"])(
    "stops offering an environment once it is %s",
    (disposition) => {
      expect(
        environmentDefects(pending({ disposition }), { headSha: SHA, now: NOW, probe: alive }).join(
          "\n",
        ),
      ).toMatch(new RegExp(`is ${disposition}, not pending review`));
    },
  );

  it("refuses a disposition that is not a state", () => {
    expect(
      environmentDefects(pending({ disposition: "probably-fine" }), {
        headSha: SHA,
        now: NOW,
        probe: alive,
      }).join("\n"),
    ).toMatch(/Unknown disposition "probably-fine"/);
    expect(ENVIRONMENT_DISPOSITIONS).toEqual([
      "pending",
      "approved",
      "rejected",
      "obsolete",
      "abandoned",
    ]);
  });

  it("says so plainly when there is no environment at all", () => {
    expect(environmentDefects(null)).toEqual(["No visual environment is recorded."]);
  });
});

describe("two independent visual gates at once", () => {
  /**
   * Two packages whose visual boundaries are genuinely independent — §A's
   * `independent-visual-gate` — have to be reviewable at the same time, or the
   * second one waits for the first to be approved before it can even be looked
   * at. Each worktree carries its own record, its own supervisor process, its
   * own slot and its own head.
   */
  it("keeps distinct identity, process, slot and head, and releasing one leaves the other", () => {
    const first = fixture();
    const second = fixture();
    writeEnvironment(first, pending());
    writeEnvironment(
      second,
      pending({
        environmentId: newEnvironmentId(OTHER, "overflow"),
        headSha: OTHER,
        url: "http://127.0.0.1:3010",
        slot: "overflow",
        applicationPort: 3010,
        supervisorPid: 4343,
      }),
    );

    const a = readEnvironment(first)!;
    const b = readEnvironment(second)!;
    expect(new Set([a.environmentId, b.environmentId]).size).toBe(2);
    expect(new Set([a.supervisorPid, b.supervisorPid]).size).toBe(2);
    expect(new Set([a.slot, b.slot]).size).toBe(2);
    expect(new Set([a.applicationPort, b.applicationPort]).size).toBe(2);
    expect(new Set([a.headSha, b.headSha]).size).toBe(2);

    expect(environmentDefects(a, { headSha: SHA, now: NOW, probe: alive })).toEqual([]);
    expect(environmentDefects(b, { headSha: OTHER, now: NOW, probe: alive })).toEqual([]);

    // Approving the first does not touch the second.
    writeEnvironment(first, { ...a, disposition: "approved" });
    expect(readEnvironment(first)!.disposition).toBe("approved");
    expect(readEnvironment(second)!.disposition).toBe("pending");
    expect(
      environmentDefects(readEnvironment(second)!, {
        headSha: OTHER,
        now: NOW,
        probe: alive,
      }),
    ).toEqual([]);
  });
});

describe("supervisor liveness", () => {
  it("treats permission denial as alive and a missing process as gone", () => {
    expect(supervisorAlive(pending(), alive)).toBe(true);
    expect(supervisorAlive(pending(), dead)).toBe(false);
    expect(
      supervisorAlive(pending(), () => {
        throw Object.assign(new Error("denied"), { code: "EPERM" });
      }),
    ).toBe(true);
    expect(supervisorAlive(pending({ supervisorPid: null }), alive)).toBe(false);
    expect(supervisorAlive(null, alive)).toBe(false);
  });
});
