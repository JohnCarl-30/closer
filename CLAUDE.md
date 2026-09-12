# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Closer is a post-ship agent on Cloudflare Workers. Given a merged GitHub PR URL, it finds the Linear
issue, marks it Done with a comment linking the PR, emails the requester via Gmail, then **re-reads
both apps** to confirm the writes landed. A 200 from Gmail is not success; a message in `in:sent` is.

## Commands

```bash
npm run dev          # vite dev — UI on :5173, Worker via @cloudflare/vite-plugin
npm test             # tsx --test test/*.test.ts (29 tests, plain Node, no Worker runtime)
npm run eval         # 13-case golden set; writes eval/traces/<id>.json; exits 1 on any failure
npm run check        # tsc --noEmit && test && eval — run this before calling work done
npm run types        # wrangler types → regenerates worker-configuration.d.ts
npm run deploy       # vite build && wrangler deploy
npm run seed:linear  # writes LINEAR_DONE_STATE_ID into .dev.vars (needs LINEAR_API_KEY first)
npm run seed:gmail   # local OAuth flow → GOOGLE_REFRESH_TOKEN into .dev.vars
```

Single test file: `npx tsx --test test/confidence.test.ts`
Single test by name: `npx tsx --test --test-name-pattern "silent 200" test/*.test.ts`
Single eval case: no flag exists — `npm run eval` runs all 13 (they take <1s total).

`eval/smoke.ts` is a manual end-to-end check against a **running** dev server. It defaults to
`localhost:5173` and reads `DEMO_PR_URL` from the seed; override the host with `CLOSER_HOST=host:port`
when Vite falls back to another port.

## Architecture

### The orchestrator is pure; the Durable Object is a shell

`src/orchestrator.ts` holds all the logic as free functions over an `Apps` object and a prior
`OrchestratorResult`: `plan` → `chooseIssue` → `execute` → `retryMissing`, plus `planAndExecute`
and `replaySilent200`. None of them touch `Env`, the DO, or the network directly.

`src/closer.ts` (`Closer extends Agent`) is a thin wrapper: each `@callable()` method converts
`CloserState` → `OrchestratorResult` (`priorFrom`), calls an orchestrator function, converts back
(`fromResult`), and `setState`s. Keep it that way — it is why `npm test` and `npm run eval` run the
full pipeline in plain Node with zero Worker runtime. **New behavior belongs in the orchestrator,
not in the agent class.**

Wire-up: `src/server.ts` → `routeAgentRequest` → `Closer` DO (SQLite-backed, `wrangler.jsonc`
migration `v1`). The React client (`src/client.tsx`) calls `agent.stub.<method>(...)` over the
agents WebSocket and receives state pushes through `onStateUpdate` — it never fetches; `CloserState`
is the only contract between server and UI.

### The Apps seam

`src/apps/types.ts` defines the entire external surface (github/linear/gmail). Everything downstream
depends on that interface only.

`createApps(env, prUrl)` picks live vs mock **per app**, based on which secrets are present
(`mode.ts` `liveFlags`), so mode is `live` | `mock` | `mixed`. Missing Gmail keys means sends are
mocked while GitHub and Linear stay live — and the verify path is unchanged. One deliberate
exception: even with a `GITHUB_TOKEN`, `DEMO_AMBIGUOUS_PR_URL` forces mock GitHub so the
"two tickets" demo button always works.

`src/apps/mock.ts` is a stateful in-memory implementation plus a **script** (`MockScriptStep[]`) for
injecting failures: `http: 429`, `throw: "..."`, and `persistSent: false` — the last returns a
successful send id without recording it in sent mail, which is how the silent-200 case is built.
Steps are consumed once, matched by tool name.

### Confidence gate

`src/confidence.ts`. `overall = min(match, email)`; writes require `merged && overall >= 0.75`
(`CONFIDENCE_THRESHOLD` in `src/types.ts`). Match ladder: PR-body identifier 0.95 → branch
identifier 0.93 → branch-token overlap 0.80 → multiple identifiers / ambiguous overlap 0.40 →
nothing 0.10. A human pick via `chooseIssue` scores 0.96 but still re-runs the gate, so a bad
recipient escalates even after a choice.

`escalated` and `needs_choice` are **passing** outcomes with zero writes, not errors. Assert on
`writes` being empty when adding cases in that territory.

### Verify after write, never trust the writer

`execute` captures `sinceUnix` *before* writing, then `src/verify.ts` re-reads issue state, comments,
and `in:sent` through the same `Apps`. Status is derived only from `verification.missing` —
`missing.length ? "failed" : "done"`. Every write goes through the `attempt` helper, which records it
in `writes` only if it lands and swallows the failure on purpose: a throw would skip verification and
lose the record of what *did* land. The verifier is the only thing allowed to say what happened.

`retryMissing` re-attempts exactly the entries in `missing` (`linear.state`, `linear.comment`,
`gmail`) and re-verifies, so a partial failure is recoverable from any side, not just Gmail.

Writes are idempotency-guarded: `execute` re-reads state and comments first and skips
`linear.setState` / `linear.comment` when already Done / already mentioning the PR. The `writes`
array records only writes that actually happened, and eval asserts it as an exact ordered list.

### Traces

`src/trace.ts` `makeTracer` wraps every tool call into `tool_call` / `tool_result` events tagged
`writer` or `verifier`. Multi-step flows re-seed a tracer from `prior.traces` and reuse
`prior.traces[0].runId`, so one run accumulates a single ordered trace across plan → choose →
approve → retry. `eval/run.ts` dumps these to `eval/traces/<id>.json` (gitignored) — read them when
a case fails.

## Adding an eval case

Drop a JSON file in `eval/cases/` named `NN-slug.json` with `{ id, prUrl, seed, script?, expect }`.
`seed` feeds `createMockApps` (pulls/issues/sent); `script` injects failures; `expect` supports
`status`, exact-ordered `writes`, `issueIdentifier`, `gmailTo`, `commentHasPrUrl`,
`reasonsIncludes` (substring match), and `verify` (where `gmailSentId: true` means "any id").
The runner discovers files by sort order — no registry to update. Update the results table in
RELIABILITY.md when the set changes.

## Conventions and gotchas

- `src/` imports are extensionless; `test/` and `eval/` import source with explicit `.ts`
  (tsx ESM resolution). Follow the local convention of the file you are editing.
- `Env` is split: `worker-configuration.d.ts` is **generated** by `npm run types` (don't edit);
  `src/secrets.d.ts` is the hand-written augmentation listing the six optional API keys.
- Secrets live in `.dev.vars` (gitignored, shape in `secrets.example`). Empty file = full mock mode,
  which is the default demo path — the UI ships with the demo PR URL prefilled.
- Linear `setState` ignores its `stateId` argument and always uses the configured
  `LINEAR_DONE_STATE_ID`; `isDoneState` matches on the state *name* being `"done"`.
- Google Calendar is not wired — the loop is GitHub + Linear + Gmail only. See RELIABILITY.md
  "Known holes" before assuming a fourth app exists.
