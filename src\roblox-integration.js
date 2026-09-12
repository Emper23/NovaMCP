import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { audit } from "./audit-log.js";

const execFileAsync = promisify(execFile);
const localAppData = process.env.LOCALAPPDATA || join(process.env.USERPROFILE || "", "AppData", "Local");
const robloxRoot = join(localAppData, "Roblox");
const versionsRoot = join(robloxRoot, "Versions");
const launcherPath = join(robloxRoot, "mcp.bat");
let cache = null;
let cacheAt = 0;

function versionBundles() {
  if (!existsSync(versionsRoot)) return [];
  const items = [];
  for (const name of readdirSync(versionsRoot, { withFileTypes: true })) {
    if (!name.isDirectory() || !name.name.startsWith("version-")) continue;
    const root = join(versionsRoot, name.name);
    const studioPath = join(root, "RobloxStudioBeta.exe");
    const mcpPath = join(root, "StudioMCP.exe");
    if (!existsSync(studioPath) && !existsSync(mcpPath)) continue;
    let modified = 0;
    try { modified = Math.max(existsSync(studioPath) ? statSync(studioPath).mtimeMs : 0, existsSync(mcpPath) ? statSync(mcpPath).mtimeMs : 0); } catch {}
    items.push({ versionDir: name.name, root, studioPath, mcpPath, modified });
  }
  return items.sort((a, b) => b.modified - a.modified);
}

async function productVersion(path) {
  if (!existsSync(path)) return null;
  const ps = join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  try {
    const { stdout } = await execFileAsync(ps, ["-NoProfile", "-Command", `(Get-Item -LiteralPath '${path.replaceAll("'", "''")}').VersionInfo.ProductVersion`], { windowsHide: true, timeout: 4000 });
    const value = String(stdout || "").trim();
    return value || null;
  } catch { return null; }
}

function launcherInfo(latest) {
  if (!existsSync(launcherPath)) return { exists: false, healthy: false, targetVersionDir: null, synced: false };
  let text = "";
  try { text = readFileSync(launcherPath, "utf8"); } catch {}
  const target = text.match(/Versions\\(version-[A-Za-z0-9_-]+)\\StudioMCP\.exe/i)?.[1] || null;
  const healthy = /StudioMCP\.exe/i.test(text);
  const synced = healthy && (!target || !latest?.versionDir || target === latest.versionDir);
  return { exists: true, healthy, targetVersionDir: target, synced };
}

export async function getRobloxIntegrationStatus(force = false) {
  if (!force && cache && Date.now() - cacheAt < 12000) return cache;
  const bundles = versionBundles();
  const latest = bundles.find(item => existsSync(item.studioPath) && existsSync(item.mcpPath)) || bundles[0] || null;
  const launcher = launcherInfo(latest);
  const studioVersion = latest?.studioPath ? await productVersion(latest.studioPath) : null;
  cache = {
    installed: Boolean(latest && existsSync(latest.studioPath)),
    studioVersion,
    versionDir: latest?.versionDir || null,
    studioPath: latest && existsSync(latest.studioPath) ? latest.studioPath : null,
    mcpInstalled: Boolean(latest && existsSync(latest.mcpPath)),
    mcpPath: latest && existsSync(latest.mcpPath) ? latest.mcpPath : null,
    launcherPath,
    launcherExists: launcher.exists,
    launcherHealthy: launcher.healthy,
    launcherTargetVersionDir: launcher.targetVersionDir,
    synced: Boolean(latest && existsSync(latest.mcpPath) && launcher.synced),
    needsRepair: !latest || !existsSync(latest.mcpPath) || !launcher.healthy || !launcher.synced,
    checkedAt: new Date().toISOString()
  };
  cacheAt = Date.now();
  return cache;
}

export async function repairRobloxIntegration() {
  const bundles = versionBundles();
  const latest = bundles.find(item => existsSync(item.studioPath) && existsSync(item.mcpPath)) || bundles[0] || null;
  if (!latest || !existsSync(latest.mcpPath)) throw new Error("StudioMCP.exe was not found. Install or update Roblox Studio first.");
  const escaped = latest.mcpPath.replaceAll("%", "%%");
  const content = `@echo off\r\nsetlocal\r\nif exist "${escaped}" (\r\n  "${escaped}" %*\r\n  exit /b %errorlevel%\r\n)\r\nfor /f "tokens=2*" %%A in ('reg query HKEY_CURRENT_USER\\Software\\Roblox\\RobloxStudio /v ContentFolder 2^>nul') do (\r\n  if exist "%%B\\..\\StudioMCP.exe" (\r\n    "%%B\\..\\StudioMCP.exe" %*\r\n    exit /b %errorlevel%\r\n  )\r\n)\r\necho StudioMCP.exe not found 1>&2\r\nexit /b 2\r\n`;
  writeFileSync(launcherPath, content, "utf8");
  cache = null;
  audit("roblox_mcp_integration_repaired", { versionDir: latest.versionDir });
  return getRobloxIntegrationStatus(true);
}

export async function openRobloxStudio() {
  const bundles = versionBundles();
  const latest = bundles.find(item => existsSync(item.studioPath) && existsSync(item.mcpPath)) || bundles.find(item => existsSync(item.studioPath)) || bundles[0] || null;
  if (!latest || !existsSync(latest.studioPath)) throw new Error("Roblox Studio is not installed");
  const child = spawn(latest.studioPath, [], { detached: true, stdio: "ignore", windowsHide: false, cwd: dirname(latest.studioPath) });
  child.unref();
  audit("roblox_studio_open_requested", { versionDir: latest.versionDir });
  return { ok: true, path: latest.studioPath };
}
