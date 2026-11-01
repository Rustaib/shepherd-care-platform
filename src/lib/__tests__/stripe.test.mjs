import assert from "node:assert/strict";
import { test } from "node:test";
import { createHmac } from "node:crypto";
import { verifyStripeSignature } from "../stripe-signature.ts";

const secret = "whsec_test";
const payload = JSON.stringify({ type: "customer.subscription.updated" });
const sign = (t, body = payload, key = secret) => `t=${t},v1=${createHmac("sha256", key).update(`${t}.${body}`).digest("hex")}`;
const now = Math.floor(Date.now() / 1000);

test("valid signature", async () => assert.equal(await verifyStripeSignature(payload, sign(now), secret), true));
test("tampered body", async () => assert.equal(await verifyStripeSignature(payload + " ", sign(now), secret), false));
test("wrong secret", async () => assert.equal(await verifyStripeSignature(payload, sign(now, payload, "other"), secret), false));
test("stale timestamp", async () => assert.equal(await verifyStripeSignature(payload, sign(now - 3600), secret), false));
test("missing header", async () => assert.equal(await verifyStripeSignature(payload, null, secret), false));
