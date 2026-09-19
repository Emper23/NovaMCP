import "./cloud-relay-agent.js";
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import crypto from "node:crypto";
import { loadConfig, getRootDir } from "./config-store.js";
import { desktopTools, callDesktopTool } from "./desktop-control.js";
import { buildingDetailTools, isBuildingDetailTool, callBuildingDetailTool } from "./building-detail-tool.js";
import { updateRuntimeState } from "./runtime-state.js";
import { audit } from "./audit-log.js";

const root = getRootDir();
const plugin = JSON.parse(readFileSync(resolve(root, "plugin.json"), "utf8"));
const initialConfig = loadConfig();
const studio = initialConfig.servers?.find(s => s?.type === "roblox-studio");
if (!studio) throw new Error("Roblox Studio MCP configuration is missing");
const launchBat = resolve(process.env.LOCALAPPDATA || process.env.USERPROFILE + "\\AppData\\Local", "Roblox", "mcp.bat");
const studioCommand = studio.command === "roblox-auto" ? (process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe") : studio.command;
const studioArgs = studio.command === "roblox-auto" ? ["/d", "/s", "/c", launchBat] : (studio.args || []);
const host = initialConfig.bridge?.host ?? "127.0.0.1";
const port = initialConfig.bridge?.port ?? 8787;
let session = null;
let tools = [];
let initializing = null;

const allowedBrowserOrigins = new Set([
  `http://127.0.0.1:${initialConfig.dashboard?.port ?? 8181}`,
  `http://localhost:${initialConfig.dashboard?.port ?? 8181}`,
]);

function json(res, value, code = 200, extra = {}) {
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": `http://127.0.0.1:${initialConfig.dashboard?.port ?? 8181}`,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,mcp-session-id,accept,mcp-protocol-version",
    ...extra
  });
  res.end(JSON.stringify(value));
}

function startStudio() {
  const config = loadConfig();
  const currentStudio = config.servers?.find(s => s?.type === "roblox-studio") ?? studio;
  const child = spawn(studioCommand, studioArgs, {
    cwd: currentStudio.cwd ? resolve(root, currentStudio.cwd) : root,
    env: { ...process.env, ...(currentStudio.env ?? {}) },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  });
  const s = { id: crypto.randomUUID(), child, buffer: Buffer.alloc(0), pending: new Map(), nextId: 1, closed: false };
  child.stderr.on("data", d => process.stderr.write(d));
  child.on("exit", () => {
    s.closed = true;
    for (const p of s.pending.values()) p.reject(new Error("Roblox Studio MCP exited"));
    s.pending.clear();
    if (session === s) { session = null; tools = []; }
    updateRuntimeState({ robloxStudioConnected: false, robloxTools: 0 });
    audit("roblox_studio_disconnected");
  });
  child.stdout.on("data", chunk => { s.buffer = Buffer.concat([s.buffer, chunk]); consume(s); });
  return s;
}

function consume(s) {
  while (!s.closed) {
    const header = s.buffer.indexOf(Buffer.from("\r\n\r\n"));
    if (header >= 0) {
      const match = s.buffer.subarray(0, header).toString().match(/Content-Length:\s*(\d+)/i);
      if (!match) { s.buffer = s.buffer.subarray(header + 4); continue; }
      const length = Number(match[1]), start = header + 4;
      if (s.buffer.length < start + length) return;
      const raw = s.buffer.subarray(start, start + length).toString();
      s.buffer = s.buffer.subarray(start + length);
      resolveMessage(s, raw);
      continue;
    }
    const nl = s.buffer.indexOf(10);
    if (nl < 0) return;
    const raw = s.buffer.subarray(0, nl).toString().trim();
    s.buffer = s.buffer.subarray(nl + 1);
    if (raw) { try { resolveMessage(s, raw); } catch {} }
  }
}

function resolveMessage(s, raw) {
  const msg = JSON.parse(raw);
  if (msg.id == null || !s.pending.has(msg.id)) return;
  const pending = s.pending.get(msg.id);
  s.pending.delete(msg.id);
  msg.error ? pending.reject(new Error(msg.error.message || "MCP error")) : pending.resolve(msg.result);
}

function request(s, method, params = {}, timeout = 20000) {
  return new Promise((resolveRequest, reject) => {
    if (s.closed || !s.child.stdin.writable) return reject(new Error("Roblox Studio MCP session is closed"));
    const id = s.nextId++;
    const timer = setTimeout(() => {
      if (s.pending.has(id)) { s.pending.delete(id); reject(new Error(`MCP request timeout: ${method}`)); }
    }, timeout);
    s.pending.set(id, {
      resolve: value => { clearTimeout(timer); resolveRequest(value); },
      reject: error => { clearTimeout(timer); reject(error); }
    });
    try { s.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); }
    catch (error) { clearTimeout(timer); s.pending.delete(id); reject(error); }
  });
}

async function ensure() {
  if (initializing) return initializing;
  if (session && !session.closed) return session;
  const current = startStudio();
  session = current;
  initializing = (async () => {
    await request(current, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "NovaMCP", version: plugin.version } });
    current.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
    const result = await request(current, "tools/list", {});
    tools = result?.tools ?? [];
    updateRuntimeState({ robloxStudioConnected: true, robloxStudioConnectedAt: new Date().toISOString(), robloxTools: tools.length });
    audit("roblox_studio_connected", { tools: tools.length });
    console.error(`[Roblox Studio] connected; ${tools.length} tools`);
    return current;
  })();
  try { return await initializing; }
  finally { initializing = null; }
}

async function listTools() {
  const s = await ensure();
  const result = await request(s, "tools/list", {});
  tools = result?.tools ?? [];
  updateRuntimeState({ robloxStudioConnected: true, robloxTools: tools.length });
  return { tools: [...tools, ...buildingDetailTools, ...desktopTools], resultType: "complete", ttlMs: 30000, cacheScope: "private" };
}

async function callTool(params) {
  const name = params?.name;
  if (!name) throw new Error("Tool name is required");
  if (name.startsWith("desktop_")) return callDesktopTool(name, params?.arguments ?? {});
  if (isBuildingDetailTool(name)) {
    const s = await ensure();
    audit("building_detail_tool_call", { name });
    return callBuildingDetailTool(name, params?.arguments ?? {}, (robloxToolName, robloxArgs) =>
      request(s, "tools/call", { name: robloxToolName, arguments: robloxArgs })
    );
  }
  const s = await ensure();
  if (!tools.some(t => t?.name === name)) await listTools();
  if (!tools.some(t => t?.name === name)) throw new Error(`Tool is not provided by Roblox Studio: ${name}`);
  audit("roblox_tool_call", { name });
  return request(s, "tools/call", params);
}

async function body(req) {
  let text = "";
  for await (const chunk of req) text += chunk;
  return text ? JSON.parse(text) : {};
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${host}:${port}`);
  const origin = req.headers.origin;
  if (origin && !allowedBrowserOrigins.has(origin)) return json(res, { error: "Browser origin is not allowed" }, 403);
  if (req.method === "OPTIONS") return json(res, {}, 204);
  try {
    if (req.method === "GET" && url.pathname === "/health") {
      await ensure();
      const config = loadConfig();
      updateRuntimeState({ lastBridgeError: null });
      return json(res, {
        ok: true,
        name: "NovaMCP Roblox Studio Connector",
        version: plugin.version,
        studioOnly: false,
        connected: !!session && !session.closed,
        tools: tools.length + buildingDetailTools.length + desktopTools.length,
        robloxTools: tools.length,
        analysisTools: buildingDetailTools.length,
        desktopTools: desktopTools.length,
        desktopControlEnabled: config.security?.desktopControlEnabled === true
      });
    }
    if (req.method === "POST" && url.pathname === "/mcp") {
      const requestBody = await body(req);
      if (requestBody.method === "initialize") return json(res, { jsonrpc: "2.0", id: requestBody.id ?? null, result: { protocolVersion: "2025-06-18", capabilities: { tools: { listChanged: true } }, serverInfo: { name: "NovaMCP", version: plugin.version } } });
      if (requestBody.method === "notifications/initialized") { res.writeHead(202, { "access-control-allow-origin": `http://127.0.0.1:${initialConfig.dashboard?.port ?? 8181}` }); return res.end(); }
      if (requestBody.method === "ping") return json(res, { jsonrpc: "2.0", id: requestBody.id ?? null, result: {} });
      if (requestBody.method === "tools/list") return json(res, { jsonrpc: "2.0", id: requestBody.id ?? null, result: await listTools() });
      if (requestBody.method === "tools/call") return json(res, { jsonrpc: "2.0", id: requestBody.id ?? null, result: await callTool(requestBody.params ?? {}) });
      return json(res, { jsonrpc: "2.0", id: requestBody.id ?? null, error: { code: -32601, message: "Method not found" } }, 404);
    }
    if (url.pathname === "/mcp") return json(res, { error: "Method not allowed" }, 405, { allow: "POST" });
    return json(res, { error: "Not found" }, 404);
  } catch (error) {
    updateRuntimeState({ lastBridgeError: error.message });
    audit("bridge_error", { message: error.message });
    return json(res, { jsonrpc: "2.0", error: { code: -32603, message: error.message }, id: null }, 500);
  }
});

process.on("SIGINT", () => { try { session?.child.kill(); } catch {} updateRuntimeState({ robloxStudioConnected: false }); });
process.on("SIGTERM", () => { try { session?.child.kill(); } catch {} updateRuntimeState({ robloxStudioConnected: false }); });
server.listen(port, host, () => console.error(`[NovaMCP] MCP endpoint http://${host}:${port}/mcp`));
