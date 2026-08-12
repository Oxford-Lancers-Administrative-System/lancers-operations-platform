import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { execFileSync } from "node:child_process";

export const LEASE_TTL_MS = 120_000;

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

function ownerAlive(pid, probe = process.kill) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    probe(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    return true;
  }
}

function reclaimable(record, now, probe) {
  if (!record || record.state === "released" || record.state === "stale") return true;
  if (record.state === "review-ready") return false;
  const expired = now - Date.parse(record.lastHeartbeat) > LEASE_TTL_MS;
  return expired && !ownerAlive(record.owner.pid, probe);
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
      if (/^additional_redirect_urls\s*=/.test(line))
        return `additional_redirect_urls = ["http://localhost:${slot.applicationPort}", "http://127.0.0.1:${slot.applicationPort}"]`;
      return line;
    })
    .join("\n");
}

export function prepareRuntime(repoPath, slot) {
  const runtimeRoot = path.join(repoPath, ".lancers-runtime", slot.name);
  const runtimeSupabase = path.join(runtimeRoot, "supabase");
  fs.mkdirSync(runtimeSupabase, { recursive: true, mode: 0o700 });
  const tracked = path.join(repoPath, "supabase");
  fs.writeFileSync(
    path.join(runtimeSupabase, "config.toml"),
    renderConfig(fs.readFileSync(path.join(tracked, "config.toml"), "utf8"), slot),
  );
  for (const entry of ["migrations", "seed.sql"]) {
    const target = path.join(runtimeSupabase, entry);
    fs.rmSync(target, { recursive: true, force: true });
    fs.symlinkSync(path.join(tracked, entry), target);
  }
  return runtimeRoot;
}

/** @param {{issueId: string, repoPath: string, pid?: number, now?: number, env?: NodeJS.ProcessEnv, probe?: (pid: number, signal: number) => unknown, portProbe?: (port: number) => Promise<boolean>}} input */
export async function acquireLease({
  issueId,
  repoPath,
  pid = process.pid,
  now = Date.now(),
  env = process.env,
  probe = process.kill,
  portProbe = portIsOccupied,
}) {
  if (!/^LAN-\d+$/.test(issueId))
    throw new Error("A single Linear issue identifier such as LAN-112 is required.");
  const resolvedRepo = fs.realpathSync(repoPath);
  const paths = coordinatorPaths(resolvedRepo, env);
  return withAllocatorLock(paths, async () => {
    const registry = readRegistry(paths.registry);
    for (const slot of SLOT_DEFINITIONS) {
      const existing = registry.slots[slot.name];
      if (
        existing?.issueId === issueId &&
        existing.repoPath === resolvedRepo &&
        existing.owner.pid === pid &&
        ["active", "review-ready"].includes(existing.state)
      ) {
        return { ...existing, resumed: true };
      }
    }
    let slot;
    for (const candidate of SLOT_DEFINITIONS) {
      if (!reclaimable(registry.slots[candidate.name], now, probe)) continue;
      const occupied = await Promise.all(Object.values(candidate.ports).map(portProbe));
      if (occupied.some(Boolean)) continue;
      slot = candidate;
      break;
    }
    if (!slot) return null;
    const token = crypto.randomBytes(32).toString("hex");
    const runtimeRoot = prepareRuntime(resolvedRepo, slot);
    const record = {
      issueId,
      repoPath: resolvedRepo,
      owner: { pid, startedAt: new Date(now).toISOString() },
      token,
      lastHeartbeat: new Date(now).toISOString(),
      state: "active",
      slot: slot.name,
      projectId: slot.projectId,
      ports: slot.ports,
      applicationPort: slot.applicationPort,
      runtimeRoot,
    };
    registry.slots[slot.name] = record;
    writeRegistry(paths.registry, registry);
    const sessionDir = path.join(resolvedRepo, ".lancers-runtime");
    fs.mkdirSync(sessionDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      path.join(sessionDir, "lease.json"),
      `${JSON.stringify({ slot: slot.name, token }, null, 2)}\n`,
      { mode: 0o600 },
    );
    return record;
  });
}

export function readSession(repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repoPath, ".lancers-runtime", "lease.json"), "utf8"));
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
    if (!record || record.repoPath !== resolvedRepo)
      throw new Error("Missing, invalid, or stale local Supabase ownership token.");
    if (!["active", "review-ready"].includes(record.state))
      throw new Error(`Lease is ${record.state}; database mutation is refused.`);
    if (state) record.state = state;
    record.lastHeartbeat = new Date(now).toISOString();
    writeRegistry(paths.registry, registry);
    return record;
  });
}

export async function releaseLease({ repoPath, token, now = Date.now(), env = process.env }) {
  const paths = coordinatorPaths(repoPath, env);
  return withAllocatorLock(paths, () => {
    const registry = readRegistry(paths.registry);
    const record = Object.values(registry.slots).find((candidate) => candidate.token === token);
    if (!record || record.repoPath !== fs.realpathSync(repoPath))
      throw new Error("Missing, invalid, or stale local Supabase ownership token.");
    record.state = "released";
    record.lastHeartbeat = new Date(now).toISOString();
    writeRegistry(paths.registry, registry);
    return record;
  });
}

export async function cleanupStale({
  repoPath,
  now = Date.now(),
  env = process.env,
  probe = process.kill,
}) {
  const paths = coordinatorPaths(repoPath, env);
  return withAllocatorLock(paths, () => {
    const registry = readRegistry(paths.registry);
    const changed = [];
    for (const record of Object.values(registry.slots)) {
      if (record.state === "active" && reclaimable(record, now, probe)) {
        record.state = "stale";
        changed.push(record.slot);
      }
    }
    writeRegistry(paths.registry, registry);
    return changed;
  });
}

export function coordinatorStatus(repoPath, env = process.env) {
  const paths = coordinatorPaths(repoPath, env);
  return readRegistry(paths.registry);
}
