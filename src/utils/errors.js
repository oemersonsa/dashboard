class HttpError extends Error {
  constructor(statusCode, code, message) {
    super(message || code);
    this.statusCode = statusCode;
    this.code = code;
  }
}

const Errors = {
  badRequest: (code) => new HttpError(400, code || "bad_request"),
  unauthorized: () => new HttpError(401, "unauthorized"),
  forbidden: () => new HttpError(403, "forbidden"),
  notFound: (code) => new HttpError(404, code || "not_found"),
  conflict: (code) => new HttpError(409, code || "conflict"),
  tooLarge: () => new HttpError(413, "request_too_large"),
  unsupportedType: () => new HttpError(415, "invalid_content_type"),
  tooMany: () => new HttpError(429, "too_many_requests"),
  internal: (msg) => new HttpError(500, "internal_server_error", msg)
};

module.exports = { HttpError, Errors };