import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadConfig } from "./config-store.js";
import { audit } from "./audit-log.js";

const run = promisify(execFile);
const PS = (process.env.SystemRoot || "C:\\Windows") + "\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";

async function ps(script, timeout = 15000) {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const { stdout } = await run(PS, ["-NoLogo", "-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], {
    windowsHide: true,
    timeout,
    maxBuffer: 16 * 1024 * 1024
  });
  return stdout.trim();
}

function requireEnabled(name) {
  if (loadConfig().security?.desktopControlEnabled !== true) {
    audit("desktop_control_blocked", { tool: name });
    throw new Error("Desktop Control is disabled in NovaMCP Dashboard");
  }
}

export const desktopTools = [
  { name: "desktop_screenshot", title: "Desktop Screenshot", description: "Capture the current Windows desktop so the assistant can inspect visible UI before clicking or typing.", inputSchema: { type: "object", properties: {} }, annotations: { title: "Desktop Screenshot", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: "desktop_mouse", title: "Desktop Mouse", description: "Move the Windows mouse pointer, click, double-click, right-click, or scroll at screen coordinates. Requires Desktop Control to be enabled in NovaMCP Dashboard.", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["move", "click", "double_click", "right_click", "scroll"] }, x: { type: "integer" }, y: { type: "integer" }, delta: { type: "integer" } }, required: ["action"] }, annotations: { title: "Desktop Mouse", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
  { name: "desktop_keyboard", title: "Desktop Keyboard", description: "Type text, press a key, or send a keyboard shortcut to the focused Windows application. Requires Desktop Control to be enabled in NovaMCP Dashboard.", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["type", "press", "hotkey"] }, text: { type: "string" }, key: { type: "string" }, keys: { type: "array", items: { type: "string" } } }, required: ["action"] }, annotations: { title: "Desktop Keyboard", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
  { name: "desktop_windows", title: "Desktop Windows", description: "List visible top-level Windows applications and their titles.", inputSchema: { type: "object", properties: {} }, annotations: { title: "Desktop Windows", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }
];

const keyMap = { ENTER: "{ENTER}", ESC: "{ESC}", ESCAPE: "{ESC}", TAB: "{TAB}", SPACE: " ", BACKSPACE: "{BACKSPACE}", DELETE: "{DELETE}", UP: "{UP}", DOWN: "{DOWN}", LEFT: "{LEFT}", RIGHT: "{RIGHT}", HOME: "{HOME}", END: "{END}", PGUP: "{PGUP}", PGDN: "{PGDN}", F1: "{F1}", F2: "{F2}", F3: "{F3}", F4: "{F4}", F5: "{F5}", F6: "{F6}", F7: "{F7}", F8: "{F8}", F9: "{F9}", F10: "{F10}", F11: "{F11}", F12: "{F12}" };
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const mappedKey = value => keyMap[String(value || "").toUpperCase()] || (String(value || "").length === 1 ? String(value).toUpperCase() : null);

async function screenshot() {
  const script = `Add-Type -AssemblyName System.Windows.Forms;Add-Type -AssemblyName System.Drawing;$b=[System.Windows.Forms.SystemInformation]::VirtualScreen;$m=New-Object Drawing.Bitmap $b.Width,$b.Height;$g=[Drawing.Graphics]::FromImage($m);$g.CopyFromScreen($b.Left,$b.Top,0,0,$m.Size);$x=New-Object IO.MemoryStream;$m.Save($x,[Drawing.Imaging.ImageFormat]::Jpeg);Write-Output ($b.Width.ToString()+"x"+$b.Height.ToString());Write-Output ([Convert]::ToBase64String($x.ToArray()));$g.Dispose();$m.Dispose();$x.Dispose()`;
  const output = await ps(script, 20000);
  const split = output.indexOf("\n");
  if (split < 0) throw new Error("Invalid screenshot response");
  audit("desktop_screenshot");
  return { content: [{ type: "text", text: "Desktop screenshot " + output.slice(0, split).trim() }, { type: "image", data: output.slice(split + 1).replace(/\s+/g, ""), mimeType: "image/jpeg" }] };
}

async function mouse(args) {
  const action = String(args.action || "");
  const needsPoint = ["move", "click", "double_click", "right_click"].includes(action);
  if (needsPoint && (!Number.isInteger(args.x) || !Number.isInteger(args.y))) throw new Error("x and y are required");
  const x = args.x || 0, y = args.y || 0, delta = Number.isInteger(args.delta) ? args.delta : -120;
  const script = `Add-Type @"
using System;using System.Runtime.InteropServices;public static class M{[DllImport("user32.dll")]public static extern bool SetCursorPos(int X,int Y);[DllImport("user32.dll")]public static extern void mouse_event(uint f,uint x,uint y,int d,UIntPtr e);}
"@;$a=${quote(action)};if($a-ne'scroll'){[M]::SetCursorPos(${x},${y})|Out-Null};if($a-eq'click'){[M]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[M]::mouse_event(4,0,0,0,[UIntPtr]::Zero)}elseif($a-eq'double_click'){1..2|%{[M]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[M]::mouse_event(4,0,0,0,[UIntPtr]::Zero);Start-Sleep -Milliseconds 80}}elseif($a-eq'right_click'){[M]::mouse_event(8,0,0,0,[UIntPtr]::Zero);[M]::mouse_event(16,0,0,0,[UIntPtr]::Zero)}elseif($a-eq'scroll'){[M]::mouse_event(2048,0,0,${delta},[UIntPtr]::Zero)}`;
  await ps(script);
  audit("desktop_mouse", { action, x: needsPoint ? x : undefined, y: needsPoint ? y : undefined, delta: action === "scroll" ? delta : undefined });
  return { content: [{ type: "text", text: `Mouse ${action} complete` }] };
}

async function keyboard(args) {
  const action = String(args.action || "");
  let script = "Add-Type -AssemblyName System.Windows.Forms;";
  const auditDetail = { action };
  if (action === "type") {
    if (typeof args.text !== "string") throw new Error("text required");
    script += `$t=${quote(args.text)};[Windows.Forms.Clipboard]::SetText($t);[Windows.Forms.SendKeys]::SendWait('^v')`;
    auditDetail.length = args.text.length;
  } else if (action === "press") {
    const key = mappedKey(args.key); if (!key) throw new Error("unsupported key");
    script += `[Windows.Forms.SendKeys]::SendWait(${quote(key)})`; auditDetail.key = String(args.key || "").toUpperCase();
  } else if (action === "hotkey") {
    const keys = Array.isArray(args.keys) ? args.keys.map(x => String(x).toUpperCase()) : [];
    let prefix = ""; if (keys.includes("CTRL")) prefix += "^"; if (keys.includes("ALT")) prefix += "%"; if (keys.includes("SHIFT")) prefix += "+";
    const key = mappedKey(keys.find(x => !["CTRL", "ALT", "SHIFT"].includes(x))); if (!key) throw new Error("unsupported hotkey");
    script += `[Windows.Forms.SendKeys]::SendWait(${quote(prefix + key)})`; auditDetail.keys = keys;
  } else throw new Error("unsupported keyboard action");
  await ps(script);
  audit("desktop_keyboard", auditDetail);
  return { content: [{ type: "text", text: "Keyboard action sent" }] };
}

async function windowsList() {
  const output = await ps(`Get-Process|?{$_.MainWindowHandle-ne 0}|select Id,ProcessName,MainWindowTitle|ConvertTo-Json -Compress`);
  let windows = [];
  try { const parsed = JSON.parse(output || "[]"); windows = Array.isArray(parsed) ? parsed : [parsed]; } catch {}
  audit("desktop_windows", { count: windows.length });
  return { content: [{ type: "text", text: JSON.stringify(windows, null, 2) }], structuredContent: { windows } };
}

export async function callDesktopTool(name, args = {}) {
  requireEnabled(name);
  if (name === "desktop_screenshot") return screenshot();
  if (name === "desktop_mouse") return mouse(args);
  if (name === "desktop_keyboard") return keyboard(args);
  if (name === "desktop_windows") return windowsList();
  throw new Error("Unknown desktop tool");
}
