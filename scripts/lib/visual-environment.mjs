import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

/**
 * The durable record of one pending visual environment (LAN-148 §B).
 *
 * The first live mission handed Brian review URLs that were dead by the time he
 * opened them: the application was a child of the worker's process, so it went
 * when the worker did, and the database lease stopped being refreshed at the
 * same moment. Nothing owned the environment between "the agent finished" and
 * "Brian looked", which is precisely the interval the environment exists for.
 *
 * A supervisor owns it instead — its own detached process, holding the app and
 * refreshing the lease — and this file is what the supervisor and everything
 * else agree about. It is machine-local, never committed, and holds no secret:
 * the review password stays in the coordinator's protected state.
 */
export function environmentRecordPath(repoPath) {
  return path.join(repoPath, ".lancers-runtime", "visual-environment.json");
}

export function newEnvironmentId(headSha, slot) {
  return `env-${slot}-${headSha.slice(0, 12)}-${crypto.randomBytes(4).toString("hex")}`;
}

export function readEnvironment(repoPath) {
  try {
    return JSON.parse(fs.readFileSync(environmentRecordPath(repoPath), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export function writeEnvironment(repoPath, record) {
  const file = environmentRecordPath(repoPath);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  return record;
}

/** The dispositions an environment can reach. Anything else is not a state. */
export const ENVIRONMENT_DISPOSITIONS = [
  "pending",
  "approved",
  "rejected",
  "obsolete",
  "abandoned",
];

/**
 * Whether the supervisor is still there. A supervisor has its own pid — unlike
 * a database lease, this is not a shared session process, so the probe means
 * what it says.
 */
/** Signal 0 against a pid: the standard "is it there" probe, widened so a test
 * can substitute one. @type {(pid: number, signal?: string | number) => unknown} */
const supervisorProbe = (pid, signal = 0) => process.kill(pid, signal);

/**
 * @param {Record<string, any> | null} record
 * @param {(pid: number, signal?: string | number) => unknown} [probe]
 */
export function supervisorAlive(record, probe = supervisorProbe) {
  if (!record || !Number.isInteger(record.supervisorPid)) return false;
  try {
    probe(record.supervisorPid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    return true;
  }
}

/**
 * Is this environment still the thing it claims to be? An environment that has
 * outlived its own head SHA is worse than a dead one: it looks fine and shows
 * Brian something that is no longer what would merge.
 */
export function environmentDefects(
  record,
  { headSha = "", now = Date.now(), probe = supervisorProbe } = {},
) {
  const defects = [];
  if (!record) return ["No visual environment is recorded."];
  if (!ENVIRONMENT_DISPOSITIONS.includes(record.disposition)) {
    defects.push(`Unknown disposition "${record.disposition}".`);
  }
  if (record.disposition !== "pending") {
    defects.push(`The environment is ${record.disposition}, not pending review.`);
  }
  if (!supervisorAlive(record, probe)) {
    defects.push("Its supervisor is gone; the application and the lease have no owner.");
  }
  if (headSha && record.headSha !== headSha) {
    defects.push(
      `It serves ${record.headSha}, but the branch is now at ${headSha}. Brian would be approving something that is not what would merge.`,
    );
  }
  const beat = Date.parse(record.lastLiveness ?? "");
  if (!Number.isFinite(beat)) {
    defects.push("It has never proved itself live.");
  } else if (now - beat > (record.livenessIntervalMs ?? 60_000) * 5) {
    defects.push(
      `Its last proof of life was ${Math.round((now - beat) / 60_000)} minutes ago; the supervisor is not checking it.`,
    );
  }
  return defects;
}
