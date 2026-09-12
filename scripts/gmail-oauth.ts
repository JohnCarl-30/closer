import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const varsPath = path.join(root, ".dev.vars");
const REDIRECT = "http://127.0.0.1:8787/oauth";
const SCOPES = "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly";

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

async function main() {
  const vars = parseVars(await readFile(varsPath, "utf8"));
  if (!vars.GOOGLE_CLIENT_ID || !vars.GOOGLE_CLIENT_SECRET) {
    console.error(
      "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .dev.vars first. Google Cloud → APIs → Gmail API → OAuth client (Desktop or Web) with redirect http://127.0.0.1:8787/oauth",
    );
    process.exit(1);
  }

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", vars.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", REDIRECT);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1:8787");
      if (url.pathname !== "/oauth") {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      const code = url.searchParams.get("code");
      if (!code) {
        res.writeHead(400);
        res.end("missing code");
        return;
      }
      const body = new URLSearchParams({
        code,
        client_id: vars.GOOGLE_CLIENT_ID,
        client_secret: vars.GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT,
        grant_type: "authorization_code",
      });
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const json = (await tokenRes.json()) as {
        refresh_token?: string;
        error?: string;
      };
      if (!json.refresh_token) {
        res.writeHead(500);
        res.end("no refresh_token. Revoke the app access and retry with prompt=consent.");
        console.error(json.error ?? "no refresh_token");
        server.close();
        process.exit(1);
      }
      vars.GOOGLE_REFRESH_TOKEN = json.refresh_token;
      await writeFile(varsPath, serializeVars(vars), { mode: 0o600 });
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Gmail refresh token saved to .dev.vars. You can close this tab.");
      console.log("wrote GOOGLE_REFRESH_TOKEN to .dev.vars");
      server.close();
    } catch (err) {
      res.writeHead(500);
      res.end("oauth failed");
      console.error(err instanceof Error ? err.message : err);
      server.close();
      process.exit(1);
    }
  });

  server.listen(8787, "127.0.0.1", () => {
    console.log("Open this URL, then approve Gmail access:");
    console.log(authUrl.toString());
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
