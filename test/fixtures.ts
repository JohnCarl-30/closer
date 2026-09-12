import type { Issue, Pull } from "../src/types.ts";

export function pull(over: Partial<Pull> = {}): Pull {
  return {
    url: "https://github.com/JohnCarl-30/closer-demo/pull/1",
    number: 1,
    title: "Fix auth callback 500",
    body: "Ship the retry.",
    merged: true,
    branch: "fix/eng-19-auth-callback",
    ...over,
  };
}

export function issue(over: Partial<Issue> = {}): Issue {
  return {
    id: "issue-19",
    identifier: "ENG-19",
    title: "Auth callback 500",
    url: "https://linear.app/demo/issue/ENG-19",
    state: "In Progress",
    subscriberEmail: "ask@example.com",
    assigneeEmail: null,
    ...over,
  };
}
