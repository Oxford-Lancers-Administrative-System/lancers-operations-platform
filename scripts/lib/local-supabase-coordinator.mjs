import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { execFileSync } from "node:child_process";

/**
 * How long a lease may go unrefreshed before another session may reclaim it.
 *
 * LAN-148: reclaim is heartbeat-driven rather than process-driven. Every agent
 * in one Claude session shares that session's process, so a live pid proves
 * nothing about whether the agent that took the lease still exists — see
 * `reclaimable`.
 *
 * The window is long on purpose. Heartbeats are still refreshed by hand, by
 * whichever guarded database command happens to run next, so an agent that
 * spends an hour on a build or waiting for Brian is genuinely working and must
 * not lose its stack. A conclusively dead owning process is reclaimed at once
 * and does not wait this out; the window only covers the case the pid cannot
 * decide. A `review-ready` stack is never reclaimed on a timer; only the
 * conclusive absence of every holding worktree lets cleanup retire it.
 *
 * Shorten this once a supervisor heartbeats continuously rather than a command
 * doing it in passing.
 */
export const LEASE_TTL_MS = 14_400_000;

/** How many mission stacks may exist before allocation refuses. A backstop
 * against a runaway loop, not an operating limit. */
export const MAX_MISSION_SLOTS = 64;

export const SLOT_DEFINITIONS = [
  {
    name: "primary",
    projectId: "lancers-operations-platform-primary",
    applicationPort: 3000,
    ports: {
      api: 54321,
      db: 54322,
      shadow: 54320,
      pooler: 54329,
      studio: 54323,
      mailpit: 54324,
      inspector: 8083,
      analytics: 54327,
    },
  },
  {
    name: "overflow",
    projectId: "lancers-operations-platform-overflow",
    applicationPort: 3010,
    ports: {
      api: 55321,
      db: 55322,
      shadow: 55320,
      pooler: 55329,
      studio: 55323,
      mailpit: 55324,
      inspector: 8183,
      analytics: 55327,
    },
  },
];

const MISSION_PORT_BASE = 56320;
const MISSION_PORT_STRIDE = 20;

/**
 * One mission stack's complete identity at `index`.
 *
 * LAN-148: the name and project id carry the index. They previously did not,
 * so every index produced the same slot name — and a registry that already
 * held a record under that name made the allocation loop below spin forever,
 * holding the allocator lock while it did.
 */
export function missionSlot(missionId, index) {
  const offset = index * MISSION_PORT_STRIDE;
  const slug = missionId.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const digest = crypto.createHash("sha256").update(`${missionId}#${index}`).digest("hex");
  return {
    name: `mission-${slug}-${index}`,
    projectId: `lancers-${slug}-${digest.slice(0, 8)}`,
    applicationPort: 3100 + index,
    ports: {
      api: MISSION_PORT_BASE + offset + 1,
      db: MISSION_PORT_BASE + offset + 2,
      shadow: MISSION_PORT_BASE + offset,
      pooler: MISSION_PORT_BASE + offset + 9,
      studio: MISSION_PORT_BASE + offset + 3,
      mailpit: MISSION_PORT_BASE + offset + 4,
      inspector: MISSION_PORT_BASE + offset + 5,
      analytics: MISSION_PORT_BASE + offset + 7,
    },
  };
}

function lookupProcess(pid) {
  const line = execFileSync("ps", ["-o", "ppid=,comm=", "-p", String(pid)], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  const match = /^(\d+)\s+(.+)$/.exec(line);
  if (!match) throw new Error(`Could not inspect process ${pid}.`);
  return { ppid: Number(match[1]), command: match[2] };
}

export function findOwningSessionPid(startPid = process.ppid, lookup = lookupProcess) {
  let pid = startPid;
  for (let depth = 0; depth < 32 && pid > 1; depth += 1) {
    let processInfo;
    try {
      processInfo = lookup(pid);
    } catch {
      throw new Error(
        "Could not positively identify the owning Claude or Codex session; refusing to acquire a local Supabase lease.",
      );
    }
    if (/(^|\/)(claude|codex)(\s|$)/i.test(processInfo.command)) return pid;
    pid = processInfo.ppid;
  }
  throw new Error(
    "Could not positively identify the owning Claude or Codex session; refusing to acquire a local Supabase lease.",
  );
}

function repositoryIdentity(repoPath) {
  try {
    return execFileSync("git", ["remote", "get-url", "origin"], {
      cwd: repoPath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return path.basename(repoPath);
  }
}

export function coordinatorPaths(repoPath, env = process.env) {
  const identity = crypto
    .createHash("sha256")
    .update(repositoryIdentity(repoPath))
    .digest("hex")
    .slice(0, 16);
  const base =
    env.LANCERS_COORDINATOR_ROOT ||
    path.join(
      env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"),
      "lancers-operations-platform",
    );
  const root = path.join(base, identity);
  return {
    root,
    registry: path.join(root, "leases.json"),
    lock: path.join(root, "allocator.lock"),
  };
}

function emptyRegistry() {
  return { version: 1, slots: {} };
}

function readRegistry(registryPath) {
  try {
    return JSON.parse(fs.readFileSync(registryPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return emptyRegistry();
    throw error;
  }
}

function writeRegistry(registryPath, registry) {
  fs.mkdirSync(path.dirname(registryPath), { recursive: true, mode: 0o700 });
  const temporary = `${registryPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(registry, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, registryPath);
}

export function ownerAlive(pid, probe = process.kill) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    probe(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    return true;
  }
}

/**
 * Refuse to default the owning pid.
 *
 * `reclaimable` reclaims a conclusively dead owner at once, without waiting out
 * the heartbeat window. That is right when the pid is the Claude session's —
 * and catastrophic when it is the pid of the short-lived CLI process that took
 * the lease, because that process exits immediately and the very next acquire
 * would steal a lease seconds old. Both callers pass
 * `findOwningSessionPid()`; defaulting to `process.pid` left that a trap for
 * the next one, so there is no default.
 */
/** @param {string} caller @returns {number} */
function requiredSessionPid(caller) {
  throw new Error(
    `${caller} requires an explicit owning session pid — pass findOwningSessionPid(). Defaulting to this process would make the lease reclaimable the moment the command exits.`,
  );
}

/** A default only fires on `undefined`, so null, 0, -1 and "123" would all slip
 * past it and produce a lease that is stealable a second later. */
function assertSessionPid(pid, caller) {
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(
      `${caller} needs a real owning session pid (got ${JSON.stringify(pid)}) — pass findOwningSessionPid(). A lease whose owner cannot be probed is reclaimable at once.`,
    );
  }
  return pid;
}

/** A lease is demonstrably in use when its heartbeat is inside the window. */
export function leaseLive(record, now) {
  const beat = Date.parse(record?.lastHeartbeat ?? "");
  return Number.isFinite(beat) && now - beat <= LEASE_TTL_MS;
}

/**
 * Whether another session may take this slot.
 *
 * LAN-148 changed the middle rule. A dead owning process is still conclusive
 * and reclaims at once. A *live* one is not conclusive: `findOwningSessionPid`
 * records the Claude session's pid, which every agent under that session
 * shares, so the previous "expired **and** owner dead" rule meant an abandoned
 * lease was never recoverable while the editor stayed open — which is what
 * leaked slots through the first live mission. Heartbeat freshness is the only
 * honest liveness signal available, so it decides. `review-ready` is exempt on
 * purpose: it is protected until its owner releases it.
 */
function reclaimable(record, now, probe) {
  if (!record || record.state === "released" || record.state === "stale") return true;
  if (["review-ready", "retiring"].includes(record.state)) return false;
  if (!ownerAlive(record.owner?.pid, probe)) return true;
  return !leaseLive(record, now);
}

function portIsOccupied(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const finish = (occupied) => {
      socket.destroy();
      resolve(occupied);
    };
    socket.setTimeout(200);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

/**
 * The allocator lock. Every body passed here must be bounded and fast: it is a
 * machine-wide mutex, and LAN-148 removed the one caller that awaited network
 * probes — and, before its loop was bounded, awaited them forever — inside it.
 */
async function withAllocatorLock(paths, action) {
  fs.mkdirSync(paths.root, { recursive: true, mode: 0o700 });
  const deadline = Date.now() + 10_000;
  while (true) {
    try {
      fs.mkdirSync(paths.lock);
      break;
    } catch (error) {
      if (error.code !== "EEXIST" || Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  try {
    return await action();
  } finally {
    fs.rmdirSync(paths.lock);
  }
}

function stopSupabaseProject(repoPath, record) {
  const configRoot = path.join(repoPath, ".lancers-runtime", "xdg");
  fs.mkdirSync(configRoot, { recursive: true, mode: 0o700 });
  execFileSync(
    path.join(repoPath, "node_modules", ".bin", "supabase"),
    ["stop", "--no-backup", "--project-id", record.projectId],
    {
      cwd: repoPath,
      env: { ...process.env, XDG_CONFIG_HOME: configRoot, SUPABASE_TELEMETRY_DISABLED: "1" },
      stdio: "ignore",
    },
  );
}

async function retireRecord({
  repoPath,
  select,
  authorize,
  now,
  env,
  stopProject = stopSupabaseProject,
}) {
  const resolvedRepo = fs.realpathSync(repoPath);
  const paths = coordinatorPaths(resolvedRepo, env);
  const claimed = await withAllocatorLock(paths, () => {
    const registry = readRegistry(paths.registry);
    const record = Object.values(registry.slots).find(select);
    if (!record) throw new Error("Missing, invalid, or stale local Supabase ownership token.");
    authorize(record, resolvedRepo);
    if (record.state === "retiring" && leaseLive(record, now)) {
      throw new Error(`${record.slot} retirement is already in progress.`);
    }
    const previousState = record.state;
    record.state = "retiring";
    record.lastHeartbeat = new Date(now).toISOString();
    writeRegistry(paths.registry, registry);
    return { ...record, previousState };
  });

  try {
    await stopProject(resolvedRepo, claimed);
  } catch (error) {
    await withAllocatorLock(paths, () => {
      const registry = readRegistry(paths.registry);
      const record = registry.slots[claimed.slot];
      if (record?.token === claimed.token && record.state === "retiring") {
        record.state = claimed.previousState;
        writeRegistry(paths.registry, registry);
      }
    });
    throw error;
  }

  return withAllocatorLock(paths, () => {
    const registry = readRegistry(paths.registry);
    const record = registry.slots[claimed.slot];
    if (record?.token !== claimed.token || record.state !== "retiring") {
      throw new Error(`${claimed.slot} changed owners while it was retiring.`);
    }
    const retired = {
      ...record,
      state: "released",
      stoppedAt: new Date(now).toISOString(),
      appliedConfig: null,
    };
    if (record.missionId) delete registry.slots[record.slot];
    else registry.slots[record.slot] = retired;
    writeRegistry(paths.registry, registry);
    return retired;
  });
}

/**
 * The same URL, served by this slot's application port. Anything that will not
 * parse is passed through untouched rather than silently mangled.
 */
function reportedUrl(url, applicationPort) {
  try {
    const parsed = new URL(url);
    parsed.port = String(applicationPort);
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}

function renderConfig(source, slot) {
  let section = "";
  return source
    .split("\n")
    .map((line) => {
      const heading = /^\[([^\]]+)\]/.exec(line);
      if (heading) section = heading[1];
      if (/^project_id\s*=/.test(line)) return `project_id = "${slot.projectId}"`;
      const portBySection = {
        api: "api",
        db: "db",
        "db.pooler": "pooler",
        studio: "studio",
        local_smtp: "mailpit",
        analytics: "analytics",
      };
      if (/^port\s*=/.test(line) && portBySection[section])
        return `port = ${slot.ports[portBySection[section]]}`;
      if (section === "db" && /^shadow_port\s*=/.test(line))
        return `shadow_port = ${slot.ports.shadow}`;
      if (section === "edge_runtime" && /^inspector_port\s*=/.test(line))
        return `inspector_port = ${slot.ports.inspector}`;
      if (/^site_url\s*=/.test(line))
        return `site_url = "http://localhost:${slot.applicationPort}"`;
      // LAN-125. Re-port each allow-listed URL and keep its path. Rewriting the
      // line to a fixed pair of bare origins — which is what this did — silently
      // dropped the exact `/auth/recovery` destinations the tracked config
      // lists, and Supabase substitutes site_url for a destination it does not
      // recognise, so every recovery link would have landed on the sign-in page.
      // The tracked config stays the single source of which paths are allowed.
      if (/^additional_redirect_urls\s*=/.test(line)) {
        const urls = [...line.matchAll(/"([^"]+)"/g)].map(([, url]) =>
          reportedUrl(url, slot.applicationPort),
        );
        return `additional_redirect_urls = [${urls.map((url) => `"${url}"`).join(", ")}]`;
      }
      return line;
    })
    .join("\n");
}

export function prepareRuntime(repoPath, slot) {
  const runtimeRoot = path.join(repoPath, ".lancers-runtime", slot.name ?? slot.slot);
  const runtimeSupabase = path.join(runtimeRoot, "supabase");
  fs.mkdirSync(runtimeSupabase, { recursive: true, mode: 0o700 });
  const tracked = path.join(repoPath, "supabase");
  fs.writeFileSync(
    path.join(runtimeSupabase, "config.toml"),
    renderConfig(fs.readFileSync(path.join(tracked, "config.toml"), "utf8"), slot),
  );
  // `templates` joins the list for LAN-125: `[auth.email.template.recovery]`
  // resolves `content_path` relative to the config file, and the config file the
  // CLI reads is this generated copy. Without the link Supabase falls back to
  // its built-in recovery email, whose link shape this application cannot
  // complete — and it does so without an error.
  for (const entry of ["migrations", "seed.sql", "templates"]) {
    const target = path.join(runtimeSupabase, entry);
    fs.rmSync(target, { recursive: true, force: true });
    fs.symlinkSync(path.join(tracked, entry), target);
  }
  return runtimeRoot;
}

/**
 * A fingerprint of the configuration this slot would run with right now.
 *
 * LAN-148: `supabase start` against containers that are already up is a no-op,
 * and `db reset` rebuilds the database without restarting Auth. So a re-fenced
 * running stack keeps the previous holder's `site_url` and redirect allow-list
 * while every rendered file on disk says otherwise. Recording what was actually
 * applied, and comparing it before readiness, is what makes that visible.
 */
export function renderedConfigFingerprint(repoPath, slot) {
  const rendered = path.join(
    repoPath,
    ".lancers-runtime",
    slot.name ?? slot.slot,
    "supabase",
    "config.toml",
  );
  return crypto.createHash("sha256").update(fs.readFileSync(rendered, "utf8")).digest("hex");
}

/** @param {{issueId: string, repoPath: string, pid?: number, now?: number, env?: NodeJS.ProcessEnv, probe?: (pid: number, signal: number) => unknown, portProbe?: (port: number) => Promise<boolean>}} input */
export async function acquireLease({
  issueId,
  repoPath,
  pid = requiredSessionPid("acquireLease"),
  now = Date.now(),
  env = process.env,
  probe = process.kill,
  portProbe = portIsOccupied,
}) {
  if (!/^LAN-\d+$/.test(issueId))
    throw new Error("A single Linear issue identifier such as LAN-112 is required.");
  assertSessionPid(pid, "acquireLease");
  const resolvedRepo = fs.realpathSync(repoPath);
  const paths = coordinatorPaths(resolvedRepo, env);

  // Probe outside the lock. There are exactly two slots, so this is bounded,
  // and holding a machine-wide mutex across network timeouts is what LAN-148
  // set out to remove.
  const occupancy = new Map();
  for (const candidate of SLOT_DEFINITIONS) {
    const occupied = await Promise.all(Object.values(candidate.ports).map(portProbe));
    occupancy.set(candidate.name, occupied.some(Boolean));
  }

  return withAllocatorLock(paths, async () => {
    const registry = readRegistry(paths.registry);
    for (const slot of SLOT_DEFINITIONS) {
      const existing = registry.slots[slot.name];
      // Resume this worktree's own lease. Identity is the issue and the
      // worktree, not the pid: every agent in one Claude session shares that
      // pid, and a restarted session would otherwise abandon its own stack.
      if (
        existing?.issueId === issueId &&
        existing.repoPath === resolvedRepo &&
        ["active", "review-ready"].includes(existing.state)
      ) {
        existing.lastHeartbeat = new Date(now).toISOString();
        writeRegistry(paths.registry, registry);
        writeSession(resolvedRepo, existing);
        return { ...existing, resumed: true };
      }
    }
    let slot;
    for (const candidate of SLOT_DEFINITIONS) {
      const previous = registry.slots[candidate.name];
      if (!reclaimable(previous, now, probe)) continue;
      // An interrupted holder may leave its known local containers running.
      // Those ports belong
      // to this slot's own project id, so re-fence it to the next owner, who
      // restarts it under their own configuration before use. Only a
      // never-allocated slot is genuinely ambiguous, and it still fails closed
      // rather than risking an unrelated process.
      //
      // LAN-148: only "released" counted here, which made recovery impossible
      // in the one case it matters — an owner that died without stopping its
      // stack, leaving the slot's own containers holding the slot's own ports.
      // Any record at all means this coordinator allocated these ports to this
      // project id; a slot with no record is the only genuinely ambiguous one.
      if (!previous && occupancy.get(candidate.name)) continue;
      slot = candidate;
      break;
    }
    if (!slot) return null;
    const token = crypto.randomBytes(32).toString("hex");
    const sessionId = crypto.randomUUID();
    const runtimeRoot = prepareRuntime(resolvedRepo, slot);
    const record = {
      issueId,
      repoPath: resolvedRepo,
      owner: { pid, sessionId, startedAt: new Date(now).toISOString() },
      token,
      lastHeartbeat: new Date(now).toISOString(),
      state: "active",
      slot: slot.name,
      projectId: slot.projectId,
      ports: slot.ports,
      applicationPort: slot.applicationPort,
      runtimeRoot,
      // A new holder has applied nothing yet. Whatever the containers are
      // running belongs to the previous one until this slot is started again.
      appliedConfig: null,
    };
    registry.slots[slot.name] = record;
    writeRegistry(paths.registry, registry);
    writeSession(resolvedRepo, record);
    return record;
  });
}

/**
 * Allocate one mission-owned stack. The allocator lock prevents duplicate
 * identities and ports; it is taken twice, briefly, with the port probes
 * between — it never limits how many missions may exist and never spans a
 * slow wait.
 */
export async function acquireMissionLease({
  missionId,
  repoPath,
  baseCommit,
  migrationHead,
  pid = requiredSessionPid("acquireMissionLease"),
  now = Date.now(),
  env = process.env,
  portProbe = portIsOccupied,
}) {
  if (!/^M-[A-Za-z0-9][A-Za-z0-9-]*$/.test(missionId)) {
    throw new Error("A mission identifier such as M-2026-08-pilot is required.");
  }
  if (!/^[0-9a-f]{40}$/.test(baseCommit ?? "") || !/^\d+$/.test(String(migrationHead ?? ""))) {
    throw new Error("Mission allocation records a full base commit and numeric migration head.");
  }
  assertSessionPid(pid, "acquireMissionLease");
  const resolvedRepo = fs.realpathSync(repoPath);
  const paths = coordinatorPaths(resolvedRepo, env);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const step = await withAllocatorLock(paths, () => {
      const registry = readRegistry(paths.registry);
      const existing = Object.values(registry.slots).find(
        (record) => record.missionId === missionId,
      );
      if (existing && !["released", "stale"].includes(existing.state)) {
        existing.lastHeartbeat = new Date(now).toISOString();
        writeRegistry(paths.registry, registry);
        writeSession(resolvedRepo, existing);
        return { record: { ...existing, resumed: true } };
      }
      if (existing) {
        // Compatibility for records written before retirement began deleting
        // disposable mission entries. Re-fence it in place rather than loop.
        existing.token = crypto.randomBytes(32).toString("hex");
        existing.owner = {
          pid,
          sessionId: crypto.randomUUID(),
          startedAt: new Date(now).toISOString(),
        };
        existing.lastHeartbeat = new Date(now).toISOString();
        existing.state = "active";
        existing.baseCommit = baseCommit;
        existing.migrationHead = Number(migrationHead);
        existing.attachedRepoPaths = [resolvedRepo];
        existing.appliedConfig = null;
        existing.runtimeRoot = prepareRuntime(resolvedRepo, existing);
        writeRegistry(paths.registry, registry);
        writeSession(resolvedRepo, existing);
        return { record: { ...existing, refenced: true } };
      }

      const allocatedPorts = new Set(
        Object.values(registry.slots).flatMap((record) => [
          ...Object.values(record.ports),
          record.applicationPort,
        ]),
      );
      const candidates = [];
      for (let index = 0; index < MAX_MISSION_SLOTS && candidates.length < 4; index += 1) {
        const candidate = missionSlot(missionId, index);
        if (registry.slots[candidate.name]) continue;
        const wanted = [...Object.values(candidate.ports), candidate.applicationPort];
        if (wanted.some((port) => allocatedPorts.has(port))) continue;
        candidates.push(candidate);
      }
      return { candidates };
    });

    if (step.record) return step.record;
    if (step.candidates.length === 0) {
      throw new Error(
        `No mission database slot is available for ${missionId} within ${MAX_MISSION_SLOTS} indices; release a finished mission stack first.`,
      );
    }

    let free;
    for (const candidate of step.candidates) {
      const occupied = await Promise.all(
        [...Object.values(candidate.ports), candidate.applicationPort].map(portProbe),
      );
      if (!occupied.some(Boolean)) {
        free = candidate;
        break;
      }
    }
    if (!free) {
      throw new Error(
        `Every candidate mission stack for ${missionId} has occupied ports; refusing to attach to a process this coordinator does not own.`,
      );
    }

    const claimed = await withAllocatorLock(paths, () => {
      const registry = readRegistry(paths.registry);
      if (registry.slots[free.name]) return null;
      // The slot *name* carries the mission id, so two different missions both
      // choosing index 0 pass the name check while colliding on every port —
      // ports are derived from the index alone. Phase 1's port check was taken
      // before the probe released the lock, so it is stale by now. Re-check it
      // here, under the lock that actually claims, and let the loop re-select.
      const taken = new Set(
        Object.values(registry.slots).flatMap((record) => [
          ...Object.values(record.ports),
          record.applicationPort,
        ]),
      );
      const wanted = [...Object.values(free.ports), free.applicationPort];
      if (wanted.some((port) => taken.has(port))) return null;
      const token = crypto.randomBytes(32).toString("hex");
      const runtimeRoot = prepareRuntime(resolvedRepo, free);
      const record = {
        missionId,
        repoPath: resolvedRepo,
        attachedRepoPaths: [resolvedRepo],
        baseCommit,
        migrationHead: Number(migrationHead),
        owner: { pid, sessionId: crypto.randomUUID(), startedAt: new Date(now).toISOString() },
        token,
        lastHeartbeat: new Date(now).toISOString(),
        state: "active",
        slot: free.name,
        projectId: free.projectId,
        ports: free.ports,
        applicationPort: free.applicationPort,
        runtimeRoot,
        appliedConfig: null,
      };
      registry.slots[free.name] = record;
      writeRegistry(paths.registry, registry);
      writeSession(resolvedRepo, record);
      return record;
    });
    if (claimed) return claimed;
  }
  throw new Error(
    `Could not allocate a mission database stack for ${missionId} under contention; retry.`,
  );
}

function writeSession(repoPath, record) {
  const sessionDir = path.join(repoPath, ".lancers-runtime");
  fs.mkdirSync(sessionDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    path.join(sessionDir, "lease.json"),
    `${JSON.stringify({ slot: record.slot, token: record.token, sessionId: record.owner?.sessionId ?? null }, null, 2)}\n`,
    { mode: 0o600 },
  );
}

export async function attachMissionLease({ missionId, repoPath, token, env = process.env }) {
  const resolvedRepo = fs.realpathSync(repoPath);
  const paths = coordinatorPaths(resolvedRepo, env);
  return withAllocatorLock(paths, () => {
    const registry = readRegistry(paths.registry);
    const record = Object.values(registry.slots).find((candidate) => candidate.token === token);
    if (!record || record.missionId !== missionId || record.state !== "active") {
      throw new Error("Missing, invalid, stale, or mismatched mission database token.");
    }
    if (!record.attachedRepoPaths.includes(resolvedRepo))
      record.attachedRepoPaths.push(resolvedRepo);
    writeRegistry(paths.registry, registry);
    writeSession(resolvedRepo, record);
    return record;
  });
}

/**
 * Detach one worktree from a mission stack, and say whether it was the last.
 *
 * A mission stack is shared: several workers attach to it, and it may only be
 * torn down when the last attached package has finished with it. Tearing it
 * down under a sibling worker is the mission-scale version of the leak LAN-148
 * fixed at the slot scale, so the caller is told rather than left to guess.
 */
export async function detachMissionLease({ missionId, repoPath, env = process.env }) {
  const resolvedRepo = fs.realpathSync(repoPath);
  const paths = coordinatorPaths(resolvedRepo, env);
  return withAllocatorLock(paths, () => {
    const registry = readRegistry(paths.registry);
    const record = Object.values(registry.slots).find(
      (candidate) => candidate.missionId === missionId,
    );
    if (!record) throw new Error(`No mission stack is recorded for ${missionId}.`);
    const attached = record.attachedRepoPaths ?? [];
    const remaining = attached.filter((entry) => entry !== resolvedRepo);
    record.attachedRepoPaths = remaining;
    writeRegistry(paths.registry, registry);
    return {
      slot: record.slot,
      missionId,
      detached: attached.length !== remaining.length,
      remaining,
      // Only the acquiring worktree may retire the stack, and only once every
      // attached worker has let go of it.
      lastAttachment: remaining.length === 0,
      ownsStack: record.repoPath === resolvedRepo,
    };
  });
}

export function readSession(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repoPath, ".lancers-runtime", "lease.json"), "utf8"));
}

/**
 * Every holder of this token: the acquiring worktree and any attached one.
 *
 * This is the right test for *using* a stack — heartbeats, state changes,
 * recording an applied config. It is deliberately not the test for releasing
 * one: see `releaseLease`.
 */
function holds(record, resolvedRepo) {
  return (
    record.repoPath === resolvedRepo || Boolean(record.attachedRepoPaths?.includes(resolvedRepo))
  );
}

/** @param {{repoPath: string, token: string, state?: "active"|"review-ready", now?: number, env?: NodeJS.ProcessEnv}} input */
export async function updateLease({
  repoPath,
  token,
  state = undefined,
  now = Date.now(),
  env = process.env,
}) {
  const resolvedRepo = fs.realpathSync(repoPath);
  const paths = coordinatorPaths(resolvedRepo, env);
  return withAllocatorLock(paths, () => {
    const registry = readRegistry(paths.registry);
    const record = Object.values(registry.slots).find((candidate) => candidate.token === token);
    if (!record || !holds(record, resolvedRepo))
      throw new Error("Missing, invalid, or stale local Supabase ownership token.");
    if (!["active", "review-ready"].includes(record.state))
      throw new Error(`Lease is ${record.state}; database mutation is refused.`);
    if (state) record.state = state;
    record.lastHeartbeat = new Date(now).toISOString();
    writeRegistry(paths.registry, registry);
    return record;
  });
}

/**
 * Record that the running stack now holds this rendered configuration.
 * Called by the guarded database command once the stack has actually been
 * started with it — never on the strength of the files alone.
 */
export async function markConfigApplied({
  repoPath,
  token,
  fingerprint,
  now = Date.now(),
  env = process.env,
}) {
  const resolvedRepo = fs.realpathSync(repoPath);
  const paths = coordinatorPaths(resolvedRepo, env);
  return withAllocatorLock(paths, () => {
    const registry = readRegistry(paths.registry);
    const record = Object.values(registry.slots).find((candidate) => candidate.token === token);
    if (!record || !holds(record, resolvedRepo))
      throw new Error("Missing, invalid, or stale local Supabase ownership token.");
    record.appliedConfig = fingerprint;
    record.lastHeartbeat = new Date(now).toISOString();
    writeRegistry(paths.registry, registry);
    return record;
  });
}

/**
 * Refuse readiness when the containers are not running the configuration this
 * holder rendered. The failure this prevents is invisible from the filesystem:
 * a re-fenced stack serving the previous holder's Auth redirect allow-list.
 */
export function assertConfigApplied(repoPath, record) {
  const fingerprint = renderedConfigFingerprint(repoPath, record);
  if (!record.appliedConfig) {
    throw new Error(
      `${record.slot} has not been started under this holder's configuration. Run the guarded start so Auth applies it, then retry.`,
    );
  }
  if (record.appliedConfig !== fingerprint) {
    throw new Error(
      `${record.slot} is running a different configuration from the one rendered for it; Auth would still serve the previous site URL and redirect allow-list. Restart the stack, then retry.`,
    );
  }
  return fingerprint;
}

/**
 * Release exactly the record this session holds.
 *
 * LAN-148: the token alone used to select the record, and only the acquiring
 * repository path was checked. A session whose `lease.json` named a different
 * slot — a stale file, a copied worktree — could therefore release, and report
 * releasing, a record that was not the one it held. The session's own slot must
 * agree with the record the token selects.
 */
/** @param {{repoPath: string, token: string, slot?: string, now?: number, env?: NodeJS.ProcessEnv, stopProject?: (repoPath: string, record: object) => unknown}} input */
export async function releaseLease({
  repoPath,
  token,
  slot = undefined,
  now = Date.now(),
  env = process.env,
  stopProject = stopSupabaseProject,
}) {
  return retireRecord({
    repoPath,
    select: (record) => record.token === token,
    authorize(record, resolvedRepo) {
      // Using a shared stack and retiring one are different rights. A mission
      // stack is attached to by several workers, and a worker running
      // `db:release` or `visual:release` must not drop the whole mission's
      // lease — least of all a protected `review-ready` one, which would lock
      // out every sibling and the Lead. An attached worktree lets go with
      // `detachMissionLease`; only the worktree that acquired the record may
      // release it.
      if (record.repoPath !== resolvedRepo) {
        throw new Error(
          `${record.slot} was acquired by another worktree; this one is attached to it, not its owner. Detach instead of releasing.`,
        );
      }
      if (slot !== undefined && slot !== record.slot) {
        throw new Error(
          `This session records slot ${slot}, but its token belongs to ${record.slot}; refusing to release a slot this session does not hold.`,
        );
      }
      const otherAttachments = (record.attachedRepoPaths ?? []).filter(
        (candidate) => candidate !== resolvedRepo,
      );
      if (record.missionId && otherAttachments.length > 0) {
        throw new Error(
          `${record.slot} still has ${otherAttachments.length} attached worktree(s); detaching one holder may not retire their shared stack.`,
        );
      }
    },
    now,
    env,
    stopProject,
  });
}

export async function retireMissionLease({
  missionId,
  repoPath,
  now = Date.now(),
  env = process.env,
  stopProject = stopSupabaseProject,
}) {
  return retireRecord({
    repoPath,
    select: (record) => record.missionId === missionId,
    authorize(record) {
      if ((record.attachedRepoPaths ?? []).length > 0) {
        throw new Error(`${record.slot} still has attached worktrees; refusing to retire it.`);
      }
    },
    now,
    env,
    stopProject,
  });
}

export async function cleanupStale({
  repoPath,
  now = Date.now(),
  env = process.env,
  probe = process.kill,
  stopProject = stopSupabaseProject,
}) {
  const paths = coordinatorPaths(repoPath, env);
  const eligible = (record) => {
    const holderPaths = [record.repoPath, ...(record.attachedRepoPaths ?? [])].filter(Boolean);
    const orphaned = holderPaths.length > 0 && holderPaths.every((entry) => !fs.existsSync(entry));
    const liveAttachment = (record.attachedRepoPaths ?? []).some(
      (entry) => fs.existsSync(entry) && leaseLive(record, now),
    );
    return (
      orphaned ||
      record.state === "stale" ||
      (record.state === "released" && !record.stoppedAt) ||
      (record.state === "active" && !liveAttachment && reclaimable(record, now, probe)) ||
      (record.state === "retiring" && !leaseLive(record, now))
    );
  };
  const tokens = await withAllocatorLock(paths, () => {
    const registry = readRegistry(paths.registry);
    return Object.values(registry.slots)
      .filter(eligible)
      .map((record) => record.token);
  });
  const changed = [];
  for (const token of tokens) {
    const retired = await retireRecord({
      repoPath,
      select: (record) => record.token === token,
      authorize(record) {
        if (!eligible(record)) throw new Error(`${record.slot} is no longer eligible for cleanup.`);
      },
      now,
      env,
      stopProject,
    });
    changed.push(retired.slot);
  }
  return changed;
}

export function coordinatorStatus(repoPath, env = process.env) {
  const paths = coordinatorPaths(repoPath, env);
  return readRegistry(paths.registry);
}
