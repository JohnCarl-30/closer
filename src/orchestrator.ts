import {
  overallConfidence,
  scoreEmail,
  scoreMatch,
  extractIdentifiers,
  shouldAct,
} from "./confidence";
import { makeTracer, newRunId, type Tracer } from "./trace";
import { shipComment, shipEmail, commentMentionsPr, isDoneState } from "./ship";
import { verifyPlan } from "./verify";
import { createMockApps } from "./apps/mock";
import { DEMO_PR_URL, DEMO_SEED } from "./apps/demo-seed";
import {
  CONFIDENCE_THRESHOLD,
  type OrchestratorResult,
  type Plan,
  type Pull,
  type RunStatus,
  type Issue,
} from "./types";
import type { Apps } from "./apps/types";

function emptyPlan(pr: Pull, reasons: string[]): Plan {
  return {
    pr,
    issue: null,
    candidates: [],
    email: null,
    comment: "",
    confidence: { match: 0, email: 0, overall: 0 },
    reasons,
  };
}

function assemblePlan(
  pr: Pull,
  matchIssue: Issue | null,
  candidates: Issue[],
  matchScore: number,
  extraReasons: string[] = [],
): Plan {
  const email = scoreEmail(pr, matchIssue);
  const overall = overallConfidence(matchScore, email.score);
  const reasons = extraReasons.concat(email.reasons);
  return {
    pr,
    issue: matchIssue,
    candidates,
    email:
      matchIssue && email.to ? shipEmail(pr, matchIssue, email.to) : null,
    comment: matchIssue ? shipComment(pr.url) : "",
    confidence: { match: matchScore, email: email.score, overall },
    reasons,
  };
}

/**
 * Attempts one write. Records it in `writes` only if it lands, and swallows the
 * failure so the run always reaches the verifier — which is the only thing
 * allowed to decide what actually happened.
 */
async function attempt(
  tracer: Tracer,
  writes: string[],
  name: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn();
    writes.push(name);
  } catch {
    // left for the verifier to report as missing
  }
}

function result(
  status: RunStatus,
  plan: Plan,
  traces: Tracer,
  extra: Partial<OrchestratorResult> = {},
): OrchestratorResult {
  traces.push({ type: "status", note: status, agent: "writer" });
  return {
    status,
    plan,
    verification: null,
    writes: [],
    traces: traces.traces,
    ...extra,
  };
}

async function loadIssues(apps: Apps, tracer: Tracer, pr: Pull): Promise<Issue[]> {
  const listed = await tracer.call(
    "linear.searchIssues",
    { q: pr.branch },
    () => apps.linear.searchIssues(pr.branch),
    "writer",
  );
  const byId = new Map(listed.map((i) => [i.identifier, i]));
  const ids = [
    ...extractIdentifiers(pr.body),
    ...extractIdentifiers(pr.branch.replaceAll("/", " ")),
  ];
  for (const id of ids) {
    if (byId.has(id)) continue;
    const one = await tracer.call(
      "linear.getIssueByIdentifier",
      { id },
      () => apps.linear.getIssueByIdentifier(id),
      "writer",
    );
    if (one) byId.set(one.identifier, one);
  }
  return [...byId.values()];
}

export async function plan(
  apps: Apps,
  prUrl: string,
  tracer = makeTracer(newRunId()),
): Promise<OrchestratorResult> {
  tracer.push({ type: "status", note: "planning", agent: "writer" });
  const pr = await tracer.call(
    "github.getPull",
    { prUrl },
    () => apps.github.getPull(prUrl),
    "writer",
  );

  if (!pr.merged) {
    const planned = emptyPlan(pr, ["pr_not_merged"]);
    tracer.push({
      type: "gate",
      note: "pr_not_merged",
      confidence: planned.confidence,
      agent: "writer",
    });
    return result("escalated", planned, tracer);
  }

  const issues = await loadIssues(apps, tracer, pr);
  const match = scoreMatch(pr, issues);
  const planned = assemblePlan(
    pr,
    match.issue,
    match.candidates,
    match.score,
    match.reasons,
  );

  tracer.push({
    type: "gate",
    confidence: planned.confidence,
    note: planned.reasons.join("; "),
    agent: "writer",
  });

  if (match.candidates.length > 1 && !match.issue) {
    return result("needs_choice", planned, tracer);
  }

  if (!shouldAct(match.score, planned.confidence.email, pr.merged)) {
    planned.reasons.push(`below threshold ${CONFIDENCE_THRESHOLD}`);
    return result("escalated", planned, tracer);
  }

  return result("awaiting_approval", planned, tracer);
}

export function chooseIssue(
  prior: OrchestratorResult,
  identifier: string,
): OrchestratorResult {
  if (prior.status !== "needs_choice") {
    throw new Error(`cannot choose from ${prior.status}`);
  }
  const picked = prior.plan.candidates.find((c) => c.identifier === identifier);
  if (!picked) {
    throw new Error(`not a candidate: ${identifier}`);
  }
  const tracer = makeTracer(prior.traces[0]?.runId ?? newRunId());
  tracer.traces.push(...prior.traces);
  tracer.push({
    type: "approval",
    note: `chose ${identifier}`,
    agent: "writer",
  });
  const planned = assemblePlan(
    prior.plan.pr,
    picked,
    prior.plan.candidates,
    0.96,
    [`human picked ${picked.identifier}`],
  );
  if (!shouldAct(0.96, planned.confidence.email, true)) {
    planned.reasons.push(`below threshold ${CONFIDENCE_THRESHOLD}`);
    return result("escalated", planned, tracer);
  }
  return result("awaiting_approval", planned, tracer);
}

export async function execute(
  apps: Apps,
  prior: OrchestratorResult,
): Promise<OrchestratorResult> {
  const tracer = makeTracer(prior.traces[0]?.runId ?? newRunId());
  tracer.traces.push(...prior.traces);
  tracer.push({ type: "approval", note: "approved", agent: "writer" });

  const { plan: next } = prior;
  if (!next.issue || !next.email) {
    return { ...prior, status: "escalated", traces: tracer.traces };
  }

  const writes = [...prior.writes];
  const sinceUnix = Math.floor(Date.now() / 1000) - 5;
  tracer.push({ type: "status", note: "writing", agent: "writer" });

  const current = await tracer.call(
    "linear.getIssue",
    { id: next.issue.id },
    () => apps.linear.getIssue(next.issue!.id),
    "writer",
  );
  const existingComments = await tracer.call(
    "linear.listComments",
    { id: next.issue.id },
    () => apps.linear.listComments(next.issue!.id),
    "writer",
  );
  const alreadyDone = isDoneState(current.state);
  const alreadyCommented = commentMentionsPr(existingComments, next.pr.url);

  if (!alreadyDone) {
    await attempt(tracer, writes, "linear.setState", () =>
      tracer.call(
        "linear.setState",
        { issueId: next.issue!.id, state: "Done" },
        () => apps.linear.setState(next.issue!.id, "Done"),
        "writer",
      ),
    );
  }

  if (!alreadyCommented) {
    await attempt(tracer, writes, "linear.comment", () =>
      tracer.call(
        "linear.comment",
        { issueId: next.issue!.id, body: next.comment },
        () => apps.linear.comment(next.issue!.id, next.comment),
        "writer",
      ),
    );
  }

  await attempt(tracer, writes, "gmail.send", () =>
    tracer.call("gmail.send", next.email, () => apps.gmail.send(next.email!), "writer"),
  );

  const verification = await verifyPlan(apps, next, sinceUnix, tracer);
  const status: RunStatus = verification.missing.length ? "failed" : "done";
  tracer.push({ type: "status", note: status, agent: "verifier" });
  return {
    status,
    plan: next,
    verification,
    writes,
    traces: tracer.traces,
  };
}

export async function retryMissing(
  apps: Apps,
  prior: OrchestratorResult,
): Promise<OrchestratorResult> {
  if (
    prior.status !== "failed" ||
    !prior.verification ||
    !prior.plan.issue ||
    !prior.plan.email
  ) {
    return prior;
  }
  const tracer = makeTracer(prior.traces[0]?.runId ?? newRunId());
  tracer.traces.push(...prior.traces);
  const writes = [...prior.writes];
  const sinceUnix = Math.floor(Date.now() / 1000) - 5;

  const { issue, email } = prior.plan;
  const missing = prior.verification.missing;

  if (missing.includes("linear.state")) {
    await attempt(tracer, writes, "linear.setState", () =>
      tracer.call(
        "linear.setState",
        { issueId: issue!.id, state: "Done" },
        () => apps.linear.setState(issue!.id, "Done"),
        "writer",
      ),
    );
  }

  if (missing.includes("linear.comment")) {
    await attempt(tracer, writes, "linear.comment", () =>
      tracer.call(
        "linear.comment",
        { issueId: issue!.id, body: prior.plan.comment },
        () => apps.linear.comment(issue!.id, prior.plan.comment),
        "writer",
      ),
    );
  }

  if (missing.includes("gmail")) {
    await attempt(tracer, writes, "gmail.send", () =>
      tracer.call("gmail.send", email, () => apps.gmail.send(email!), "writer"),
    );
  }

  const verification = await verifyPlan(apps, prior.plan, sinceUnix, tracer);
  const status: RunStatus = verification.missing.length ? "failed" : "done";
  return {
    status,
    plan: prior.plan,
    verification,
    writes,
    traces: tracer.traces,
  };
}

export async function planAndExecute(
  apps: Apps,
  prUrl: string,
): Promise<OrchestratorResult> {
  const planned = await plan(apps, prUrl);
  if (planned.status !== "awaiting_approval") return planned;
  return execute(apps, planned);
}

export async function replaySilent200(): Promise<OrchestratorResult> {
  const apps = createMockApps(DEMO_SEED, [
    { tool: "gmail.send", persistSent: false },
  ]);
  return planAndExecute(apps, DEMO_PR_URL);
}
