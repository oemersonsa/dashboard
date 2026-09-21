const { MAX_BODY_BYTES } = require("../config/env");
const { Errors } = require("../utils/errors");

async function readJsonBody(req) {
  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("application/json")) {
    throw Errors.unsupportedType();
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw Errors.tooLarge();
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

module.exports = { readJsonBody };