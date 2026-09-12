import { Agent, callable } from "agents";
import { createApps, type AppsMode } from "./apps/create";
import { MOCK_FLAGS, type LiveFlags } from "./apps/mode";
import {
  chooseIssue,
  execute,
  plan,
  replaySilent200,
  retryMissing,
} from "./orchestrator";
import type {
  OrchestratorResult,
  Plan,
  RunStatus,
  TraceEvent,
  Verification,
} from "./types";

export type CloserState = {
  status: RunStatus;
  plan: Plan | null;
  verification: Verification | null;
  traces: TraceEvent[];
  writes: string[];
  appsMode: AppsMode;
  liveFlags: LiveFlags;
  error: string | null;
};

function fromResult(
  result: OrchestratorResult,
  appsMode: AppsMode,
  flags: LiveFlags,
): CloserState {
  return {
    status: result.status,
    plan: result.plan,
    verification: result.verification,
    traces: result.traces,
    writes: result.writes,
    appsMode,
    liveFlags: flags,
    error: null,
  };
}

function priorFrom(state: CloserState): OrchestratorResult {
  return {
    status: state.status,
    plan: state.plan!,
    verification: state.verification,
    writes: state.writes,
    traces: state.traces,
  };
}

export class Closer extends Agent<Env, CloserState> {
  initialState: CloserState = {
    status: "idle",
    plan: null,
    verification: null,
    traces: [],
    writes: [],
    appsMode: "mock",
    liveFlags: MOCK_FLAGS,
    error: null,
  };

  @callable()
  async start(prUrl: string): Promise<CloserState> {
    const trimmed = prUrl.trim();
    const { apps, mode, flags } = createApps(this.env, trimmed);
    this.setState({
      ...this.state,
      status: "planning",
      error: null,
      appsMode: mode,
      liveFlags: flags,
    });
    try {
      const result = await plan(apps, trimmed);
      const next = fromResult(result, mode, flags);
      this.setState(next);
      return next;
    } catch (err) {
      const next: CloserState = {
        ...this.state,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        appsMode: mode,
        liveFlags: flags,
      };
      this.setState(next);
      return next;
    }
  }

  @callable()
  async choose(identifier: string): Promise<CloserState> {
    if (this.state.status !== "needs_choice" || !this.state.plan) {
      return this.state;
    }
    try {
      const result = chooseIssue(priorFrom(this.state), identifier);
      const next = fromResult(
        result,
        this.state.appsMode,
        this.state.liveFlags,
      );
      this.setState(next);
      return next;
    } catch (err) {
      const next: CloserState = {
        ...this.state,
        error: err instanceof Error ? err.message : String(err),
      };
      this.setState(next);
      return next;
    }
  }

  @callable()
  async approve(): Promise<CloserState> {
    if (this.state.status !== "awaiting_approval" || !this.state.plan) {
      return this.state;
    }
    const { apps, mode, flags } = createApps(this.env, this.state.plan.pr.url);
    try {
      const result = await execute(apps, priorFrom(this.state));
      const next = fromResult(result, mode, flags);
      this.setState(next);
      return next;
    } catch (err) {
      const next: CloserState = {
        ...this.state,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        appsMode: mode,
        liveFlags: flags,
      };
      this.setState(next);
      return next;
    }
  }

  @callable()
  async reject(): Promise<CloserState> {
    const next: CloserState = { ...this.state, status: "rejected" };
    this.setState(next);
    return next;
  }

  @callable()
  async retryMissing(): Promise<CloserState> {
    if (this.state.status !== "failed" || !this.state.plan) return this.state;
    const { apps, mode, flags } = createApps(this.env, this.state.plan.pr.url);
    const result = await retryMissing(apps, priorFrom(this.state));
    const next = fromResult(result, mode, flags);
    this.setState(next);
    return next;
  }

  @callable()
  async replaySilent200(): Promise<CloserState> {
    this.setState({
      ...this.state,
      status: "planning",
      error: null,
      appsMode: "mock",
      liveFlags: MOCK_FLAGS,
    });
    try {
      const result = await replaySilent200();
      const next = fromResult(result, "mock", MOCK_FLAGS);
      this.setState(next);
      return next;
    } catch (err) {
      const next: CloserState = {
        ...this.state,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        appsMode: "mock",
        liveFlags: MOCK_FLAGS,
      };
      this.setState(next);
      return next;
    }
  }
}
