const path = require("path");

const IS_ELECTRON = !!process.versions?.electron;
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

function getDefaultDataDir() {
  if (!IS_ELECTRON) return path.join(PROJECT_ROOT, ".data");
  try {
    return require("electron").app.getPath("userData");
  } catch {
    return path.join(PROJECT_ROOT, ".data");
  }
}

const DATA_DIR = process.env.SQLITE_DATA_DIR || 
                 (process.env.RAILWAY_ENVIRONMENT ? "/data" : path.join(PROJECT_ROOT, ".data"));

const DB_FILE = process.env.SQLITE_DATABASE_PATH || 
                path.join(DATA_DIR, "dashboard-vendas.sqlite");
const LEGACY_USER_STORE_FILE = path.join(DATA_DIR, "users.json");
const SESSION_STORE_FILE = path.join(DATA_DIR, "sessions.json");
const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");

module.exports = {
  IS_ELECTRON,
  PROJECT_ROOT,
  DATA_DIR,
  DB_FILE,
  LEGACY_USER_STORE_FILE,
  SESSION_STORE_FILE,
  PUBLIC_DIR
};