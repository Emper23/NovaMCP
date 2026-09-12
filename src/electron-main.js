import { app, BrowserWindow, shell, dialog } from "electron";
import http from "node:http";
import net from "node:net";
import { loadConfig } from "./config-store.js";

const APP_ID = "com.emperhub.novamcp";
app.setAppUserModelId(APP_ID);

let mainWindow = null;
let dashboardModule = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

function httpJson(url, timeoutMs = 900) {
  return new Promise(resolve => {
    const req = http.get(url, response => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { if (text.length < 65536) text += chunk; });
      response.on("end", () => {
        if ((response.statusCode || 500) >= 400) return resolve(null);
        try { resolve(JSON.parse(text)); } catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(null); });
  });
}

async function probeNovaDashboard(url) {
  const data = await httpJson(new URL("api/status", url).href);
  return data && data.name === "NovaMCP" ? data : null;
}

function portAvailable(host, port) {
  return new Promise(resolve => {
    const probe = net.createServer();
    probe.unref();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, host);
  });
}

async function findFreePort(host, startPort, attempts = 100) {
  for (let port = startPort; port < startPort + attempts; port += 1) {
    if (await portAvailable(host, port)) return port;
  }
  throw new Error(`No free NovaMCP dashboard port found near ${startPort}`);
}

function waitForDashboard(url, timeoutMs = 15000) {
  const started = Date.now();
  return new Promise((resolveWait, reject) => {
    const check = () => {
      if (Date.now() - started > timeoutMs) return reject(new Error("NovaMCP Dashboard did not start in time"));
      const req = http.get(url, response => {
        response.resume();
        if ((response.statusCode || 500) < 500) return resolveWait();
        setTimeout(check, 250);
      });
      req.on("error", () => setTimeout(check, 250));
      req.setTimeout(1000, () => { req.destroy(); setTimeout(check, 250); });
    };
    check();
  });
}

async function createWindow() {
  const config = loadConfig();
  const dashboardHost = config.security?.requireLocalDashboard !== false ? "127.0.0.1" : (config.dashboard?.host || "127.0.0.1");
  const requestedPort = config.dashboard?.port || 8181;
  let dashboardPort = requestedPort;
  let dashboardUrl = `http://${dashboardHost}:${dashboardPort}/`;
  const existingDashboard = await probeNovaDashboard(dashboardUrl);
  if (existingDashboard) {
    console.error(`[NovaMCP] Reusing existing dashboard at ${dashboardUrl}`);
    dashboardModule = null;
  } else {
    if (!(await portAvailable(dashboardHost, dashboardPort))) {
      dashboardPort = await findFreePort(dashboardHost, requestedPort + 1);
      dashboardUrl = `http://${dashboardHost}:${dashboardPort}/`;
      console.error(`[NovaMCP] Dashboard port ${requestedPort} is busy; using ${dashboardPort}`);
    }
    process.env.NOVA_MCP_DASHBOARD_HOST = dashboardHost;
    process.env.NOVA_MCP_DASHBOARD_PORT = String(dashboardPort);
    dashboardModule = await import("./dashboard.js");
    await waitForDashboard(dashboardUrl);
  }

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 650,
    backgroundColor: "#070913",
    title: "NovaMCP Control Center",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged
    }
  });

  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url !== dashboardUrl) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[NovaMCP] Renderer process gone: ${details.reason}`);
  });
  mainWindow.on("closed", () => { mainWindow = null; });
  await mainWindow.loadURL(dashboardUrl);
}

app.whenReady().then(createWindow).catch(error => {
  console.error(`[NovaMCP] ${error.stack || error.message}`);
  dialog.showErrorBox("NovaMCP failed to start", `${error.message || error}\n\nConfig: %APPDATA%\\NovaMCP\\config.json`);
  app.quit();
});

app.on("activate", () => {
  if (!mainWindow) createWindow().catch(error => console.error(error));
});

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  try { dashboardModule?.shutdown?.(); } catch {}
});
