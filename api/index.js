// O schema é preparado no build; requisições não abrem uma porta nem executam migrations.
const { handleRequest } = require("../src/server/router");
const rateLimit = require("../src/middleware/rate-limit");

rateLimit.startCleanup();

module.exports = handleRequest;
