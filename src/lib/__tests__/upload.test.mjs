import assert from "node:assert/strict";
import { test } from "node:test";
import { readUpload } from "../upload.ts";

test("reads a File", async () => {
  const r = await readUpload(new File([new Uint8Array([1, 2, 3])], "logo.png", { type: "image/png" }));
  assert.equal(r.size, 3); assert.equal(r.type, "image/png"); assert.equal(r.bytes.byteLength, 3);
});
test("reads a File-like object from another realm (no instanceof)", async () => {
  const fake = { size: 2, type: "image/jpeg", arrayBuffer: async () => new Uint8Array([9, 9]).buffer };
  const r = await readUpload(fake);
  assert.equal(r.size, 2);
});
test("empty file input and strings are ignored", async () => {
  assert.equal(await readUpload(new File([], "", { type: "application/octet-stream" })), null);
  assert.equal(await readUpload("text"), null);
  assert.equal(await readUpload(null), null);
});
