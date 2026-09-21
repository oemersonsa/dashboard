function fmt(level, msg, meta) {
  const ts = new Date().toISOString();
  const metaStr = meta ? " " + JSON.stringify(meta) : "";
  return `[${ts}] [${level}] ${msg}${metaStr}`;
}

const logger = {
  info: (msg, meta) => console.log(fmt("INFO ", msg, meta)),
  warn: (msg, meta) => console.warn(fmt("WARN ", msg, meta)),
  error: (msg, meta) => console.error(fmt("ERROR", msg, meta))
};

module.exports = logger;