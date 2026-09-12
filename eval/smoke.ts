import { AgentClient } from "agents/client";

async function main() {
  const client = new AgentClient({
    host: "localhost:5174",
    agent: "Closer",
    name: "smoke",
  });

  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("ws timeout")), 10000);
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

  const started = await client.call("start", [
    "https://github.com/acme/closer-demo/pull/1",
  ]);
  console.log("start", JSON.stringify(started, null, 2));
  const done = await client.call("approve", []);
  console.log("approve", JSON.stringify(done, null, 2));
  client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
