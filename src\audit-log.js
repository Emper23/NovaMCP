import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getUserDataDir, loadConfig } from "./config-store.js";

const auditPath = () => join(getUserDataDir(), "audit.log");
const sensitiveKeys = /token|authorization|secret|password|pairing.?code|text/i;

function clean(value, depth = 0) {
  if (depth > 4) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 20).map(v => clean(v, depth + 1));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = sensitiveKeys.test(k) ? "[redacted]" : clean(v, depth + 1);
    return out;
  }
  return typeof value === "string" && value.length > 500 ? value.slice(0, 500) + "…" : value;
}

export function audit(event, detail = {}) {
  try {
    if (loadConfig().security?.auditLogEnabled === false) return;
    const row = { ts: new Date().toISOString(), event: String(event), detail: clean(detail) };
    appendFileSync(auditPath(), JSON.stringify(row) + "\n", "utf8");
    const size = existsSync(auditPath()) ? readFileSync(auditPath(), "utf8") : "";
    if (size.length > 1024 * 1024) {
      const lines = size.trim().split(/\r?\n/).slice(-1000);
      writeFileSync(auditPath(), lines.join("\n") + "\n", "utf8");
    }
  } catch {}
}

export function recentAudit(limit = 40) {
  try {
    if (!existsSync(auditPath())) return [];
    return readFileSync(auditPath(), "utf8").trim().split(/\r?\n/).filter(Boolean).slice(-Math.max(1, Math.min(limit, 200))).map(line => {
      try { return JSON.parse(line); } catch { return { ts: null, event: "invalid_audit_row", detail: {} }; }
    }).reverse();
  } catch { return []; }
}
