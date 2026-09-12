export type RunStatus =
  | "idle"
  | "planning"
  | "needs_choice"
  | "awaiting_approval"
  | "writing"
  | "verifying"
  | "done"
  | "failed"
  | "escalated"
  | "rejected";

export type Pull = {
  url: string;
  number: number;
  title: string;
  body: string;
  merged: boolean;
  branch: string;
};

export type Issue = {
  id: string;
  identifier: string;
  title: string;
  url: string;
  state: string;
  subscriberEmail: string | null;
  assigneeEmail: string | null;
};

export type Comment = {
  id: string;
  body: string;
};

export type Plan = {
  pr: Pull;
  issue: Issue | null;
  candidates: Issue[];
  email: { to: string; subject: string; body: string } | null;
  comment: string;
  confidence: { match: number; email: number; overall: number };
  reasons: string[];
};

export type Verification = {
  linearDone: boolean;
  commentHasPrUrl: boolean;
  gmailSentId: string | null;
  missing: string[];
};

export type TraceEvent = {
  t: number;
  runId: string;
  type: "tool_call" | "tool_result" | "gate" | "approval" | "verify" | "status";
  agent?: "writer" | "verifier";
  tool?: string;
  args?: unknown;
  response?: unknown;
  confidence?: Plan["confidence"];
  note?: string;
  ok?: boolean;
};

export type OrchestratorResult = {
  status: RunStatus;
  plan: Plan;
  verification: Verification | null;
  writes: string[];
  traces: TraceEvent[];
};

export const CONFIDENCE_THRESHOLD = 0.75;
export const DONE_STATE_NAME = "Done";
