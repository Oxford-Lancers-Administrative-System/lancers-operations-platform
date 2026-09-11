import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const PERSON_DEFAULTS = Object.freeze({
  identity: "unclassified",
  delivery: "intercepted",
  responder: "none",
  completion: "minimum",
  delayHours: 24,
  outcome: "delivered",
  eventAnswer: "yes",
});
export function validatePersonSettings(input, person) {
  const result = { ...PERSON_DEFAULTS, ...input };
  for (const [key, values] of Object.entries({
    identity: ["unclassified", "synthetic", "real"],
    eventAnswer: ["yes", "no"],
    delivery: ["intercepted", "real"],
    responder: ["none", "prompt", "late", "never"],
    completion: ["all", "partial", "minimum", "none"],
    outcome: ["delivered", "failed", "undelivered"],
  })) {
    if (!values.includes(result[key]))
      throw new Error("Choose one of the displayed person settings.");
  }
  if (!Number.isFinite(result.delayHours) || result.delayHours < 0 || result.delayHours > 8760)
    throw new Error("Response delay must be between zero and 8,760 hours.");
  if (result.identity !== "synthetic" && result.responder !== "none")
    throw new Error("Only explicitly synthetic people can have simulated responses.");
  if (result.delivery === "real" && (result.identity !== "real" || !person.phone))
    throw new Error("Identify a real person with a phone number before selecting actual delivery.");
  if (result.delivery === "real" && result.outcome !== "delivered")
    throw new Error("Real delivery outcomes come from the provider, not simulation.");
  return {
    ...Object.fromEntries(Object.keys(PERSON_DEFAULTS).map((key) => [key, result[key]])),
    destination: person.phone ?? null,
  };
}
export function effectivePersonSettings(saved, person) {
  if (!saved) return { ...PERSON_DEFAULTS, destination: person.phone ?? null };
  if (saved.destination !== person.phone)
    return {
      ...saved,
      delivery: "intercepted",
      responder: "none",
      destination: person.phone ?? null,
      destinationChanged: true,
    };
  return saved;
}
export function readPanelState(directory) {
  try {
    const state = JSON.parse(fs.readFileSync(path.join(directory, "panel-state.json"), "utf8"));
    if (state.version !== 1 || !state.people || Array.isArray(state.people)) throw new Error();
    return state;
  } catch (error) {
    if (error.code === "ENOENT") return { version: 1, people: {}, clock: null };
    throw new Error("Saved test settings cannot be read. Restore them before continuing.");
  }
}
export function writePanelState(directory, state) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, "panel-state.json");
  const temporary = file + "." + crypto.randomUUID();
  fs.writeFileSync(temporary, JSON.stringify(state), { mode: 0o600, flag: "wx" });
  fs.renameSync(temporary, file);
}
export function requestAllowed(request, port, { mutation = false, session, csrf } = {}) {
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress))
    return false;
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!hosts.includes(request.headers.host)) return false;
  const origin = request.headers.origin;
  if (origin && !hosts.map((host) => `http://${host}`).includes(origin)) return false;
  if (request.headers["sec-fetch-site"] === "cross-site") return false;
  if (mutation) {
    if (origin !== `http://${request.headers.host}`) return false;
    if (request.headers["content-type"] !== "application/json") return false;
    const cookie = (request.headers.cookie ?? "").split(";").map((s) => s.trim());
    if (
      !cookie.includes(`lancers_test_panel=${session}`) ||
      request.headers["x-test-panel"] !== csrf
    )
      return false;
  }
  return true;
}
