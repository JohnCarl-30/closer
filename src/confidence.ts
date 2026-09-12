import { CONFIDENCE_THRESHOLD } from "./types";
import type { Issue, Pull } from "./types";

const IDENTIFIER = /\b([A-Za-z][A-Za-z0-9]{1,9}-\d+)\b/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const SKIP_TOKENS = new Set([
  "fix",
  "feat",
  "chore",
  "closes",
  "close",
  "closed",
  "pull",
  "request",
]);

export function extractIdentifiers(text: string): string[] {
  const found = new Set<string>();
  const re = new RegExp(IDENTIFIER.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    found.add(m[1].toUpperCase());
  }
  return [...found];
}

export function extractMailto(text: string): string | null {
  const mailto = text.match(/mailto:([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i);
  if (mailto) return mailto[1].toLowerCase();
  const plain = text.match(EMAIL);
  return plain ? plain[0].toLowerCase() : null;
}

export function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 4 && !SKIP_TOKENS.has(t) && !/^\d+$/.test(t)),
  );
}

function overlapCount(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n += 1;
  return n;
}

export function issueTokens(issue: Issue): Set<string> {
  return tokens(`${issue.identifier} ${issue.title}`);
}

export type MatchResult = {
  issue: Issue | null;
  candidates: Issue[];
  score: number;
  reasons: string[];
};

export function scoreMatch(pr: Pull, issues: Issue[]): MatchResult {
  const bodyIds = extractIdentifiers(pr.body);
  const branchIds = extractIdentifiers(pr.branch.replaceAll("/", " "));

  if (bodyIds.length > 1) {
    const candidates = bodyIds
      .map((id) => issues.find((i) => i.identifier === id))
      .filter((i): i is Issue => Boolean(i));
    return {
      issue: null,
      candidates,
      score: 0.4,
      reasons: [`multiple identifiers in PR body: ${bodyIds.join(", ")}`],
    };
  }

  if (bodyIds.length === 1) {
    const found = issues.find((i) => i.identifier === bodyIds[0]) ?? null;
    if (found) {
      return {
        issue: found,
        candidates: [found],
        score: 0.95,
        reasons: [`PR body names ${found.identifier}`],
      };
    }
  }

  if (branchIds.length === 1) {
    const found = issues.find((i) => i.identifier === branchIds[0]) ?? null;
    if (found) {
      return {
        issue: found,
        candidates: [found],
        score: 0.93,
        reasons: [`branch ${pr.branch} names ${found.identifier}`],
      };
    }
  }

  const branchTok = tokens(pr.branch);
  const hits = issues.filter((i) => overlapCount(branchTok, issueTokens(i)) >= 1);
  if (hits.length > 1) {
    return {
      issue: null,
      candidates: hits,
      score: 0.4,
      reasons: [
        `ambiguous match: ${hits.map((i) => i.identifier).join(", ")}`,
      ],
    };
  }
  if (hits.length === 1) {
    return {
      issue: hits[0],
      candidates: hits,
      score: 0.8,
      reasons: [`branch tokens overlap ${hits[0].identifier}`],
    };
  }

  return {
    issue: null,
    candidates: [],
    score: 0.1,
    reasons: ["no Linear issue matched"],
  };
}

export type EmailScore = {
  to: string | null;
  score: number;
  reasons: string[];
};

export function scoreEmail(pr: Pull, issue: Issue | null): EmailScore {
  if (!issue) {
    return { to: null, score: 0.05, reasons: ["no issue, no recipient"] };
  }
  const linearEmail = (
    issue.subscriberEmail ||
    issue.assigneeEmail ||
    ""
  ).toLowerCase() || null;
  const mailto = extractMailto(pr.body);

  if (linearEmail && mailto && linearEmail === mailto) {
    return {
      to: linearEmail,
      score: 0.88,
      reasons: ["Linear email matches mailto in PR"],
    };
  }
  if (linearEmail && mailto && linearEmail !== mailto) {
    return {
      to: null,
      score: 0.2,
      reasons: [`email mismatch Linear=${linearEmail} PR=${mailto}`],
    };
  }
  if (linearEmail) {
    return {
      to: linearEmail,
      score: 0.9,
      reasons: ["Linear subscriber/assignee email"],
    };
  }
  if (mailto) {
    return {
      to: mailto,
      score: 0.5,
      reasons: ["only a mailto in the PR body"],
    };
  }
  return { to: null, score: 0.05, reasons: ["no recipient"] };
}

export function overallConfidence(match: number, email: number): number {
  return Math.min(match, email);
}

export function shouldAct(match: number, email: number, merged: boolean): boolean {
  return merged && overallConfidence(match, email) >= CONFIDENCE_THRESHOLD;
}
