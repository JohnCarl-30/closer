import type { Pull } from "../types";
import { parsePullUrl } from "../github-url";

export function createGithubClient(token: string) {
  return {
    async getPull(prUrl: string): Promise<Pull> {
      const { owner, repo, number } = parsePullUrl(prUrl);
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls/${number}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "closer-agent",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        },
      );
      if (!res.ok) {
        throw new Error(`GitHub GET pull failed ${res.status}`);
      }
      const data = (await res.json()) as {
        html_url: string;
        number: number;
        title: string;
        body: string | null;
        merged_at: string | null;
        head: { ref: string };
      };
      return {
        url: data.html_url,
        number: data.number,
        title: data.title,
        body: data.body ?? "",
        merged: Boolean(data.merged_at),
        branch: data.head.ref,
      };
    },
  };
}
