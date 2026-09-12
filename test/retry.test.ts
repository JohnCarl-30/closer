import assert from "node:assert/strict";
import { test } from "node:test";
import { httpError, is429, retryOn429 } from "../src/apps/retry.ts";

test("is429 reads status and message", () => {
  assert.equal(is429(httpError(429, "rate limited")), true);
  assert.equal(is429(new Error("Linear 429")), true);
  assert.equal(is429(new Error("nope")), false);
  assert.equal(is429(null), false);
});

test("retryOn429 retries then succeeds", async () => {
  let n = 0;
  const value = await retryOn429(async () => {
    n += 1;
    if (n === 1) throw httpError(429, "slow down");
    return "ok";
  });
  assert.equal(value, "ok");
  assert.equal(n, 2);
});

test("retryOn429 does not retry other errors", async () => {
  let n = 0;
  await assert.rejects(
    () =>
      retryOn429(async () => {
        n += 1;
        throw new Error("smtp down");
      }),
    /smtp down/,
  );
  assert.equal(n, 1);
});

test("retryOn429 gives up after three 429s", async () => {
  let n = 0;
  await assert.rejects(
    () =>
      retryOn429(async () => {
        n += 1;
        throw httpError(429, "still 429");
      }),
    /still 429/,
  );
  assert.equal(n, 3);
});
