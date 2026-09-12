import assert from "node:assert/strict";
import { test } from "node:test";
import { liveFlags, resolveAppsMode } from "../src/apps/mode.ts";
import {
  commentMentionsPr,
  isDoneState,
  shipComment,
  shipEmail,
} from "../src/ship.ts";
import { issue, pull } from "./fixtures.ts";

test("resolveAppsMode is mock, mixed, or live", () => {
  assert.equal(
    resolveAppsMode({ github: false, linear: false, gmail: false }),
    "mock",
  );
  assert.equal(
    resolveAppsMode({ github: true, linear: false, gmail: false }),
    "mixed",
  );
  assert.equal(
    resolveAppsMode({ github: true, linear: true, gmail: true }),
    "live",
  );
});

test("liveFlags needs Linear key and Done state together", () => {
  assert.equal(
    liveFlags({ GITHUB_TOKEN: "g", LINEAR_API_KEY: "l" }).linear,
    false,
  );
  assert.equal(
    liveFlags({
      GITHUB_TOKEN: "g",
      LINEAR_API_KEY: "l",
      LINEAR_DONE_STATE_ID: "done",
    }).linear,
    true,
  );
});

test("ship helpers", () => {
  const pr = pull();
  const ticket = issue();
  assert.equal(shipComment(pr.url), `Shipped in ${pr.url}`);
  assert.equal(
    shipEmail(pr, ticket, "ask@example.com").subject,
    "Shipped: ENG-19 Auth callback 500",
  );
  assert.equal(isDoneState("Done"), true);
  assert.equal(isDoneState("In Progress"), false);
  assert.equal(
    commentMentionsPr([{ id: "c1", body: `Shipped in ${pr.url}` }], pr.url),
    true,
  );
  assert.equal(commentMentionsPr([{ id: "c1", body: "n/a" }], pr.url), false);
});
