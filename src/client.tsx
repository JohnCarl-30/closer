import { useAgent } from "agents/react";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { DEMO_AMBIGUOUS_PR_URL, DEMO_PR_URL } from "./apps/demo-seed";
import { MOCK_FLAGS } from "./apps/mode";
import type { Closer, CloserState } from "./closer";
import "./styles.css";

const idle: CloserState = {
  status: "idle",
  plan: null,
  verification: null,
  traces: [],
  writes: [],
  appsMode: "mock",
  liveFlags: MOCK_FLAGS,
  error: null,
};

const APP_LABELS = {
  github: "GitHub",
  linear: "Linear",
  gmail: "Gmail",
} as const;

function modeCopy(mode: CloserState["appsMode"]) {
  if (mode === "live") return "Live GitHub, Linear, and Gmail.";
  if (mode === "mixed") {
    return "Some apps are live, some are mocked. Check .dev.vars. Verify still runs on whatever is connected.";
  }
  return "No API keys in .dev.vars. Running against the in-memory demo apps. Paste the demo PR URL.";
}

function App() {
  const [prUrl, setPrUrl] = useState(DEMO_PR_URL);
  const [state, setState] = useState<CloserState>(idle);
  const [busy, setBusy] = useState(false);

  const agent = useAgent<Closer, CloserState>({
    agent: "Closer",
    name: "demo",
    onStateUpdate: (next) => setState(next),
  });

  async function wrap(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  const v = state.verification;
  const flags = state.liveFlags ?? MOCK_FLAGS;

  return (
    <main>
      <h1>Closer</h1>
      <p className="lede">
        Point it at a merged PR. It closes the Linear issue and emails whoever
        asked, then checks that both writes actually landed.
      </p>

      <div className="chips">
        {(Object.keys(APP_LABELS) as Array<keyof typeof APP_LABELS>).map(
          (app) => (
            <span
              key={app}
              className={`chip ${flags[app] ? "live" : "mock"}`}
            >
              {APP_LABELS[app]} {flags[app] ? "live" : "mock"}
            </span>
          ),
        )}
      </div>
      <div className="banner">{modeCopy(state.appsMode)}</div>

      <label htmlFor="pr">Merged pull request</label>
      <input
        id="pr"
        type="url"
        value={prUrl}
        onChange={(e) => setPrUrl(e.target.value)}
        placeholder={DEMO_PR_URL}
      />
      <div className="row">
        <button type="button" onClick={() => wrap(() => agent.stub.start(prUrl))} disabled={busy}>
          {busy && state.status === "planning" ? "Reading…" : "Run"}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => setPrUrl(DEMO_PR_URL)}
        >
          Demo URL
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => setPrUrl(DEMO_AMBIGUOUS_PR_URL)}
        >
          Two tickets
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => wrap(() => agent.stub.replaySilent200())}
          disabled={busy}
        >
          Replay silent 200
        </button>
      </div>

      {state.error ? <p className="no">{state.error}</p> : null}

      {state.plan ? (
        <section className="card">
          <h2>Plan</h2>
          <dl className="kv">
            <dt>Status</dt>
            <dd>{state.status}</dd>
            <dt>PR</dt>
            <dd>
              #{state.plan.pr.number} {state.plan.pr.title} (
              {state.plan.pr.merged ? "merged" : "open"})
            </dd>
            <dt>Issue</dt>
            <dd>
              {state.plan.issue
                ? `${state.plan.issue.identifier} · ${state.plan.issue.title}`
                : "none"}
            </dd>
            <dt>Email</dt>
            <dd>{state.plan.email ? state.plan.email.to : "none"}</dd>
            <dt>Confidence</dt>
            <dd>
              match {state.plan.confidence.match.toFixed(2)} · email{" "}
              {state.plan.confidence.email.toFixed(2)} · overall{" "}
              {state.plan.confidence.overall.toFixed(2)}
            </dd>
          </dl>
          <ul className="reasons">
            {state.plan.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {state.status === "needs_choice" ? (
            <div>
              <p className="pick">Two tickets fit. Pick one before it writes.</p>
              <div className="row">
                {state.plan.candidates.map((c) => (
                  <button
                    key={c.identifier}
                    type="button"
                    className="secondary"
                    onClick={() => wrap(() => agent.stub.choose(c.identifier))}
                    disabled={busy}
                  >
                    {c.identifier} · {c.title}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {state.status === "awaiting_approval" ? (
            <div className="row">
              <button
                type="button"
                onClick={() => wrap(() => agent.stub.approve())}
                disabled={busy}
              >
                Approve writes
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => wrap(() => agent.stub.reject())}
                disabled={busy}
              >
                Reject
              </button>
            </div>
          ) : null}
          {state.status === "failed" && v?.missing.length ? (
            <div className="row">
              <button
                type="button"
                onClick={() => wrap(() => agent.stub.retryMissing())}
                disabled={busy}
              >
                Retry {v.missing.join(", ")}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {v ? (
        <section className="card">
          <h2>Verified</h2>
          <ul className="check">
            <li>
              <span>Linear Done</span>
              <span className={v.linearDone ? "ok" : "no"}>
                {v.linearDone ? "yes" : "no"}
              </span>
            </li>
            <li>
              <span>Comment has PR URL</span>
              <span className={v.commentHasPrUrl ? "ok" : "no"}>
                {v.commentHasPrUrl ? "yes" : "no"}
              </span>
            </li>
            <li>
              <span>Gmail sent id</span>
              <span className={v.gmailSentId ? "ok" : "no"}>
                {v.gmailSentId ?? "missing"}
              </span>
            </li>
          </ul>
        </section>
      ) : null}

      {state.traces.length ? (
        <section className="card">
          <h2>Trace</h2>
          <ol className="trace">
            {state.traces.map((t, i) => (
              <li key={`${t.t}-${i}`}>
                <strong>{t.type}</strong>
                {t.agent ? ` ${t.agent}` : ""}
                {t.tool ? ` ${t.tool}` : ""}
                {t.ok === false ? <span className="no"> fail</span> : ""}
                {t.note ? ` · ${t.note}` : ""}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
