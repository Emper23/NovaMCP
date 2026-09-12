import http from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { loadConfig, updateConfig, getRootDir, getUserConfigPath, relayMcpUrl, relayHttpOrigin } from "./config-store.js";
import { loadRuntimeState, updateRuntimeState } from "./runtime-state.js";
import { audit, recentAudit } from "./audit-log.js";
import { getUpdateState, checkForUpdates, downloadUpdate, installUpdate } from "./update-manager.js";
import { getAboutInfo } from "./about.js";

const root = getRootDir();
const plugin = JSON.parse(readFileSync(resolve(root, "plugin.json"), "utf8"));
const initialConfig = loadConfig();
const port = Number.parseInt(process.env.NOVA_MCP_DASHBOARD_PORT || "", 10) || initialConfig.dashboard?.port || 8181;
const configuredHost = process.env.NOVA_MCP_DASHBOARD_HOST || initialConfig.dashboard?.host || "127.0.0.1";
const host = initialConfig.security?.requireLocalDashboard !== false ? "127.0.0.1" : configuredHost;
const page = readFileSync(resolve(root, "public", "dashboard.html"), "utf8");
let child = null;
let startedAt = null;
let lastError = null;

function childEnv() {
  const env = { ...process.env, NOVA_MCP_USER_DIR: process.env.NOVA_MCP_USER_DIR || undefined };
  if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = "1";
  return Object.fromEntries(Object.entries(env).filter(([, value]) => value != null));
}

function start() {
  if (child && !child.killed) return;
  lastError = null;
  const runtimeRoot = root.endsWith(".asar") ? `${root}.unpacked` : root;
  const entry = resolve(runtimeRoot, plugin.entry);
  child = spawn(process.execPath, [entry], { cwd: runtimeRoot, windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env: childEnv() });
  startedAt = new Date().toISOString();
  child.stdout.on("data", data => process.stderr.write(data));
  child.stderr.on("data", data => process.stderr.write(data));
  child.on("error", error => { lastError = error.message; updateRuntimeState({ cloudRelayConnected: false, robloxStudioConnected: false, desktopControlToolCount: 0, robloxToolCount: 0 }); audit("connector_process_error", { message: error.message }); child = null; });
  child.on("exit", code => { if (code !== 0 && code != null) lastError = `Connector exited with code ${code}`; updateRuntimeState({ cloudRelayConnected: false, robloxStudioConnected: false }); child = null; });
  audit("connector_started", { pid: child.pid ?? null });
}

function stop() {
  if (child && !child.killed) child.kill();
  child = null;
  updateRuntimeState({ cloudRelayConnected: false, robloxStudioConnected: false });
  audit("connector_stopped");
}

function restart(delay = 300) {
  stop();
  setTimeout(start, delay);
  audit("connector_restart_requested");
}

async function localHealth() {
  const config = loadConfig();
  const url = `http://${config.bridge?.host || "127.0.0.1"}:${config.bridge?.port || 8787}/health`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1600);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return response.ok ? await response.json() : { connected: false };
  } catch { return { connected: false, tools: 0, robloxTools: 0, desktopTools: 4 }; }
}

function recentChatGpt(runtime) {
  if (!runtime.lastChatGptRequestAt) return false;
  const age = Date.now() - new Date(runtime.lastChatGptRequestAt).getTime();
  return Number.isFinite(age) && age < 5 * 60 * 1000;
}

async function status() {
  const config = loadConfig();
  const runtime = loadRuntimeState();
  const health = await localHealth();
  const studioServer = config.servers?.find(item => item?.type === "roblox-studio") ?? config.servers?.find(item => item?.name === "Roblox Studio");
  return {
    id: plugin.id,
    name: "NovaMCP",
    version: plugin.version,
    update: getUpdateState(),
    state: child && !child.killed ? "running" : "stopped",
    pid: child?.pid ?? null,
    startedAt,
    lastError,
    server: studioServer,
    restart: config.restart ?? {},
    configPath: getUserConfigPath(),
    mcpUrl: relayMcpUrl(config),
    cloudRelay: {
      connected: runtime.cloudRelayConnected === true,
      pairingCode: config.cloudRelay?.pairingCode ?? "",
      setupUrl: config.cloudRelay?.setupUrl ?? "",
      hasToken: Boolean(config.cloudRelay?.token),
      connectedAt: runtime.cloudRelayConnectedAt ?? null
    },
    chatGpt: {
      connected: recentChatGpt(runtime),
      lastRequestAt: runtime.lastChatGptRequestAt ?? null,
      lastRpcMethod: runtime.lastRpcMethod ?? ""
    },
    roblox: {
      connected: health.connected === true || runtime.robloxStudioConnected === true,
      tools: health.robloxTools ?? runtime.robloxTools ?? 0
    },
    desktopControl: {
      enabled: config.security?.desktopControlEnabled === true,
      tools: health.desktopTools ?? 4
    },
    toolCount: health.tools ?? ((health.robloxTools ?? 0) + 4),
    diagnostics: {
      lastBridgeError: runtime.lastBridgeError ?? null,
      lastError,
      lastRpcMethod: runtime.lastRpcMethod ?? null
    }
  };
}

async function cloudDiagnostics() {
  try {
    const origin = relayHttpOrigin(loadConfig());
    const response = await fetch(`${origin}/diagnostics`, { headers: { "cache-control": "no-cache" } });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}`, events: [] };
    const data = await response.json();
    return { ok: true, events: Array.isArray(data.events) ? data.events.slice(-20).reverse() : [] };
  } catch (error) { return { ok: false, error: error.message, events: [] }; }
}

async function readBody(req) {
  let text = "";
  for await (const chunk of req) text += chunk;
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

const dashboardOrigin = `http://${host}:${port}`;
const securityHeaders = { "x-content-type-options": "nosniff", "x-frame-options": "DENY", "referrer-policy": "no-referrer", "cross-origin-resource-policy": "same-origin" };
function json(res, value, code = 200) {
  res.writeHead(code, { ...securityHeaders, "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": dashboardOrigin });
  res.end(JSON.stringify(value));
}

async function regeneratePairing() {
  updateConfig(config => { if (config.cloudRelay) config.cloudRelay.pairingCode = ""; return config; });
  audit("pairing_regenerate_requested");
  restart(250);
  return { ok: true };
}

async function revokeToken() {
  const config = loadConfig();
  const token = config.cloudRelay?.token || "";
  if (!token) return { ok: true, alreadyRevoked: true };
  const origin = relayHttpOrigin(config);
  const response = await fetch(`${origin}/connect-token/revoke`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token })
  });
  if (!response.ok) throw new Error(`Cloud revoke failed: HTTP ${response.status}`);
  updateConfig(next => {
    next.cloudRelay = { ...(next.cloudRelay || {}), token: "", pairingCode: "" };
    return next;
  });
  updateRuntimeState({ cloudRelayConnected: false, chatGptConnected: false, lastChatGptRequestAt: null });
  audit("relay_token_revoked");
  restart(300);
  return { ok: true };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${host}:${port}`);
  try {
    const origin = req.headers.origin;
    if (req.method === "POST" && origin && origin !== dashboardOrigin && origin !== `http://localhost:${port}`) return json(res, { ok: false, error: "Origin is not allowed" }, 403);
    if (req.method === "GET" && url.pathname === "/") { res.writeHead(200, { ...securityHeaders, "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'", "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); return res.end(page); }
    if (req.method === "GET" && url.pathname === "/api/status") return json(res, await status());
    if (req.method === "GET" && url.pathname === "/api/audit") return json(res, { events: recentAudit(60) });
    if (req.method === "GET" && url.pathname === "/api/diagnostics") return json(res, { local: (await status()).diagnostics, cloud: await cloudDiagnostics(), audit: recentAudit(20) });
    if (req.method === "GET" && url.pathname === "/api/update") return json(res, getUpdateState());
    if (req.method === "GET" && url.pathname === "/api/about") return json(res, getAboutInfo(plugin.version, getUpdateState()));
    if (req.method === "POST" && url.pathname === "/api/update/check") return json(res, await checkForUpdates());
    if (req.method === "POST" && url.pathname === "/api/update/download") return json(res, await downloadUpdate(), 202);
    if (req.method === "POST" && url.pathname === "/api/update/install") return json(res, installUpdate(), 202);
    if (req.method === "POST" && url.pathname === "/api/start") { start(); return json(res, { ok: true }); }
    if (req.method === "POST" && url.pathname === "/api/stop") { stop(); return json(res, { ok: true }); }
    if (req.method === "POST" && url.pathname === "/api/restart") { restart(); return json(res, { ok: true }); }
    if (req.method === "POST" && url.pathname === "/api/pairing/regenerate") return json(res, await regeneratePairing(), 202);
    if (req.method === "POST" && url.pathname === "/api/token/revoke") return json(res, await revokeToken());
    if (req.method === "POST" && url.pathname === "/api/security/desktop-control") {
      const input = await readBody(req);
      const enabled = input.enabled === true;
      updateConfig(config => { config.security ??= {}; config.security.desktopControlEnabled = enabled; return config; });
      audit("desktop_control_setting_changed", { enabled });
      return json(res, { ok: true, enabled });
    }
    return json(res, { error: "Not found" }, 404);
  } catch (error) {
    lastError = error.message;
    audit("dashboard_api_error", { path: url.pathname, message: error.message });
    return json(res, { ok: false, error: error.message }, 500);
  }
});

function shutdown() {
  try { child?.kill(); } catch {}
  updateRuntimeState({ cloudRelayConnected: false, robloxStudioConnected: false });
}
process.on("SIGINT", () => { shutdown(); process.exit(0); });
process.on("SIGTERM", () => { shutdown(); process.exit(0); });
process.on("exit", shutdown);

server.on("error", error => {
  lastError = error.message;
  audit("dashboard_server_error", { code: error.code || null, message: error.message, port });
  console.error(`[NovaMCP Dashboard] ${error.code || "ERROR"}: ${error.message}`);
});

server.listen(port, host, () => {
  console.error(`[NovaMCP Dashboard] http://${host}:${port}`);
  audit("dashboard_started", { port });
  start();
});

export { server, shutdown };
