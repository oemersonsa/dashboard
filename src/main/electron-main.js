const path = require("path");
const fs = require("fs");
const { app, BrowserWindow, shell } = require("electron");

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

let startServer, stopServer;
try {
  ({ startServer, stopServer } = require("../server"));
} catch (error) {
  writeStartupLog("server module failed", error);
  throw error;
}

let mainWindow = null;
let serverInfo = null;
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

async function createWindow() {
  serverInfo = await startServer({ port: Number(process.env.PORT), host: "127.0.0.1" });

  mainWindow = new BrowserWindow({
    width: 1280, height: 820, minWidth: 1024, minHeight: 700,
    show: false, autoHideMenuBar: true,
    title: "Dashboard de Vendas",
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  await mainWindow.loadURL(serverInfo.url);
}

if (gotLock) {
  app.whenReady().then(() => {
    createWindow().catch((err) => {
      console.error("Falha ao iniciar:", err);
      app.quit();
    });
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow().catch(console.error);
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