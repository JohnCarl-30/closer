export type PullRef = {
  owner: string;
  repo: string;
  number: string;
};

export function parsePullUrl(prUrl: string): PullRef {
  const m = prUrl.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/i,
  );
  if (!m) throw new Error(`not a GitHub pull URL: ${prUrl}`);
  return { owner: m[1], repo: m[2], number: m[3] };
}
