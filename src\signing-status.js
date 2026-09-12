import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { basename, join } from "node:path";

const execFileAsync = promisify(execFile);
let cache = null;
let cacheAt = 0;

export async function getSigningStatus(force = false) {
  if (!force && cache && Date.now() - cacheAt < 30000) return cache;
  const executable = process.execPath;
  const name = basename(executable).toLowerCase();
  const development = name === "node.exe" || name === "electron.exe";
  const credentialsConfigured = Boolean(process.env.CSC_LINK || process.env.WIN_CSC_LINK || process.env.CSC_NAME);
  if (development) {
    cache = {
      mode: "development",
      executable,
      signed: false,
      status: "Development",
      subject: null,
      issuer: null,
      credentialsConfigured,
      recommendation: credentialsConfigured ? "Signing credentials are configured for release builds." : "Add a trusted Windows code-signing certificate before public distribution."
    };
    cacheAt = Date.now();
    return cache;
  }

  const ps = join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  try {
    const command = `$s=Get-AuthenticodeSignature -LiteralPath '${executable.replaceAll("'", "''")}'; [pscustomobject]@{Status=$s.Status.ToString();Subject=$s.SignerCertificate.Subject;Issuer=$s.SignerCertificate.Issuer;NotAfter=if($s.SignerCertificate){$s.SignerCertificate.NotAfter.ToString('o')}else{$null}} | ConvertTo-Json -Compress`;
    const { stdout } = await execFileAsync(ps, ["-NoProfile", "-Command", command], { windowsHide: true, timeout: 5000 });
    const info = JSON.parse(String(stdout || "{}").trim() || "{}");
    const signed = info.Status === "Valid";
    cache = {
      mode: "packaged",
      executable,
      signed,
      status: info.Status || "Unknown",
      subject: info.Subject || null,
      issuer: info.Issuer || null,
      notAfter: info.NotAfter || null,
      credentialsConfigured,
      recommendation: signed ? "Valid Authenticode signature detected." : "This build is not signed by a trusted certificate. Configure CSC_LINK / CSC_KEY_PASSWORD for signed releases."
    };
  } catch (error) {
    cache = {
      mode: "packaged",
      executable,
      signed: false,
      status: "Unknown",
      subject: null,
      issuer: null,
      credentialsConfigured,
      recommendation: `Signature check failed: ${error.message}`
    };
  }
  cacheAt = Date.now();
  return cache;
}
