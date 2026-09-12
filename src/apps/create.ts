import { createGithubClient } from "./github";
import { createGmailClient } from "./gmail";
import { createLinearClient } from "./linear";
import {
  liveFlags,
  resolveAppsMode,
  MOCK_FLAGS,
  type AppsMode,
  type LiveFlags,
} from "./mode";
import { createMockApps } from "./mock";
import type { Apps } from "./types";
import { DEMO_AMBIGUOUS_PR_URL, DEMO_SEED } from "./demo-seed";

export type { AppsMode, LiveFlags } from "./mode";
export { MOCK_FLAGS };

export type WorkerSecrets = {
  GITHUB_TOKEN?: string;
  LINEAR_API_KEY?: string;
  LINEAR_DONE_STATE_ID?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REFRESH_TOKEN?: string;
};

export function createApps(
  env: WorkerSecrets,
  prUrl?: string,
): { apps: Apps; mode: AppsMode; flags: LiveFlags } {
  const flags = liveFlags(env);
  const mock = createMockApps(DEMO_SEED);
  const githubLive = flags.github && prUrl !== DEMO_AMBIGUOUS_PR_URL;
  const effective: LiveFlags = { ...flags, github: githubLive };
  const apps: Apps = {
    github: githubLive ? createGithubClient(env.GITHUB_TOKEN!) : mock.github,
    linear: flags.linear
      ? createLinearClient(env.LINEAR_API_KEY!, env.LINEAR_DONE_STATE_ID!)
      : mock.linear,
    gmail: flags.gmail
      ? createGmailClient({
          GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID!,
          GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET!,
          GOOGLE_REFRESH_TOKEN: env.GOOGLE_REFRESH_TOKEN!,
        })
      : mock.gmail,
  };
  return { apps, mode: resolveAppsMode(effective), flags: effective };
}
