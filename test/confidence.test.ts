import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractIdentifiers,
  extractMailto,
  overallConfidence,
  scoreEmail,
  scoreMatch,
  shouldAct,
  tokens,
} from "../src/confidence.ts";
import { CONFIDENCE_THRESHOLD } from "../src/types.ts";
import { issue, pull } from "./fixtures.ts";

test("extractIdentifiers finds Linear ids in body and branch", () => {
  assert.deepEqual(extractIdentifiers("Closes ENG-19"), ["ENG-19"]);
  assert.deepEqual(extractIdentifiers("fix/eng-19-auth-callback".replaceAll("/", " ")), [
    "ENG-19",
  ]);
  assert.deepEqual(extractIdentifiers("ENG-19 and ENG-20"), ["ENG-19", "ENG-20"]);
  assert.deepEqual(extractIdentifiers("no ticket here"), []);
});

test("extractMailto prefers mailto: over a bare address", () => {
  assert.equal(
    extractMailto("Closes ENG-19\n\nmailto:other@example.com"),
    "other@example.com",
  );
  assert.equal(extractMailto("ping ask@example.com please"), "ask@example.com");
  assert.equal(extractMailto("no mail"), null);
});

test("tokens drop short words and fix/feat/chore", () => {
  const t = tokens("fix/eng-19-auth-callback");
  assert.equal(t.has("fix"), false);
  assert.equal(t.has("auth"), true);
  assert.equal(t.has("callback"), true);
  assert.equal(t.has("eng"), false);
});

test("scoreMatch prefers PR body identifier", () => {
  const got = scoreMatch(pull({ body: "Closes ENG-19", branch: "fix/callback-retry" }), [
    issue(),
  ]);
  assert.equal(got.score, 0.95);
  assert.equal(got.issue?.identifier, "ENG-19");
});

test("scoreMatch uses branch identifier when body has none", () => {
  const got = scoreMatch(pull({ body: "Ship the retry." }), [issue()]);
  assert.equal(got.score, 0.93);
  assert.equal(got.issue?.identifier, "ENG-19");
});

test("scoreMatch escalates when two issues share branch tokens", () => {
  const got = scoreMatch(pull({ body: "Small auth fix.", branch: "fix/auth-login" }), [
    issue(),
    issue({
      id: "issue-20",
      identifier: "ENG-20",
      title: "Auth retry storm",
      url: "https://linear.app/demo/issue/ENG-20",
    }),
  ]);
  assert.equal(got.score, 0.4);
  assert.equal(got.issue, null);
  assert.deepEqual(
    got.candidates.map((c) => c.identifier),
    ["ENG-19", "ENG-20"],
  );
  assert.match(got.reasons[0] ?? "", /ambiguous/);
});

test("scoreMatch returns 0.1 when nothing overlaps", () => {
  const got = scoreMatch(pull({ body: "CSV dump.", branch: "fix/payments-export" }), [
    issue(),
  ]);
  assert.equal(got.score, 0.1);
  assert.equal(got.issue, null);
  assert.deepEqual(got.candidates, []);
});

test("scoreEmail uses Linear subscriber", () => {
  const got = scoreEmail(pull(), issue());
  assert.equal(got.score, 0.9);
  assert.equal(got.to, "ask@example.com");
});

test("scoreEmail escalates on Linear vs mailto mismatch", () => {
  const got = scoreEmail(
    pull({ body: "Closes ENG-19\nmailto:other@example.com" }),
    issue(),
  );
  assert.equal(got.score, 0.2);
  assert.equal(got.to, null);
});

test("scoreEmail is 0.05 with no recipient", () => {
  const got = scoreEmail(pull({ body: "No one to email." }), issue({
    subscriberEmail: null,
    assigneeEmail: null,
  }));
  assert.equal(got.score, 0.05);
  assert.equal(got.to, null);
});

test("shouldAct requires merge and overall >= 0.75", () => {
  assert.equal(shouldAct(0.93, 0.9, true), true);
  assert.equal(shouldAct(0.93, 0.05, true), false);
  assert.equal(shouldAct(0.95, 0.9, false), false);
  assert.equal(overallConfidence(0.93, 0.9), 0.9);
  assert.ok(overallConfidence(0.93, 0.9) >= CONFIDENCE_THRESHOLD);
});
