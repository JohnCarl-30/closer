import type { Comment, Issue } from "../types";
import { retryOn429 } from "./retry";

type GqlIssue = {
  id: string;
  identifier: string;
  title: string;
  url: string;
  state: { name: string };
  subscribers?: { nodes: { email?: string | null }[] };
  assignee?: { email?: string | null } | null;
  comments?: { nodes: { id: string; body: string }[] };
};

function mapIssue(node: GqlIssue): Issue {
  const subscriber =
    node.subscribers?.nodes.find((n) => n.email)?.email ?? null;
  return {
    id: node.id,
    identifier: node.identifier,
    title: node.title,
    url: node.url,
    state: node.state.name,
    subscriberEmail: subscriber,
    assigneeEmail: node.assignee?.email ?? null,
  };
}

const ISSUE_FIELDS = `
  id
  identifier
  title
  url
  state { name }
  subscribers { nodes { email } }
  assignee { email }
`;

export function createLinearClient(apiKey: string, doneStateId: string) {
  async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 429) {
      const err = new Error("Linear 429");
      (err as Error & { status: number }).status = 429;
      throw err;
    }
    if (!res.ok) throw new Error(`Linear HTTP ${res.status}`);
    const json = (await res.json()) as {
      data?: T;
      errors?: { message: string }[];
    };
    if (json.errors?.length) {
      throw new Error(json.errors.map((e) => e.message).join("; "));
    }
    if (!json.data) throw new Error("Linear empty data");
    return json.data;
  }

  return {
    async getIssueByIdentifier(id: string): Promise<Issue | null> {
      const data = await gql<{ issue: GqlIssue | null }>(
        `query ($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} } }`,
        { id },
      );
      return data.issue ? mapIssue(data.issue) : null;
    },
    async searchIssues(_q: string): Promise<Issue[]> {
      const data = await gql<{ issues: { nodes: GqlIssue[] } }>(
        `query { issues(first: 50) { nodes { ${ISSUE_FIELDS} } } }`,
      );
      return data.issues.nodes.map(mapIssue);
    },
    async setState(issueId: string, _stateId: string): Promise<void> {
      await retryOn429(() =>
        gql(
          `mutation ($id: String!, $stateId: String!) {
            issueUpdate(id: $id, input: { stateId: $stateId }) { success }
          }`,
          { id: issueId, stateId: doneStateId },
        ),
      );
    },
    async comment(issueId: string, body: string): Promise<{ id: string }> {
      const data = await gql<{
        commentCreate: { comment: { id: string } };
      }>(
        `mutation ($issueId: String!, $body: String!) {
          commentCreate(input: { issueId: $issueId, body: $body }) {
            comment { id }
          }
        }`,
        { issueId, body },
      );
      return { id: data.commentCreate.comment.id };
    },
    async getIssue(issueId: string): Promise<Issue> {
      const found = await this.getIssueByIdentifier(issueId);
      if (!found) throw new Error(`Linear issue missing ${issueId}`);
      return found;
    },
    async listComments(issueId: string): Promise<Comment[]> {
      const data = await gql<{ issue: GqlIssue | null }>(
        `query ($id: String!) {
          issue(id: $id) { comments { nodes { id body } } }
        }`,
        { id: issueId },
      );
      return data.issue?.comments?.nodes ?? [];
    },
  };
}
