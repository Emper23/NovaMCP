import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getUserDataDir } from "./config-store.js";

const statePath = () => join(getUserDataDir(), "runtime.json");

export function loadRuntimeState() {
  try { return existsSync(statePath()) ? JSON.parse(readFileSync(statePath(), "utf8")) : {}; }
  catch { return {}; }
}

export function updateRuntimeState(patch) {
  const current = loadRuntimeState();
  const next = { ...current, ...(typeof patch === "function" ? patch({ ...current }) : patch), updatedAt: new Date().toISOString() };
  writeFileSync(statePath(), JSON.stringify(next, null, 2) + "\n", "utf8");
  return next;
}

export function resetRuntimeState() {
  const next = { cloudRelayConnected: false, robloxStudioConnected: false, chatGptConnected: false, updatedAt: new Date().toISOString() };
  writeFileSync(statePath(), JSON.stringify(next, null, 2) + "\n", "utf8");
  return next;
}
