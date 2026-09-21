const path = require("path");
const fs = require("fs");
const { createWebServer } = require('electron-to-web/server');
createWebServer({ port: 3001, staticDir: './public' });

// Detecta se está rodando como portable e redireciona os dados
if (process.env.PORTABLE_EXECUTABLE_DIR) {
  const path = require("path");
  const portableDataDir = path.join(process.env.PORTABLE_EXECUTABLE_DIR, "dashboard-data");
  process.env.SQLITE_DATA_DIR = portableDataDir;
  process.env.SQLITE_DATABASE_PATH = path.join(portableDataDir, "dashboard-vendas.sqlite");
}

process.env.PORT = process.env.PORT || "37171";
process.env.HOST = "127.0.0.1";
process.env.APP_ORIGIN = `http://127.0.0.1:${process.env.PORT}`;
process.env.SQLITE_DATA_DIR = app.getPath("userData");
process.env.SQLITE_DATABASE_PATH = path.join(app.getPath("userData"), "dashboard-vendas.sqlite");

const logFile = path.join(app.getPath("userData"), "desktop-startup.log");
function writeStartupLog(message, error = null) {
  const details = error ? ` ${error.stack || error.message || String(error)}` : "";
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}${details}\n`);
}
process.on("uncaughtException", (error) => writeStartupLog("uncaughtException", error));
process.on("unhandledRejection", (error) => writeStartupLog("unhandledRejection", error));

writeStartupLog("electron-main starting");

let startServer, stopServer;
try {
  ({ startServer, stopServer } = require("../server"));
  writeStartupLog("server module loaded");
} catch (error) {
  writeStartupLog("server module failed", error);
  throw error;
}

let mainWindow = null;
let serverInfo = null;
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

async function createWindow() {
  writeStartupLog("starting local server");
  serverInfo = await startServer({ port: Number(process.env.PORT), host: "127.0.0.1" });
  writeStartupLog(`local server ready ${serverInfo.url}`);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    title: "Dashboard de Vendas",
    icon: path.join(__dirname, "..", "..", "public", "assets", "icon.ico"),
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  await mainWindow.loadURL(serverInfo.url);
  writeStartupLog("window loaded");
}

if (gotLock) {
  app.whenReady().then(() => {
    createWindow().catch((error) => {
      console.error("Falha ao iniciar o app desktop:", error);
      app.quit();
    });
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow().catch((error) => console.error("Falha ao reabrir:", error));
      }
    });
  });
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async (event) => {
  if (!serverInfo) return;
  event.preventDefault();
  serverInfo = null;
  try { await stopServer(); } finally { app.exit(0); }
});