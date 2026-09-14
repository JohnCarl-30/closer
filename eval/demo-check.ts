// Walks the four demo beats over the real agents WebSocket, the same path the
// UI buttons take. Needs `npm run dev` running. Exits 1 on the first wrong turn.
import { AgentClient } from "agents/client";
import { DEMO_AMBIGUOUS_PR_URL, DEMO_PR_URL } from "../src/apps/demo-seed.ts";

const host = process.env.CLOSER_HOST ?? "localhost:5173";

function connect(name: string): Promise<AgentClient> {
  const client = new AgentClient({ host, agent: "Closer", name });
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`ws timeout against ${host}`)), 10000);
    client.addEventListener("open", () => { clearTimeout(t); resolve(client); }, { once: true });
    client.addEventListener("error", (e) => { clearTimeout(t); reject(e); }, { once: true });
  });
}

type S = {
  status: string;
  writes: string[];
  verification: { missing: string[] } | null;
  plan: { candidates: { identifier: string }[] } | null;
  error: string | null;
};

let failed = 0;
function expect(beat: string, got: S, status: string, extra?: (s: S) => string | null) {
  const problems: string[] = [];
  if (got.status !== status) problems.push(`status ${got.status} != ${status}`);
  if (got.error) problems.push(`error: ${got.error}`);
  const more = extra?.(got);
  if (more) problems.push(more);
  const mark = problems.length ? "FAIL" : "pass";
  console.log(`${beat.padEnd(28)} ${mark}  ${got.status}${problems.length ? "  " + problems.join("; ") : ""}`);
  if (problems.length) failed += 1;
}

async function main() {
  const run = `check-${Date.now()}`;

  // Beat 1+2: Run, then Approve
  let c = await connect(`${run}-happy`);
  expect("happy: start", (await c.call("start", [DEMO_PR_URL])) as S, "awaiting_approval");
  expect("happy: approve", (await c.call("approve", [])) as S, "done", (s) =>
    s.verification?.missing.length ? `missing ${s.verification.missing}` : null,
  );
  c.close();

  // Beat 3: Replay silent 200, then the retry recovers
  c = await connect(`${run}-silent`);
  expect("silent-200: replay", (await c.call("replaySilent200", [])) as S, "failed", (s) =>
    s.verification?.missing.join() === "gmail" ? null : `missing ${s.verification?.missing}`,
  );
  expect("silent-200: retry", (await c.call("retryMissing", [])) as S, "done", (s) =>
    s.verification?.missing.length ? `missing ${s.verification.missing}` : null,
  );
  c.close();

  // Beat 4: Two tickets — refuse to guess, human picks, then it ships
  c = await connect(`${run}-ambiguous`);
  expect("two-tickets: start", (await c.call("start", [DEMO_AMBIGUOUS_PR_URL])) as S, "needs_choice", (s) =>
    (s.plan?.candidates.length ?? 0) === 2 ? null : `candidates ${s.plan?.candidates.length}`,
  );
  expect("two-tickets: choose", (await c.call("choose", ["ENG-20"])) as S, "awaiting_approval");
  expect("two-tickets: approve", (await c.call("approve", [])) as S, "done", (s) =>
    s.verification?.missing.length ? `missing ${s.verification.missing}` : null,
  );
  c.close();

  console.log(failed ? `\n${failed} beat(s) FAILED` : "\nall demo beats pass");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
