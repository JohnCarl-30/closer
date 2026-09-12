import { httpError, retryOn429 } from "./retry";
import type { Apps } from "./types";
import type { Comment, Issue, Pull } from "../types";

export type SeedPull = Pull;
export type SeedIssue = Issue & { comments?: Comment[] };
export type SeedSent = { id: string; to: string; subject: string; at: number };

export type MockScriptStep = {
  tool: string;
  http?: number;
  throw?: string;
  persistSent?: boolean;
  id?: string;
};

export type MockSeed = {
  pulls?: SeedPull[];
  issues?: SeedIssue[];
  sent?: SeedSent[];
  doneStateId?: string;
};

export type MockApps = Apps & {
  writes: string[];
};

export function createMockApps(
  seed: MockSeed = {},
  script: MockScriptStep[] = [],
): MockApps {
  const pulls = new Map((seed.pulls ?? []).map((p) => [p.url, { ...p }]));
  const issues = new Map(
    (seed.issues ?? []).map((i) => [i.id, { ...i, comments: [...(i.comments ?? [])] }]),
  );
  const sent: SeedSent[] = [...(seed.sent ?? [])];
  const pending = [...script];
  const writes: string[] = [];
  const doneStateId = seed.doneStateId ?? "done";
  let commentSeq = 1;
  let sendSeq = 1;

  function consume(tool: string): MockScriptStep | undefined {
    const i = pending.findIndex((s) => s.tool === tool);
    if (i === -1) return undefined;
    return pending.splice(i, 1)[0];
  }

  async function applyScript(tool: string): Promise<MockScriptStep | undefined> {
    const step = consume(tool);
    if (!step) return undefined;
    if (step.http === 429) {
      throw httpError(429, "429 rate limited");
    }
    if (step.throw) {
      throw new Error(step.throw);
    }
    return step;
  }

  const apps: MockApps = {
    writes,
    github: {
      async getPull(prUrl) {
        await applyScript("github.getPull");
        const pull = pulls.get(prUrl);
        if (!pull) throw new Error(`unknown pull ${prUrl}`);
        return { ...pull };
      },
    },
    linear: {
      async getIssueByIdentifier(id) {
        await applyScript("linear.getIssueByIdentifier");
        for (const issue of issues.values()) {
          if (issue.identifier === id) {
            const { comments: _c, ...rest } = issue;
            return rest;
          }
        }
        return null;
      },
      async searchIssues() {
        await applyScript("linear.searchIssues");
        return [...issues.values()].map(({ comments: _c, ...rest }) => rest);
      },
      async setState(issueId, stateId) {
        await retryOn429(async () => {
          await applyScript("linear.setState");
        });
        const issue = issues.get(issueId);
        if (!issue) throw new Error(`unknown issue ${issueId}`);
        issue.state = stateId === doneStateId || stateId === "Done" ? "Done" : stateId;
        writes.push("linear.setState");
      },
      async comment(issueId, body) {
        await applyScript("linear.comment");
        const issue = issues.get(issueId);
        if (!issue) throw new Error(`unknown issue ${issueId}`);
        const row = { id: `c${commentSeq++}`, body };
        issue.comments = issue.comments ?? [];
        issue.comments.push(row);
        writes.push("linear.comment");
        return { id: row.id };
      },
      async getIssue(issueId) {
        await applyScript("linear.getIssue");
        const issue = issues.get(issueId);
        if (!issue) throw new Error(`unknown issue ${issueId}`);
        const { comments: _c, ...rest } = issue;
        return rest;
      },
      async listComments(issueId) {
        await applyScript("linear.listComments");
        const issue = issues.get(issueId);
        if (!issue) throw new Error(`unknown issue ${issueId}`);
        return [...(issue.comments ?? [])];
      },
    },
    gmail: {
      async send(input) {
        const step = await applyScript("gmail.send");
        const persist = step?.persistSent !== false;
        const id = step?.id ?? `msg_${sendSeq++}`;
        writes.push("gmail.send");
        if (persist) {
          sent.push({
            id,
            to: input.to,
            subject: input.subject,
            at: Math.floor(Date.now() / 1000),
          });
        }
        return { id };
      },
      async findSent(input) {
        await applyScript("gmail.findSent");
        const hit = [...sent]
          .reverse()
          .find(
            (m) =>
              m.to.toLowerCase() === input.to.toLowerCase() &&
              m.subject === input.subject &&
              m.at >= input.sinceUnix,
          );
        return hit ? { id: hit.id } : null;
      },
    },
  };

  return apps;
}
