import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { getUserDataDir, loadConfig } from "./config-store.js";
import { loadRuntimeState } from "./runtime-state.js";
import { recentAudit, audit } from "./audit-log.js";

const execFileAsync = promisify(execFile);
const sensitiveKeys = /token|authorization|secret|password|pairing.?code|cookie|credential|key$/i;

function sanitizeString(value) {
  let out = String(value ?? "");
  const replacements = [
    [process.env.USERPROFILE, "%USERPROFILE%"],
    [process.env.APPDATA, "%APPDATA%"],
    [process.env.LOCALAPPDATA, "%LOCALAPPDATA%"],
    [homedir(), "%USERPROFILE%"]
  ].filter(([a]) => a);
  for (const [from, to] of replacements) out = out.split(from).join(to);
  return out.length > 4000 ? out.slice(0, 4000) + "…" : out;
}

function clean(value, depth = 0) {
  if (depth > 6) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 100).map(item => clean(item, depth + 1));
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = sensitiveKeys.test(key) ? "[redacted]" : clean(item, depth + 1);
    return out;
  }
  return typeof value === "string" ? sanitizeString(value) : value;
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").replace("Z", "");
}

export async function exportDiagnostics(extra = {}, options = {}) {
  const userDir = getUserDataDir();
  const workRoot = join(userDir, "diagnostics");
  mkdirSync(workRoot, { recursive: true });
  const id = stamp();
  const tempDir = join(workRoot, `export-${id}`);
  mkdirSync(tempDir, { recursive: true });
  const downloads = join(homedir(), "Downloads");
  mkdirSync(downloads, { recursive: true });
  const zipPath = join(downloads, `NovaMCP-Diagnostics-${id}.zip`);
  const jsonPath = join(tempDir, "diagnostics.json");
  const payload = clean({
    generatedAt: new Date().toISOString(),
    app: {
      version: extra.version || null,
      platform: process.platform,
      arch: process.arch,
      node: process.versions.node,
      electron: process.versions.electron || null,
      packaged: Boolean(process.versions.electron)
    },
    status: extra.status || null,
    roblox: extra.roblox || null,
    update: extra.update || null,
    signing: extra.signing || null,
    config: loadConfig(),
    runtime: loadRuntimeState(),
    audit: recentAudit(200)
  });
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  writeFileSync(join(tempDir, "README.txt"), "NovaMCP diagnostics export. Sensitive tokens, pairing codes, passwords and credentials are redacted.\r\n", "utf8");

  const ps = join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  try {
    await execFileAsync(ps, ["-NoProfile", "-Command", `Compress-Archive -Path '${tempDir.replaceAll("'", "''")}\\*' -DestinationPath '${zipPath.replaceAll("'", "''")}' -Force`], { windowsHide: true, timeout: 30000 });
  } catch (error) {
    const fallback = join(downloads, `NovaMCP-Diagnostics-${id}.json`);
    writeFileSync(fallback, JSON.stringify(payload, null, 2) + "\n", "utf8");
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
    audit("diagnostics_exported", { format: "json", path: fallback, zipError: error.message });
    if (options.reveal !== false) { try {
      const explorer = join(process.env.SystemRoot || "C:\\Windows", "explorer.exe");
      const child = spawn(explorer, [`/select,${fallback}`], { detached: true, stdio: "ignore" }); child.unref();
    } catch {} }
    return { ok: true, path: fallback, format: "json", warning: "ZIP creation failed; exported JSON instead." };
  }

  try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  audit("diagnostics_exported", { format: "zip", path: zipPath });
  if (options.reveal !== false) { try {
    const explorer = join(process.env.SystemRoot || "C:\\Windows", "explorer.exe");
    const child = spawn(explorer, [`/select,${zipPath}`], { detached: true, stdio: "ignore" }); child.unref();
  } catch {} }
  return { ok: true, path: zipPath, format: "zip", exists: existsSync(zipPath) };
}
