import type { Comment, Issue, Pull } from "./types";

export function isDoneState(name: string): boolean {
  return name.trim().toLowerCase() === "done";
}

export function commentMentionsPr(comments: Comment[], prUrl: string): boolean {
  return comments.some((c) => c.body.includes(prUrl));
}

export function shipComment(prUrl: string): string {
  return `Shipped in ${prUrl}`;
}

export function shipEmail(
  pr: Pull,
  issue: Issue,
  to: string,
): { to: string; subject: string; body: string } {
  return {
    to,
    subject: `Shipped: ${issue.identifier} ${issue.title}`,
    body: `Shipped ${pr.title} in ${pr.url}`,
  };
}
