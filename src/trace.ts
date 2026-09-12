import type { TraceEvent } from "./types";

export function newRunId(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function makeTracer(runId: string) {
  const traces: TraceEvent[] = [];
  function push(event: Omit<TraceEvent, "t" | "runId">) {
    traces.push({ t: Date.now(), runId, ...event });
  }
  async function call<T>(
    tool: string,
    args: unknown,
    fn: () => Promise<T>,
    agent?: TraceEvent["agent"],
  ): Promise<T> {
    push({ type: "tool_call", tool, args, agent });
    try {
      const response = await fn();
      push({ type: "tool_result", tool, response, ok: true, agent });
      return response;
    } catch (err) {
      push({
        type: "tool_result",
        tool,
        response: err instanceof Error ? err.message : String(err),
        ok: false,
        agent,
      });
      throw err;
    }
  }
  return { traces, push, call, runId };
}

export type Tracer = ReturnType<typeof makeTracer>;
