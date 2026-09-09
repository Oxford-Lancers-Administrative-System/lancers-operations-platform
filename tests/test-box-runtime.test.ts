// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assertTargets, isLoopbackApp } from "../scripts/test-box/runtime.mjs";
import { parseArguments } from "../scripts/test-box/fast-forward.mjs";

const lease = { ports: { db: 56342 }, applicationPort: 3101 };
const env = {
  SUPABASE_DB_URL: "postgresql://postgres:postgres@127.0.0.1:56342/postgres",
  PORT: "3101",
};
describe("LAN-222 test box boundaries", () => {
  it("uses only the exact leased local database and application port", () => {
    expect(assertTargets(env, lease).baseUrl).toBe("http://127.0.0.1:3101");
    expect(() =>
      assertTargets(
        { ...env, SUPABASE_DB_URL: env.SUPABASE_DB_URL.replace("56342", "54322") },
        lease,
      ),
    ).toThrow("lease");
    expect(() => assertTargets({ ...env, PORT: "3000" }, lease)).toThrow("lease");
  });
  it("refuses hosted targets, driver redirection and deployed runtimes", () => {
    for (const target of [
      "postgresql://postgres@db.example.com/postgres",
      env.SUPABASE_DB_URL + "?host=db.example.com",
    ]) {
      expect(() => assertTargets({ ...env, SUPABASE_DB_URL: target }, lease)).toThrow();
    }
    expect(() => assertTargets({ ...env, K_SERVICE: "deployed" }, lease)).toThrow("deployed");
  });
  it("does not treat a tunnel, credentials in a URL, or a lookalike host as the sink", () => {
    expect(isLoopbackApp("http://localhost:3101")).toBe(true);
    for (const url of [
      "https://marvel-indiscernible-daxton.ngrok-free.dev",
      "http://localhost.example.com",
      "http://secret@localhost:3101",
      "file://localhost/a",
    ]) {
      expect(isLoopbackApp(url)).toBe(false);
    }
  });
  it("requires an explicit positive finite shift and valid scope", () => {
    expect(parseArguments(["--hours", "1.5", "--dry-run"]).hours).toBe(1.5);
    for (const args of [
      [],
      ["--hours", "0"],
      ["--hours", "-1"],
      ["--hours", "Infinity"],
      ["--hours", "1junk"],
      ["--hours", "1", "--event", "invalid"],
      ["--hours", "1", "--hours", "2"],
    ]) {
      expect(() => parseArguments(args)).toThrow();
    }
  });
});
