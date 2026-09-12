import { AgentClient } from "agents/client";
import { DEMO_PR_URL } from "../src/apps/demo-seed.ts";

// The Worker runs inside the Vite dev server, so this is the port `npm run dev`
// prints — override when Vite falls back to another one.
const host = process.env.CLOSER_HOST ?? "localhost:5173";

async function main() {
  const client = new AgentClient({
    host,
    agent: "Closer",
    name: "smoke",
  });

  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`ws timeout against ${host}`)), 10000);
    client.addEventListener(
      "open",
      () => {
        clearTimeout(t);
        resolve(null);
      },
      { once: true },
    );
    client.addEventListener(
      "error",
      (e) => {
        clearTimeout(t);
        reject(e);
      },
      { once: true },
    );
  });

  const started = await client.call("start", [DEMO_PR_URL]);
  console.log("start", JSON.stringify(started, null, 2));
  const done = await client.call("approve", []);
  console.log("approve", JSON.stringify(done, null, 2));
  client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
