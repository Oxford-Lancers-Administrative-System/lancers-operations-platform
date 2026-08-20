#!/usr/bin/env node
import process from "node:process";
import { findStateFile, readIntakeState, renderResumeBanner } from "./lib/state.mjs";

const [command, missionId, ...extra] = process.argv.slice(2);

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (command !== "status" || extra.length > 0) {
  fail("Usage: npm run intake -- status [M-<mission-id>]");
}
if (missionId && !/^M-[A-Za-z0-9][A-Za-z0-9-]*$/.test(missionId)) {
  fail("Mission id must match M-<slug>.");
}

try {
  const state = readIntakeState(findStateFile(process.cwd(), missionId));
  console.log(renderResumeBanner(state));
} catch (error) {
  fail(`mission intake system not ready: ${error.message}`);
}
