import type { Comment, Issue, Pull } from "../types";

export type Apps = {
  github: {
    getPull(prUrl: string): Promise<Pull>;
  };
  linear: {
    getIssueByIdentifier(id: string): Promise<Issue | null>;
    searchIssues(q: string): Promise<Issue[]>;
    setState(issueId: string, stateId: string): Promise<void>;
    comment(issueId: string, body: string): Promise<{ id: string }>;
    getIssue(issueId: string): Promise<Issue>;
    listComments(issueId: string): Promise<Comment[]>;
  };
  gmail: {
    send(input: {
      to: string;
      subject: string;
      body: string;
    }): Promise<{ id: string }>;
    findSent(input: {
      to: string;
      sinceUnix: number;
      subject: string;
    }): Promise<{ id: string } | null>;
  };
};
