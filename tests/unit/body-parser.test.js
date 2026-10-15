import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { Readable } from "node:stream";
const require = createRequire(import.meta.url);
const { readJsonBody } = require("../../src/middleware/body-parser");
const { MAX_BODY_BYTES } = require("../../src/config/env");

function request(body, contentType = "application/json") {
  return { headers: { "content-type": contentType }, body };
}

describe("JSON no servidor e na Vercel", () => {
  it("aceita objeto, texto e Buffer previamente lidos", async () => {
    for (const body of [{ value: 12 }, '{"value":12}', Buffer.from('{"value":12}')]) {
      expect(await readJsonBody(request(body))).toEqual({ value: 12 });
    }
  });
  it("preserva a leitura do stream no servidor local", async () => {
    const req = Readable.from([Buffer.from('{"value":12}')]);
    req.headers = { "content-type": "application/json" };
    expect(await readJsonBody(req)).toEqual({ value: 12 });
  });
  it("rejeita JSON inválido, tipo incorreto e conteúdo excessivo", async () => {
    await expect(readJsonBody(request("{"))).rejects.toMatchObject({ statusCode: 400 });
    await expect(readJsonBody(request({}, "text/plain"))).rejects.toMatchObject({ statusCode: 415 });
    await expect(readJsonBody(request({ value: "x".repeat(MAX_BODY_BYTES) }))).rejects.toMatchObject({ statusCode: 413 });
  });
});
