import assert from "node:assert/strict";
import { test } from "node:test";
import { createMockApps } from "../src/apps/mock.ts";
import {
  chooseIssue,
  execute,
  plan,
  planAndExecute,
  replaySilent200,
  retryMissing,
} from "../src/orchestrator.ts";
import {
  DEMO_AMBIGUOUS_PR_URL,
  DEMO_PR_URL,
  DEMO_SEED,
} from "../src/apps/demo-seed.ts";

test("plan stops on an unmerged PR and never writes", async () => {
  const apps = createMockApps({
    pulls: [
      {
        url: "https://github.com/acme/app/pull/9",
        number: 9,
        title: "WIP",
        body: "Closes ENG-19",
        merged: false,
        branch: "fix/eng-19-auth-callback",
      },
    ],
    issues: DEMO_SEED.issues,
  });
  const got = await plan(apps, "https://github.com/acme/app/pull/9");
  assert.equal(got.status, "escalated");
  assert.ok(got.plan.reasons.includes("pr_not_merged"));
  assert.deepEqual(got.writes, []);
});

test("plan waits for approval on the demo PR", async () => {
  const apps = createMockApps(DEMO_SEED);
  const got = await plan(apps, DEMO_PR_URL);
  assert.equal(got.status, "awaiting_approval");
  assert.equal(got.plan.issue?.identifier, "ENG-19");
  assert.equal(got.plan.email?.to, "ask@example.com");
  assert.ok(got.plan.confidence.overall >= 0.75);
});

test("execute then retryMissing recovers a silent Gmail 200", async () => {
  const apps = createMockApps(DEMO_SEED, [
    { tool: "gmail.send", persistSent: false, id: "ghost" },
  ]);
  const planned = await plan(apps, DEMO_PR_URL);
  const failed = await execute(apps, planned);
  assert.equal(failed.status, "failed");
  assert.deepEqual(failed.verification?.missing, ["gmail"]);

  const recovered = await retryMissing(apps, failed);
  assert.equal(recovered.status, "done");
  assert.ok(recovered.verification?.gmailSentId);
  assert.ok(recovered.writes.filter((w) => w === "gmail.send").length >= 2);
});

test("planAndExecute happy path writes Linear and Gmail", async () => {
  const apps = createMockApps(DEMO_SEED);
  const got = await planAndExecute(apps, DEMO_PR_URL);
  assert.equal(got.status, "done");
  assert.deepEqual(got.writes, [
    "linear.setState",
    "linear.comment",
    "gmail.send",
  ]);
  assert.ok(
    got.traces.some((t) => t.agent === "writer" && t.tool === "gmail.send"),
  );
  assert.ok(
    got.traces.some((t) => t.agent === "verifier" && t.tool === "gmail.findSent"),
  );
});

test("ambiguous plan asks for a pick, then execute ships the chosen issue", async () => {
  const apps = createMockApps(DEMO_SEED);
  const planned = await plan(apps, DEMO_AMBIGUOUS_PR_URL);
  assert.equal(planned.status, "needs_choice");
  assert.equal(planned.plan.issue, null);
  assert.deepEqual(
    planned.plan.candidates.map((c) => c.identifier).sort(),
    ["ENG-19", "ENG-20"],
  );
  assert.deepEqual(planned.writes, []);

  const picked = chooseIssue(planned, "ENG-20");
  assert.equal(picked.status, "awaiting_approval");
  assert.equal(picked.plan.issue?.identifier, "ENG-20");

  const done = await execute(apps, picked);
  assert.equal(done.status, "done");
  assert.equal(done.plan.issue?.identifier, "ENG-20");
});

test("replaySilent200 fails verify on a send 200 with no sent mail", async () => {
  const got = await replaySilent200();
  assert.equal(got.status, "failed");
  assert.deepEqual(got.verification?.missing, ["gmail"]);
  assert.ok(got.writes.includes("gmail.send"));
  assert.equal(got.verification?.gmailSentId, null);
});
