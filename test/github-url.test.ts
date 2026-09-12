import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePullUrl } from "../src/github-url.ts";

test("parsePullUrl reads owner repo number", () => {
  assert.deepEqual(
    parsePullUrl("https://github.com/JohnCarl-30/closer-demo/pull/1"),
    { owner: "JohnCarl-30", repo: "closer-demo", number: "1" },
  );
});

test("parsePullUrl allows trailing slash", () => {
  assert.equal(
    parsePullUrl("https://github.com/acme/app/pull/12/").number,
    "12",
  );
});

test("parsePullUrl rejects junk", () => {
  assert.throws(() => parsePullUrl("https://github.com/acme/app/issues/1"), /not a GitHub pull URL/);
  assert.throws(() => parsePullUrl("not-a-url"), /not a GitHub pull URL/);
});
