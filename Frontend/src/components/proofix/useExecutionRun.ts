/**
 * Pure reducer over backend execution events.
 *
 * This hook owns NO timing logic. Progression is driven entirely by an event
 * stream produced by `createEventSource` (default: `createMockEventSource`).
 * To wire a real backend, pass a factory that opens an SSE/WebSocket
 * connection and translates frames into `ExecutionEvent`s.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FALLBACK_AGENTS as DEFAULT_AGENTS } from "./data";
import type { AgentEntry, AgentStatus } from "./data";
import {
  createMockEventSource,
  type EventSourceFactory,
  type ExecutionEvent,
} from "./mockEventStream";

export interface LiveAgent extends AgentEntry {
  visibleLines: number;
  liveStatus: AgentStatus;
  /** Real-time messages received from the backend via WS. */
  liveMessages: string[];
  /** Epoch ms when this agent started (for elapsed timer). */
  startedAt: number | null;
  /** Final elapsed ms (set once finalized). */
  elapsedMs: number | null;
  /** Failure reason extracted from the finalized event message. */
  failureReason: string | null;
  /** Payload from the finalized/completed event (agent-specific metrics). */
  completionPayload: Record<string, unknown> | null;
}

export interface UseExecutionRunOptions {
  /** Agents to play through. Supplied by runService once the backend is live. */
  agents?: AgentEntry[];
  /** Event-source factory. Replace with SSE/WS to consume backend events. */
  createEventSource?: EventSourceFactory;
}

export function useExecutionRun(options: UseExecutionRunOptions = {}) {
  const { agents = DEFAULT_AGENTS, createEventSource = createMockEventSource } =
    options;

  const [token, setToken] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [visibleByIdx, setVisibleByIdx] = useState<number[]>(() =>
    agents.map(() => 0),
  );
  const [statusByIdx, setStatusByIdx] = useState<AgentStatus[]>(() =>
    agents.map(() => "running" as AgentStatus),
  );
  const [done, setDone] = useState(false);

  // Live data from WS events
  const [messagesByIdx, setMessagesByIdx] = useState<string[][]>(() =>
    agents.map(() => []),
  );
  const [startedAtByIdx, setStartedAtByIdx] = useState<(number | null)[]>(() =>
    agents.map(() => null),
  );
  const [elapsedByIdx, setElapsedByIdx] = useState<(number | null)[]>(() =>
    agents.map(() => null),
  );
  const [failureByIdx, setFailureByIdx] = useState<(string | null)[]>(() =>
    agents.map(() => null),
  );
  const [payloadByIdx, setPayloadByIdx] = useState<(Record<string, unknown> | null)[]>(() =>
    agents.map(() => null),
  );

  // Elapsed timer — ticks every second for the active running agent
  const [tick, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Start ticking when we have an active agent that is running
    if (done) {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
      return;
    }
    tickRef.current = setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [done, token]);

  const restart = useCallback(() => {
    setVisibleByIdx(agents.map(() => 0));
    setStatusByIdx(agents.map(() => "running"));
    setMessagesByIdx(agents.map(() => []));
    setStartedAtByIdx(agents.map(() => null));
    setElapsedByIdx(agents.map(() => null));
    setFailureByIdx(agents.map(() => null));
    setPayloadByIdx(agents.map(() => null));
    setActiveIndex(0);
    setDone(false);
    setTick(0);
    setToken((t) => t + 1);
  }, [agents]);

  // Subscribe to the event source. Re-runs only on restart or agents change.
  useEffect(() => {
    const handle = (event: ExecutionEvent) => {
      switch (event.type) {
        case "agent.started":
          setActiveIndex(event.index);
          setStartedAtByIdx((prev) => {
            const next = [...prev];
            next[event.index] = Date.now();
            return next;
          });
          if (event.message) {
            setMessagesByIdx((prev) => {
              const next = [...prev];
              next[event.index] = [...(next[event.index] ?? []), event.message!];
              return next;
            });
          }
          return;
        case "agent.line":
          setVisibleByIdx((prev) => {
            const next = [...prev];
            next[event.index] = event.lineIndex;
            return next;
          });
          if (event.message) {
            setMessagesByIdx((prev) => {
              const next = [...prev];
              next[event.index] = [...(next[event.index] ?? []), event.message!];
              return next;
            });
          }
          return;
        case "agent.finalized":
          setStatusByIdx((prev) => {
            const next = [...prev];
            next[event.index] = event.status;
            return next;
          });
          // Compute elapsed from startedAt
          setStartedAtByIdx((prev) => {
            const started = prev[event.index];
            if (started) {
              setElapsedByIdx((ep) => {
                const ne = [...ep];
                ne[event.index] = Date.now() - started;
                return ne;
              });
            }
            return prev;
          });
          // Store failure reason
          if (event.status === "failed" && event.message) {
            setFailureByIdx((prev) => {
              const next = [...prev];
              next[event.index] = event.message!;
              return next;
            });
          }
          // Store completion payload
          if (event.payload) {
            setPayloadByIdx((prev) => {
              const next = [...prev];
              next[event.index] = event.payload!;
              return next;
            });
          }
          // Append final message
          if (event.message) {
            setMessagesByIdx((prev) => {
              const next = [...prev];
              next[event.index] = [...(next[event.index] ?? []), event.message!];
              return next;
            });
          }
          return;
        case "run.completed":
          setDone(true);
          return;
      }
    };
    const dispose = createEventSource(agents, handle);
    return dispose;
    // `token` is intentionally part of the dependency list to support restart.
  }, [token, agents, createEventSource]);

  const live: LiveAgent[] = useMemo(
    () =>
      agents.map((a, i) => ({
        ...a,
        visibleLines: visibleByIdx[i] ?? 0,
        liveStatus: statusByIdx[i] ?? "running",
        liveMessages: messagesByIdx[i] ?? [],
        startedAt: startedAtByIdx[i] ?? null,
        elapsedMs: elapsedByIdx[i] ?? null,
        failureReason: failureByIdx[i] ?? null,
        completionPayload: payloadByIdx[i] ?? null,
        // Override duration with real elapsed time when available
        duration: elapsedByIdx[i] != null
          ? formatElapsed(elapsedByIdx[i]!)
          : startedAtByIdx[i] != null && statusByIdx[i] === "running"
            ? formatElapsed(Date.now() - startedAtByIdx[i]!)
            : a.duration,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agents, visibleByIdx, statusByIdx, messagesByIdx, startedAtByIdx, elapsedByIdx, failureByIdx, payloadByIdx, tick],
  );

  return { agents: live, activeIndex, restart, done };
}

/** Format milliseconds as a compact duration string. */
function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = ms / 1000;
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = Math.round(secs % 60);
  return `${mins}m ${remSecs}s`;
}
