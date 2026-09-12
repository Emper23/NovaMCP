import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const OWNER = "Emper23";
const REPO = "NovaMCP";
const RELEASE_API = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;
const RELEASE_PAGE = `https://github.com/${OWNER}/${REPO}/releases/latest`;

let updater = null;
let electronApp = null;
let initialized = false;
let checkTimer = null;

const updateState = {
  supported: false,
  mode: "standalone",
  status: "idle",
  currentVersion: "0.0.0",
  latestVersion: null,
  available: false,
  downloaded: false,
  progress: 0,
  bytesPerSecond: 0,
  transferred: 0,
  total: 0,
  releaseName: null,
  releaseNotes: null,
  downloadUrl: RELEASE_PAGE,
  checkedAt: null,
  error: null
};

function cleanVersion(value) {
  return String(value || "0.0.0").trim().replace(/^v/i, "").split("-")[0];
}

function compareVersions(a, b) {
  const aa = cleanVersion(a).split(".").map(part => Number.parseInt(part, 10) || 0);
  const bb = cleanVersion(b).split(".").map(part => Number.parseInt(part, 10) || 0);
  const length = Math.max(aa.length, bb.length, 3);
  for (let index = 0; index < length; index += 1) {
    const left = aa[index] || 0;
    const right = bb[index] || 0;
    if (left > right) return 1;
    if (left < right) return -1;
  }
  return 0;
}

function publicState() {
  return { ...updateState };
}

function setState(patch) {
  Object.assign(updateState, patch);
  return publicState();
}

function portableAsset(release) {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const portable = assets.find(asset => /^NovaMCP-Portable-.*-x64\.exe$/i.test(asset?.name || ""));
  const setup = assets.find(asset => /^NovaMCP-Setup-.*-x64\.exe$/i.test(asset?.name || ""));
  return portable || setup || null;
}

async function fetchLatestRelease() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(RELEASE_API, {
      signal: controller.signal,
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "NovaMCP-Updater"
      }
    });
    if (!response.ok) throw new Error(`GitHub release check failed: HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function checkPortableOrStandalone() {
  setState({ status: "checking", error: null, checkedAt: new Date().toISOString() });
  try {
    const release = await fetchLatestRelease();
    const latestVersion = cleanVersion(release?.tag_name || release?.name);
    const asset = portableAsset(release);
    const available = compareVersions(latestVersion, updateState.currentVersion) > 0;
    return setState({
      status: available ? "available" : "up-to-date",
      latestVersion,
      available,
      downloaded: false,
      progress: 0,
      releaseName: release?.name || `NovaMCP ${latestVersion}`,
      releaseNotes: typeof release?.body === "string" ? release.body.slice(0, 4000) : null,
      downloadUrl: asset?.browser_download_url || release?.html_url || RELEASE_PAGE,
      error: null
    });
  } catch (error) {
    return setState({ status: "error", error: error.message || String(error) });
  }
}

function wireUpdaterEvents() {
  updater.on("checking-for-update", () => setState({ status: "checking", error: null, checkedAt: new Date().toISOString() }));
  updater.on("update-available", info => setState({
    status: "available",
    latestVersion: cleanVersion(info?.version),
    available: true,
    downloaded: false,
    progress: 0,
    releaseName: info?.releaseName || `NovaMCP ${cleanVersion(info?.version)}`,
    releaseNotes: typeof info?.releaseNotes === "string" ? info.releaseNotes.slice(0, 4000) : null,
    error: null
  }));
  updater.on("update-not-available", info => setState({
    status: "up-to-date",
    latestVersion: cleanVersion(info?.version || updateState.currentVersion),
    available: false,
    downloaded: false,
    progress: 0,
    error: null
  }));
  updater.on("download-progress", progress => setState({
    status: "downloading",
    progress: Math.max(0, Math.min(100, Number(progress?.percent) || 0)),
    bytesPerSecond: Number(progress?.bytesPerSecond) || 0,
    transferred: Number(progress?.transferred) || 0,
    total: Number(progress?.total) || 0,
    error: null
  }));
  updater.on("update-downloaded", info => setState({
    status: "downloaded",
    latestVersion: cleanVersion(info?.version || updateState.latestVersion),
    available: true,
    downloaded: true,
    progress: 100,
    error: null
  }));
  updater.on("error", error => setState({ status: "error", error: error?.message || String(error) }));
}

export function getUpdateState() {
  return publicState();
}

export async function initializeUpdater(app) {
  if (initialized) return publicState();
  initialized = true;
  electronApp = app;
  const portable = Boolean(process.env.PORTABLE_EXECUTABLE_FILE || process.env.PORTABLE_EXECUTABLE_DIR);
  const mode = !app?.isPackaged ? "development" : portable ? "portable" : "setup";
  setState({
    mode,
    supported: mode === "setup",
    currentVersion: cleanVersion(app?.getVersion?.() || "0.0.0"),
    status: "idle",
    downloadUrl: RELEASE_PAGE
  });

  if (mode === "setup") {
    try {
      ({ autoUpdater: updater } = require("electron-updater"));
      updater.setFeedURL({ provider: "github", owner: OWNER, repo: REPO });
      updater.autoDownload = false;
      updater.autoInstallOnAppQuit = true;
      updater.allowPrerelease = false;
      wireUpdaterEvents();
    } catch (error) {
      setState({ status: "error", supported: false, error: `Updater initialization failed: ${error.message}` });
    }
  }

  checkTimer = setTimeout(() => {
    checkForUpdates().catch(() => {});
  }, 4500);
  checkTimer.unref?.();
  return publicState();
}

export async function checkForUpdates() {
  if (!initialized || updateState.mode !== "setup" || !updater) {
    return checkPortableOrStandalone();
  }
  setState({ status: "checking", error: null, checkedAt: new Date().toISOString() });
  try {
    await updater.checkForUpdates();
  } catch (error) {
    setState({ status: "error", error: error.message || String(error) });
  }
  return publicState();
}

export async function downloadUpdate() {
  if (updateState.mode !== "setup" || !updater) {
    if (!updateState.latestVersion) await checkPortableOrStandalone();
    return { ...publicState(), openUrl: updateState.downloadUrl || RELEASE_PAGE };
  }
  if (!updateState.available) throw new Error("No NovaMCP update is available");
  if (updateState.downloaded) return publicState();
  setState({ status: "downloading", progress: 0, error: null });
  try {
    await updater.downloadUpdate();
  } catch (error) {
    setState({ status: "error", error: error.message || String(error) });
    throw error;
  }
  return publicState();
}

export function installUpdate() {
  if (updateState.mode !== "setup" || !updater) throw new Error("In-app install is available only in the Setup edition");
  if (!updateState.downloaded) throw new Error("Download the update before installing it");
  setState({ status: "installing", error: null });
  setImmediate(() => updater.quitAndInstall(false, true));
  return publicState();
}

export function shutdownUpdater() {
  if (checkTimer) clearTimeout(checkTimer);
  checkTimer = null;
}
