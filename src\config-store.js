import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultsPath = resolve(root, "config.json");
const baseDir = process.env.NOVA_MCP_USER_DIR || join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "NovaMCP");
const userConfigPath = join(baseDir, "config.json");

function atomicWriteJson(path, value) {
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  try {
    renameSync(temp, path);
  } catch (error) {
    try {
      rmSync(path, { force: true });
      renameSync(temp, path);
    } catch {
      try { rmSync(temp, { force: true }); } catch {}
      throw error;
    }
  }
}

function readJson(path, fallback = {}) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return fallback; }
}

function merge(base, extra) {
  if (Array.isArray(base) || Array.isArray(extra)) return extra ?? base;
  if (!base || typeof base !== "object") return extra ?? base;
  const out = { ...base };
  if (!extra || typeof extra !== "object") return out;
  for (const [key, value] of Object.entries(extra)) {
    out[key] = value && typeof value === "object" && !Array.isArray(value)
      ? merge(base[key] && typeof base[key] === "object" ? base[key] : {}, value)
      : value;
  }
  return out;
}

export function getRootDir() { return root; }
export function getUserDataDir() { mkdirSync(baseDir, { recursive: true }); return baseDir; }
export function getUserConfigPath() { getUserDataDir(); return userConfigPath; }

export function defaultConfig() {
  const config = readJson(defaultsPath, {});
  config.security ??= {};
  config.security.desktopControlEnabled ??= false;
  config.security.auditLogEnabled ??= true;
  config.security.requireLocalDashboard ??= true;
  config.onboarding ??= {};
  config.onboarding.completed ??= null;
  return config;
}

export function ensureUserConfig() {
  getUserDataDir();
  if (!existsSync(userConfigPath)) {
    atomicWriteJson(userConfigPath, defaultConfig());
  }
  return userConfigPath;
}

export function loadConfig() {
  ensureUserConfig();
  const config = merge(defaultConfig(), readJson(userConfigPath, {}));
  config.security ??= {};
  config.security.desktopControlEnabled ??= false;
  config.security.auditLogEnabled ??= true;
  config.security.requireLocalDashboard ??= true;
  config.onboarding ??= {};
  config.onboarding.completed ??= null;
  return config;
}

export function saveConfig(config) {
  getUserDataDir();
  atomicWriteJson(userConfigPath, config);
  return config;
}

export function updateConfig(mutator) {
  const current = loadConfig();
  const draft = structuredClone(current);
  const next = mutator ? (mutator(draft) ?? draft) : draft;
  return saveConfig(next);
}

export function relayMcpUrl(config = loadConfig()) {
  const relay = config.cloudRelay?.url || "wss://novamcp-connector.emperhub.workers.dev/connect";
  return relay.replace(/^wss:/, "https:").replace(/^ws:/, "http:").replace(/\/connect(?:\?.*)?$/, "/mcp");
}

export function relayHttpOrigin(config = loadConfig()) {
  return new URL(relayMcpUrl(config)).origin;
}
