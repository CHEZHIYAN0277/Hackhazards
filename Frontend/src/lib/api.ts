/**
 * Centralized API configuration.
 *
 * Reads from Vite env so a single env change swaps every screen from the
 * bundled mock data source to a real backend. No hardcoded localhost URLs.
 */
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export type DataSource = "mock" | "api";

export const DATA_SOURCE: DataSource =
  ((import.meta.env.VITE_DATA_SOURCE as string | undefined) ?? "mock") === "api"
    ? "api"
    : "mock";

/**
 * Endpoint registry. Keep every backend path in one place so swapping the
 * backend never requires hunting through component files.
 */
export const ENDPOINTS = {
  runs: () => `/runs`,
  run: (runId: string) => `/runs/${encodeURIComponent(runId)}`,
  runEvents: (runId: string) => `/runs/${encodeURIComponent(runId)}/events`,
  runSig: (runId: string) => `/runs/${encodeURIComponent(runId)}/sig`,
  runProof: (runId: string, issueId: string) => `/runs/${encodeURIComponent(runId)}/proof/${encodeURIComponent(issueId)}`,
  runCve: (runId: string) => `/runs/${encodeURIComponent(runId)}/cve`,
  runStatic: (runId: string) => `/runs/${encodeURIComponent(runId)}/static`,
  runBlast: (runId: string) => `/runs/${encodeURIComponent(runId)}/blast`,
  runFixPlan: (runId: string) => `/runs/${encodeURIComponent(runId)}/fix-plan`,
  runPatches: (runId: string) => `/runs/${encodeURIComponent(runId)}/patches`,
  runHumanReview: (runId: string) => `/runs/${encodeURIComponent(runId)}/human-review`,
  health: () => `/health`,
} as const;

export function isMockMode(): boolean {
  return DATA_SOURCE === 'mock';
}

export interface FetcherOptions extends RequestInit {
  /** Optional path under API_BASE_URL. If `url` is absolute it is used as-is. */
  json?: unknown;
}

export async function apiFetch<T = unknown>(
  url: string,
  options: FetcherOptions = {},
): Promise<T> {
  const { json, headers, ...rest } = options;
  const full = /^https?:/i.test(url) ? url : `${API_BASE_URL}${url}`;
  const response = await fetch(full, {
    ...rest,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...(headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (!response.ok) {
    throw new Error(`API ${response.status}: ${response.statusText}`);
  }
  return (await response.json()) as T;
}

/** WebSocket base URL derived from the HTTP base. */
export const WS_BASE_URL: string = API_BASE_URL
  ? API_BASE_URL.replace(/^http/, 'ws')
  : '';

/* ------------------------------------------------------------------ */
/*  WebSocket event source for the execution timeline                 */
/* ------------------------------------------------------------------ */

import type { AgentStatus } from '@/components/proofix/data';
import type { EventSourceFactory, ExecutionEvent } from '@/components/proofix/mockEventStream';

const BACKEND_AGENT_MAP: Record<string, number> = {
  A1: 0, A2: 1, A3: 2, 'A3.5': 3, A4: 4, A5: 5, A6: 6, A7: 7, A8: 8, A9: 9, A10: 10,
};

const STATUS_MAP: Record<string, AgentStatus> = {
  completed: 'completed',
  failed: 'failed',
  retry: 'retry',
};

export function createWSEventSource(runId: string): EventSourceFactory {
  return (_agents, emit) => {
    const ws = new WebSocket(`${WS_BASE_URL}/ws/runs/${encodeURIComponent(runId)}`);
    const lineCounts: Record<number, number> = {};

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.type === 'ping') return;

        // Frontend-translated events from backend — pass through with message/payload
        if (data.type === 'agent.started' || data.type === 'agent.line' || data.type === 'agent.finalized' || data.type === 'run.completed') {
          emit(data as ExecutionEvent);
          return;
        }

        // Raw AgentStatusEvent — translate client-side as fallback
        const idx = BACKEND_AGENT_MAP[data.agent_id];
        if (idx === undefined) return;
        const message: string | undefined = data.message || undefined;
        const payload: Record<string, unknown> | undefined = data.payload || undefined;

        if (data.status === 'started') {
          emit({ type: 'agent.started', index: idx, message });
        } else if (data.status === 'progress') {
          lineCounts[idx] = (lineCounts[idx] ?? 0) + 1;
          emit({ type: 'agent.line', index: idx, lineIndex: lineCounts[idx], message });
        } else if (data.status in STATUS_MAP) {
          emit({ type: 'agent.finalized', index: idx, status: STATUS_MAP[data.status], message, payload });
        }
      } catch { /* ignore parse errors */ }
    };

    ws.onclose = () => emit({ type: 'run.completed' });
    ws.onerror = () => ws.close();

    return () => ws.close();
  };
}

