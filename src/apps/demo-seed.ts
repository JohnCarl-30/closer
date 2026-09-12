import type { SeedIssue, SeedPull } from "./mock";

export const DEMO_PR_URL = "https://github.com/JohnCarl-30/closer-demo/pull/1";
export const DEMO_AMBIGUOUS_PR_URL =
  "https://github.com/JohnCarl-30/closer-demo/pull/3";

export const DEMO_PULL: SeedPull = {
  url: DEMO_PR_URL,
  number: 1,
  title: "Fix auth callback 500",
  body: "Ship the retry on the OAuth callback.",
  merged: true,
  branch: "fix/eng-19-auth-callback",
};

export const DEMO_AMBIGUOUS_PULL: SeedPull = {
  url: DEMO_AMBIGUOUS_PR_URL,
  number: 3,
  title: "Auth tweaks",
  body: "Small auth fix.",
  merged: true,
  branch: "fix/auth-login",
};

export const DEMO_ISSUE: SeedIssue = {
  id: "issue-19",
  identifier: "ENG-19",
  title: "Auth callback 500",
  url: "https://linear.app/demo/issue/ENG-19",
  state: "In Progress",
  subscriberEmail: "ask@example.com",
  assigneeEmail: null,
  comments: [],
};

export const DEMO_ISSUE_20: SeedIssue = {
  id: "issue-20",
  identifier: "ENG-20",
  title: "Auth retry storm",
  url: "https://linear.app/demo/issue/ENG-20",
  state: "In Progress",
  subscriberEmail: "ask@example.com",
  assigneeEmail: null,
  comments: [],
};

export const DEMO_SEED = {
  pulls: [DEMO_PULL, DEMO_AMBIGUOUS_PULL],
  issues: [DEMO_ISSUE, DEMO_ISSUE_20],
  sent: [],
};
