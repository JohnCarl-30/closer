import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const varsPath = path.join(root, ".dev.vars");

function parseVars(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return out;
}

function serializeVars(vars: Record<string, string>): string {
  const keys = [
    "GITHUB_TOKEN",
    "LINEAR_API_KEY",
    "LINEAR_DONE_STATE_ID",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REFRESH_TOKEN",
  ];
  const extra = Object.keys(vars).filter((k) => !keys.includes(k));
  return [...keys, ...extra].map((k) => `${k}=${vars[k] ?? ""}`).join("\n") + "\n";
}

async function gql(
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>,
) {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as {
    data?: Record<string, unknown>;
    errors?: { message: string }[];
  };
  if (!res.ok || json.errors?.length) {
    throw new Error(json.errors?.map((e) => e.message).join("; ") || `Linear HTTP ${res.status}`);
  }
  return json.data!;
}

type Team = {
  id: string;
  key: string;
  name: string;
  states: { nodes: { id: string; name: string; type: string }[] };
};

async function main() {
  const vars = parseVars(await readFile(varsPath, "utf8"));
  const apiKey = vars.LINEAR_API_KEY;
  if (!apiKey) {
    console.error(
      "LINEAR_API_KEY is empty in .dev.vars. Create a personal API key at https://linear.app/settings/account/security and paste it there, then re-run npm run seed:linear",
    );
    process.exit(1);
  }

  const data = (await gql(
    apiKey,
    `query {
      viewer { id email }
      teams(first: 10) {
        nodes {
          id
          key
          name
          states { nodes { id name type } }
        }
      }
    }`,
  )) as {
    viewer: { id: string; email: string | null };
    teams: { nodes: Team[] };
  };

  const team = data.teams.nodes[0];
  if (!team) {
    console.error("No Linear team on this key.");
    process.exit(1);
  }

  const done = team.states.nodes.find((s) => s.type === "completed");
  const started = team.states.nodes.find((s) => s.type === "started")
    ?? team.states.nodes.find((s) => s.type === "unstarted");
  if (!done || !started) {
    console.error(`Team ${team.key} needs a started/unstarted state and a completed state.`);
    process.exit(1);
  }

  const created = (await gql(
    apiKey,
    `mutation ($teamId: String!, $stateId: String!, $assigneeId: String!) {
      issueCreate(input: {
        teamId: $teamId
        title: "Auth callback 500"
        description: "OAuth callback 500s when the provider retries the same code."
        stateId: $stateId
        assigneeId: $assigneeId
      }) {
        success
        issue { id identifier url }
      }
    }`,
    { teamId: team.id, stateId: started.id, assigneeId: data.viewer.id },
  )) as {
    issueCreate: {
      success: boolean;
      issue: { id: string; identifier: string; url: string };
    };
  };

  const issue = created.issueCreate.issue;
  vars.LINEAR_DONE_STATE_ID = done.id;
  await writeFile(varsPath, serializeVars(vars), { mode: 0o600 });

  const token = vars.GITHUB_TOKEN;
  if (token) {
    const res = await fetch(
      "https://api.github.com/repos/JohnCarl-30/closer-demo/pulls/1",
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "closer-agent",
        },
        body: JSON.stringify({
          body: `Closes ${issue.identifier}\n\nThe auth callback 500 on provider retry is gone. Duplicate codes now count as already redeemed.`,
        }),
      },
    );
    if (!res.ok) {
      console.error(`Could not update PR body (${res.status}). Paste Closes ${issue.identifier} into the PR yourself.`);
    }
  }

  console.log(`team ${team.key}`);
  console.log(`issue ${issue.identifier} ${issue.url}`);
  console.log(`done state ${done.name}`);
  console.log("wrote LINEAR_DONE_STATE_ID to .dev.vars");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
