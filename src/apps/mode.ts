export type AppsMode = "live" | "mock" | "mixed";

export type LiveFlags = {
  github: boolean;
  linear: boolean;
  gmail: boolean;
};

export const MOCK_FLAGS: LiveFlags = {
  github: false,
  linear: false,
  gmail: false,
};

export function liveFlags(env: {
  GITHUB_TOKEN?: string;
  LINEAR_API_KEY?: string;
  LINEAR_DONE_STATE_ID?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REFRESH_TOKEN?: string;
}): LiveFlags {
  return {
    github: Boolean(env.GITHUB_TOKEN),
    linear: Boolean(env.LINEAR_API_KEY && env.LINEAR_DONE_STATE_ID),
    gmail: Boolean(
      env.GOOGLE_CLIENT_ID &&
        env.GOOGLE_CLIENT_SECRET &&
        env.GOOGLE_REFRESH_TOKEN,
    ),
  };
}

export function resolveAppsMode(flags: LiveFlags): AppsMode {
  const n = [flags.github, flags.linear, flags.gmail].filter(Boolean).length;
  if (n === 3) return "live";
  if (n === 0) return "mock";
  return "mixed";
}
