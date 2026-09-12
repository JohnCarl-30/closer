import { readdir, mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMockApps, type MockScriptStep, type MockSeed } from "../src/apps/mock.ts";
import { planAndExecute } from "../src/orchestrator.ts";
import type { OrchestratorResult } from "../src/types.ts";

type Expect = {
  status: string;
  writes: string[];
  issueIdentifier?: string | null;
  gmailTo?: string | null;
  reasonsIncludes?: string[];
  commentHasPrUrl?: boolean;
  verify?: {
    linearDone: boolean;
    commentHasPrUrl: boolean;
    gmailSentId: true | null;
    missing: string[];
  };
};

type CaseFile = {
  id: string;
  prUrl: string;
  seed: MockSeed;
  script?: MockScriptStep[];
  expect: Expect;
};

const root = path.join(path.dirname(fileURLToPath(import.meta.url)));
const casesDir = path.join(root, "cases");
const tracesDir = path.join(root, "traces");

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function check(c: CaseFile, got: OrchestratorResult): string[] {
  const fail: string[] = [];
  const exp = c.expect;
  if (got.status !== exp.status) {
    fail.push(`status ${got.status} != ${exp.status}`);
  }
  if (!sameList(got.writes, exp.writes)) {
    fail.push(`writes [${got.writes.join(", ")}] != [${exp.writes.join(", ")}]`);
  }
  if ("issueIdentifier" in exp) {
    const id = got.plan.issue?.identifier ?? null;
    if (id !== (exp.issueIdentifier ?? null)) {
      fail.push(`issue ${id} != ${exp.issueIdentifier}`);
    }
  }
  if ("gmailTo" in exp) {
    const to = got.plan.email?.to ?? null;
    if (to !== (exp.gmailTo ?? null)) {
      fail.push(`gmail.to ${to} != ${exp.gmailTo}`);
    }
  }
  if (exp.commentHasPrUrl) {
    if (!got.plan.comment.includes(got.plan.pr.url)) {
      fail.push("plan.comment missing PR URL");
    }
  }
  for (const r of exp.reasonsIncludes ?? []) {
    if (!got.plan.reasons.some((x) => x.includes(r))) {
      fail.push(`missing reason ${r} in ${got.plan.reasons.join(" | ")}`);
    }
  }
  if (exp.verify) {
    const v = got.verification;
    if (!v) {
      fail.push("no verification");
    } else {
      if (v.linearDone !== exp.verify.linearDone) {
        fail.push(`linearDone ${v.linearDone}`);
      }
      if (v.commentHasPrUrl !== exp.verify.commentHasPrUrl) {
        fail.push(`commentHasPrUrl ${v.commentHasPrUrl}`);
      }
      const sentOk = v.gmailSentId !== null;
      const wantSent = exp.verify.gmailSentId === true;
      if (sentOk !== wantSent) {
        fail.push(`gmailSentId ${v.gmailSentId}`);
      }
      if (!sameList(v.missing, exp.verify.missing)) {
        fail.push(`missing [${v.missing.join(", ")}] != [${exp.verify.missing.join(", ")}]`);
      }
    }
  }
  return fail;
}

const files = (await readdir(casesDir)).filter((f) => f.endsWith(".json")).sort();
const rows: { id: string; status: string; pass: boolean; fail: string[] }[] = [];
await mkdir(tracesDir, { recursive: true });

for (const file of files) {
  const c = JSON.parse(await readFile(path.join(casesDir, file), "utf8")) as CaseFile;
  const apps = createMockApps(c.seed, c.script ?? []);
  const got = await planAndExecute(apps, c.prUrl);
  await writeFile(
    path.join(tracesDir, `${c.id}.json`),
    JSON.stringify(got.traces, null, 2),
  );
  const fail = check(c, got);
  rows.push({ id: c.id, status: got.status, pass: fail.length === 0, fail });
}

const width = Math.max(...rows.map((r) => r.id.length));
console.log(`${"case".padEnd(width)}  result   status`);
for (const r of rows) {
  const mark = r.pass ? "pass" : "FAIL";
  console.log(`${r.id.padEnd(width)}  ${mark.padEnd(6)}  ${r.status}`);
  for (const f of r.fail) console.log(`  - ${f}`);
}

const failed = rows.filter((r) => !r.pass).length;
console.log(`\n${rows.length - failed}/${rows.length} passed`);
if (failed) process.exit(1);
