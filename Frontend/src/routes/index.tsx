import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Sidebar, type SidebarRepo, type SidebarRun } from "@/components/proofix/Sidebar";
import { RunReport } from "@/components/proofix/RunReport";
import { AgentCard } from "@/components/proofix/AgentCard";
import { ChatPanel } from "@/components/proofix/ChatPanel";
import { StatusBadge } from "@/components/proofix/StatusBadge";
import { AnimatedNumber } from "@/components/proofix/AnimatedNumber";

import { useExecutionRun, type LiveAgent } from "@/components/proofix/useExecutionRun";
import { EvidenceHandoff } from "@/components/proofix/AgentVisualization";
import { NewRunScreen } from "@/components/proofix/NewRunScreen";
import { AnalyzingSequence } from "@/components/proofix/AnalyzingSequence";

import { RetrySequence } from "@/components/proofix/RetrySequence";

import { ProgressRing } from "@/components/proofix/ProgressRing";
import { GitBranch, Hash, Clock, RefreshCcw, Sparkles, GitPullRequest } from "lucide-react";
import {
  HANDOFF_LABELS,
  type WorkspaceHeaderModel,
  type ExecutiveSummaryModel,
  type RunReportModel,
  type RepairAttemptsModel,
} from "@/mocks";
import {
  listRepositories,
  getWorkspaceHeader,
  getExecutiveSummary,
  getRunReport,
  getRepairAttempts,
  startRun,
  fetchRunStatus,
  fetchAgentEnrichment,
  enrichAgents,
  type AgentEnrichment,
} from "@/lib/runService";
import { DATA_SOURCE, createWSEventSource } from "@/lib/api";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ProoFix — AI Execution Workspace" },
      {
        name: "description",
        content:
          "Watch an autonomous engineer analyze, reason, validate and decide whether a pull request deserves to be merged.",
      },
    ],
  }),
  component: Workspace,
});

type View = "execution" | "new-run" | "analyzing" | "settings" | "home" | "runs";

const ACTIVE_AGENT_ANCHOR_PX = 140;
const ACTIVE_AGENT_ANCHOR_MIN_PX = 120;
const ACTIVE_AGENT_ANCHOR_MAX_PX = 150;
const AGENT_LAYOUT_SETTLE_TIMEOUT_MS = 1400;

function getAgentHeader(index: number): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-execution-agent-index="${index}"] [data-execution-agent-header="true"]`,
  );
}

function scrollAgentHeaderToAnchor(header: HTMLElement, behavior: ScrollBehavior) {
  const top = header.getBoundingClientRect().top + window.scrollY - ACTIVE_AGENT_ANCHOR_PX;
  window.scrollTo({ top: Math.max(0, top), behavior });
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForTimelineLayoutToSettle() {
  await nextFrame();
  await nextFrame();

  const animations = document
    .getAnimations()
    .filter((animation) => {
      const timing = animation.effect?.getComputedTiming();
      if (!timing || timing.iterations === Infinity) return false;
      return animation.playState === "running";
    })
    .map((animation) => animation.finished.catch(() => undefined));

  if (animations.length === 0) return;

  await Promise.race([
    Promise.all(animations),
    new Promise<void>((resolve) => window.setTimeout(resolve, AGENT_LAYOUT_SETTLE_TIMEOUT_MS)),
  ]);

  await nextFrame();
}

function parseRepoName(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[1]?.replace(/\.git$/, "") || parts[0] || "repository";
  } catch {
    const m = url.match(/([^/]+?)(?:\.git)?\/?$/);
    return m?.[1] || "repository";
  }
}

function Workspace() {
  // Data fetching state
  const [repositories, setRepositories] = useState<SidebarRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [wsHeader, setWsHeader] = useState<WorkspaceHeaderModel | null>(null);
  const [execSummary, setExecSummary] = useState<ExecutiveSummaryModel | null>(null);
  const [report, setReport] = useState<RunReportModel | null>(null);
  const [retryModel, setRetryModel] = useState<RepairAttemptsModel | null>(null);
  const [backendCompleted, setBackendCompleted] = useState(false);

  // Single source of truth for the currently visible run.
  const [runId, setRunId] = useState<string>("");

  // Execution timeline — use WS event source in API mode
  const eventSourceFactory = DATA_SOURCE === "api" && runId
    ? createWSEventSource(runId)
    : undefined;
  const { agents: rawAgents, activeIndex, restart, done } = useExecutionRun(
    eventSourceFactory ? { createEventSource: eventSourceFactory } : undefined
  );

  // Agent enrichment — real data from agent-specific endpoints
  const [enrichment, setEnrichment] = useState<AgentEnrichment | null>(null);
  const enrichedAgents = useMemo(
    () => (enrichment ? enrichAgents(rawAgents, enrichment) : rawAgents),
    [rawAgents, enrichment],
  );

  // Per-card user overrides on top of the default expansion rule.
  // Default: only the currently-running agent is expanded.
  const [overrides, setOverrides] = useState<Record<number, boolean>>({});
  const toggleOverride = (i: number, defaultExpanded: boolean) => {
    setOverrides((prev) => {
      const current = prev[i] ?? defaultExpanded;
      return { ...prev, [i]: !current };
    });
  };

  const [view, setView] = useState<View>("execution");
  const [pendingRepo, setPendingRepo] = useState<string>("");
  const [pendingRepoUrl, setPendingRepoUrl] = useState<string>("");
  const [showRunReport, setShowRunReport] = useState(false);
  const prevDone = useRef(false);
  const repairAttemptsRef = useRef<HTMLDivElement | null>(null);
  const executiveSummaryRef = useRef<HTMLDivElement | null>(null);
  const activeScrollGenerationRef = useRef(0);
  const anchoredAgentRef = useRef<number | null>(null);
  const primaryAlignUntilRef = useRef(0);

  // Load repositories on mount
  useEffect(() => {
    listRepositories().then(setRepositories).catch(console.error).finally(() => setLoadingRepos(false));
  }, []);

  // Load run-level data when runId changes
  useEffect(() => {
    if (!runId) return;
    getWorkspaceHeader(runId).then(setWsHeader).catch(console.error);
    getExecutiveSummary(runId).then(setExecSummary).catch(console.error);
  }, [runId]);

  // Poll backend status every 3s while the run is active.
  // Updates header + summary progressively; detects completion.
  useEffect(() => {
    if (!runId || backendCompleted || DATA_SOURCE !== "api") return;
    const interval = setInterval(async () => {
      try {
        const status = await fetchRunStatus(runId);
        // Progressively update header & summary with latest data
        getWorkspaceHeader(runId, status).then(setWsHeader).catch(console.error);
        getExecutiveSummary(runId, status).then(setExecSummary).catch(console.error);
        if (status.status === "completed" || status.status === "failed") {
          setBackendCompleted(true);
          clearInterval(interval);
        }
      } catch {
        // Network error — keep polling
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [runId, backendCompleted]);

  // Load post-run data when execution completes (WS done or backend poll)
  useEffect(() => {
    if (!runId || (!done && !backendCompleted)) return;
    getRunReport(runId).then(setReport).catch(console.error);
    getRepairAttempts(runId).then(setRetryModel).catch(console.error);
    // Refresh header/summary one final time with completed data
    getWorkspaceHeader(runId).then(setWsHeader).catch(console.error);
    getExecutiveSummary(runId).then(setExecSummary).catch(console.error);
    // Fetch agent enrichment data from dedicated endpoints
    fetchAgentEnrichment(runId).then(setEnrichment).catch(console.error);
  }, [runId, done, backendCompleted]);

  // When current run finishes, flip its sidebar status (draft per demo data).
  useEffect(() => {
    if (done && !prevDone.current) {
      setRepositories((prev) =>
        prev.map((r) => ({
          ...r,
          runs: r.runs.map((run) => (run.id === runId ? { ...run, status: "draft" as const, time: "just now" } : run)),
        })),
      );
      // End-of-run storytelling:
      //  1) 700ms pause, then gently scroll to Repair Attempts (git-history reveal).
      //  2) Attempts stagger in (~540ms) + 700ms breathing room.
      //  3) Smooth-scroll to the AI Executive Summary.
      //  4) Once the summary is in view, fade in the Run Report panel from the right.
      setShowRunReport(false);
      const REVEAL_ATTEMPTS_AT = 700;
      const SCROLL_TO_SUMMARY_AT = REVEAL_ATTEMPTS_AT + 540 + 700; // ~1940ms
      const REVEAL_REPORT_AT = SCROLL_TO_SUMMARY_AT + 650;

      const t1 = window.setTimeout(() => {
        repairAttemptsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, REVEAL_ATTEMPTS_AT);
      const t2 = window.setTimeout(() => {
        const el = executiveSummaryRef.current;
        if (el) {
          const top = el.getBoundingClientRect().top + window.scrollY - 24;
          window.scrollTo({ top, behavior: "smooth" });
        } else {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }, SCROLL_TO_SUMMARY_AT);
      const t3 = window.setTimeout(() => {
        setShowRunReport(true);
      }, REVEAL_REPORT_AT);
      prevDone.current = done;
      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
        window.clearTimeout(t3);
      };
    }
    if (!done) setShowRunReport(false);
    prevDone.current = done;
  }, [done, runId]);

  useEffect(() => {
    if (done || view !== "execution") return;

    const generation = activeScrollGenerationRef.current + 1;
    activeScrollGenerationRef.current = generation;
    anchoredAgentRef.current = null;

    let cancelled = false;

    waitForTimelineLayoutToSettle().then(() => {
      if (cancelled || activeScrollGenerationRef.current !== generation) return;
      const header = getAgentHeader(activeIndex);
      if (!header) return;
      scrollAgentHeaderToAnchor(header, "smooth");
      primaryAlignUntilRef.current = performance.now() + 750;

      window.setTimeout(() => {
        requestAnimationFrame(() => {
          if (cancelled || activeScrollGenerationRef.current !== generation) return;
          const settledHeader = getAgentHeader(activeIndex);
          if (!settledHeader) return;
          const { top } = settledHeader.getBoundingClientRect();
          if (top < ACTIVE_AGENT_ANCHOR_MIN_PX || top > ACTIVE_AGENT_ANCHOR_MAX_PX) {
            scrollAgentHeaderToAnchor(settledHeader, "smooth");
          }
          anchoredAgentRef.current = activeIndex;
        });
      }, 780);
    });

    return () => {
      cancelled = true;
    };
  }, [activeIndex, done, view]);

  // Streaming auto-follow: as the active agent grows (new lines, graphs,
  // visualizations), gently scroll the viewport downward so the newest
  // content stays visible — like ChatGPT / Cursor. Never pushes the header
  // above ~80px from the top; never scrolls up.
  useEffect(() => {
    if (done || view !== "execution") return;
    const article = document.querySelector<HTMLElement>(`[data-execution-agent-index="${activeIndex}"]`);
    if (!article) return;

    let raf = 0;
    let lastBottom = 0;

    const follow = () => {
      raf = 0;
      if (anchoredAgentRef.current !== activeIndex) return;
      if (performance.now() < primaryAlignUntilRef.current) return;
      const rect = article.getBoundingClientRect();
      const vh = window.innerHeight;
      const bottomPadding = 140;
      const overflow = rect.bottom - (vh - bottomPadding);
      if (overflow <= 4) {
        lastBottom = rect.bottom;
        return;
      }
      // Only follow when the card is actually growing downward.
      const grew = rect.bottom - lastBottom > 0.5;
      lastBottom = rect.bottom;
      if (!grew) return;

      const header = getAgentHeader(activeIndex);
      const headerTop = header?.getBoundingClientRect().top ?? rect.top;
      const minHeaderTop = 72; // don't push header above this
      const maxDelta = Math.max(0, headerTop - minHeaderTop);
      const delta = Math.min(overflow, maxDelta);
      if (delta < 4) return;
      window.scrollBy({ top: delta, behavior: "smooth" });
    };

    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(follow);
    };

    lastBottom = article.getBoundingClientRect().bottom;
    const observer = new ResizeObserver(schedule);
    observer.observe(article);

    return () => {
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [activeIndex, done, view]);

  const handleNewRun = () => {
    setView("new-run");
  };

  const handleAnalyze = (url: string) => {
    setPendingRepo(parseRepoName(url));
    setPendingRepoUrl(url);
    setView("analyzing");
  };

  const handleAnalyzeComplete = async () => {
    const repoName = pendingRepo || "repository";
    let newRunId: string;
    try {
      newRunId = await startRun(pendingRepoUrl || pendingRepo);
    } catch {
      newRunId = `run-${Date.now()}`;
    }
    const newRun: SidebarRun = {
      id: newRunId,
      name: "Analysis Run",
      status: "running",
      time: "now",
    };
    setRepositories((prev) => {
      const exists = prev.some((r) => r.name === repoName);
      if (exists) {
        return prev.map((r) => (r.name === repoName ? { ...r, runs: [newRun, ...r.runs] } : r));
      }
      return [{ name: repoName, runs: [newRun] }, ...prev];
    });
    setRunId(newRunId);
    setBackendCompleted(false);
    setReport(null);
    setRetryModel(null);
    setWsHeader(null);
    setExecSummary(null);
    setEnrichment(null);
    setOverrides({});
    setView("execution");
    restart();
  };

  const handleSelectRun = (selectedRunId: string) => {
    setRunId(selectedRunId);
    setView("execution");
  };

  const handleNavigate = (key: "home" | "runs" | "settings") => {
    setView(key);
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      <Sidebar
        onNewRun={handleNewRun}
        onNavigate={handleNavigate}
        currentView={view}
        repositories={repositories}
        activeRunId={done ? null : runId}
        selectedRunId={runId}
        onSelectRun={handleSelectRun}
      />

      <main className="min-w-0 flex-1">
        {view === "new-run" && <NewRunScreen onAnalyze={handleAnalyze} />}
        {view === "analyzing" && <AnalyzingSequence repo={pendingRepo} onComplete={handleAnalyzeComplete} />}
        {(view === "home" || view === "runs" || view === "settings") && <SimpleView label={view} />}
        {view === "execution" && (
          <div className="mx-auto flex max-w-[1480px] gap-6 px-6 py-6">
            <div className={`min-w-0 flex-1 space-y-6 ${done ? "pb-[160px]" : "pb-24"}`}>
              <WorkspaceHeader done={done} header={wsHeader ?? undefined} />
              <div ref={executiveSummaryRef} className="scroll-mt-6">
                <ExecutiveSummary agents={enrichedAgents} activeIndex={activeIndex} done={done} summary={execSummary ?? undefined} />
              </div>

              <section>
                <SectionHeading eyebrow="Execution Journal" title="Live execution timeline" />
                <div className="mt-4 space-y-3">
                  {enrichedAgents.map((entry, i) => {
                    // Story mode: only reveal agents up to the current active one.
                    if (!done && i > activeIndex) return null;
                    const prev = enrichedAgents[i - 1];
                    const prevDone =
                      prev &&
                      (prev.liveStatus === "completed" || prev.liveStatus === "draft" || prev.liveStatus === "failed");
                    const showHandoff = i > 0 && prevDone && i <= activeIndex;
                    const isActive = i === activeIndex && !done;
                    const defaultExpanded = isActive;
                    const expanded = overrides[i] ?? defaultExpanded;
                    return (
                      <div key={entry.id}>
                        {showHandoff && (
                          <div className="animate-fade-in">
                            <EvidenceHandoff
                              label={HANDOFF_LABELS[prev?.id ?? ""] ?? "evidence"}
                              toLabel={HANDOFF_LABELS[entry.id]}
                              live={isActive}
                              active
                            />
                          </div>
                        )}

                        <div
                          className="animate-fade-in"
                          style={
                            i > 0 && i === activeIndex && !done
                              ? {
                                  animationDelay: "550ms",
                                  animationFillMode: "both",
                                }
                              : undefined
                          }
                        >
                          <AgentCard
                            entry={entry}
                            agentIndex={i}
                            active={isActive}
                            expanded={expanded}
                            outputLabel={HANDOFF_LABELS[entry.id]}
                            onSelect={() => {
                              toggleOverride(i, defaultExpanded);
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {(() => {
                const mutationIdx = enrichedAgents.findIndex((a) => a.id === "mutation");
                const showRetries = mutationIdx >= 0 && activeIndex >= mutationIdx;
                return showRetries && retryModel ? (
                  <div ref={repairAttemptsRef} className="scroll-mt-6">
                    <RetrySequence model={retryModel} />
                  </div>
                ) : null;
              })()}

              <footer className="pb-4 pt-2 text-center text-xs text-ink-soft">
                Run {wsHeader?.shortRunId ?? runId.slice(0, 8)} · evidence preserved · proof bundle signed
              </footer>
            </div>

            {done && showRunReport && report && <RunReport done={done} agents={enrichedAgents} activeIndex={activeIndex} report={report} />}
          </div>
        )}
      </main>

      {view === "execution" && runId && <ChatPanel runId={runId} />}
    </div>
  );
}

function SimpleView({ label }: { label: string }) {
  const title = label.charAt(0).toUpperCase() + label.slice(1);
  return (
    <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center px-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-2 text-sm text-ink-soft">Select a repository from the sidebar to view a run.</p>
      </div>
    </div>
  );
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-primary">{eyebrow}</div>
      <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">{title}</h2>
      {description && <p className="mt-1 max-w-2xl text-sm text-ink-soft">{description}</p>}
    </div>
  );
}

function WorkspaceHeader({
  done,
  header,
}: {
  done: boolean;
  header?: WorkspaceHeaderModel;
}) {
  if (!header) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-5 animate-pulse">
        <div className="h-8 w-48 rounded bg-surface-muted" />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface-muted/60 px-3 py-2.5">
              <div className="h-3 w-16 rounded bg-surface-muted" />
              <div className="mt-2 h-4 w-12 rounded bg-surface-muted" />
            </div>
          ))}
        </div>
      </section>
    );
  }
  const items = [
    { label: "Repository", value: header.repository, mono: true },
    { label: "Branch", value: header.branch, icon: <GitBranch className="h-3 w-3" />, mono: true },
    { label: "Run", value: header.shortRunId, icon: <Hash className="h-3 w-3" />, mono: true },
    { label: "Current Agent", value: done ? "Completed" : "Streaming…" },
    { label: "Retries", value: String(header.retries), icon: <RefreshCcw className="h-3 w-3" /> },
    { label: "Execution Time", value: header.executionTime, icon: <Clock className="h-3 w-3" /> },
  ];
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-ink-soft">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                done ? "bg-status-completed" : "bg-status-running animate-soft-pulse"
              }`}
            />
            {done ? "Execution complete" : "Executing"}
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink">
            {header.repository} <span className="text-ink-soft">·</span>{" "}
            <span className="font-mono text-lg text-ink-soft">{header.branch}</span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            status={done ? "completed" : "running"}
            pulse={!done}
            label={done ? "Status · Completed" : "Status · Running"}
          />
          <StatusBadge status="draft" label={`Decision · ${header.decisionLabel}`} />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((it) => (
          <div key={it.label} className="rounded-lg border border-border bg-surface-muted/60 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-soft">
              {it.icon}
              {it.label}
            </div>
            <div
              className={`mt-1 truncate text-sm font-semibold text-ink tabular-nums ${it.mono ? "font-mono" : ""}`}
              title={it.value}
            >
              <AnimatedNumber value={it.value} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ExecutiveSummary({
  agents,
  activeIndex,
  done,
  summary,
}: {
  agents: LiveAgent[];
  activeIndex: number;
  done: boolean;
  summary?: ExecutiveSummaryModel;
}) {
  void agents;

  if (!summary) {
    return (
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-7 animate-pulse">
        <div className="h-6 w-40 rounded bg-surface-muted" />
        <div className="mt-6 grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-4 w-full rounded bg-surface-muted" />
            ))}
          </div>
          <div className="h-48 rounded-xl border border-border bg-surface-muted/40" />
        </div>
      </section>
    );
  }

  // Decision
  const decision = summary.decision;
  const decisionMeta =
    decision === "merge"
      ? {
          label: "Auto Merge",
          tint: "bg-status-completed-bg/40 border-status-completed/30",
          dot: "bg-status-completed",
          text: "text-status-completed",
        }
      : decision === "failed"
        ? {
            label: "Failed",
            tint: "bg-status-failed-bg/40 border-status-failed/30",
            dot: "bg-status-failed",
            text: "text-status-failed",
          }
        : {
            label: "Draft PR",
            tint: "bg-status-draft-bg/40 border-status-draft/30",
            dot: "bg-status-draft",
            text: "text-status-draft",
          };

  // Reveal threshold per field (agent index)
  type Fact = { label: string; value: ReactNode; show: boolean; mono?: boolean };

  const executionFacts: Fact[] = [
    { label: "Repository", value: summary.repository, show: activeIndex >= 0, mono: true },
    { label: "Runtime", value: done ? summary.runtime : "—", show: done, mono: true },
    { label: "Attempts", value: String(summary.attempts), show: activeIndex >= 7, mono: true },
  ];

  const analysisFacts: Fact[] = [
    { label: "Bug", value: summary.bug, show: activeIndex >= 2 },
    {
      label: "Severity",
      value: (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-status-failed/30 bg-status-failed-bg/50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-status-failed">
          <span className="h-1.5 w-1.5 rounded-full bg-status-failed" />
          {summary.severity}
        </span>
      ),
      show: activeIndex >= 2,
    },
    { label: "Root Cause", value: summary.rootCause, show: activeIndex >= 4 },
    { label: "Confidence", value: summary.confidence, show: activeIndex >= 4, mono: true },
    { label: "Files Affected", value: String(summary.filesAffected), show: activeIndex >= 5, mono: true },
    { label: "Mutation Score", value: summary.mutationScore, show: activeIndex >= 8, mono: true },
  ];

  const evidence = [
    { ok: true, label: "Runtime Reproduced", show: activeIndex >= 3 },
    { ok: true, label: "Root Cause Confirmed", show: activeIndex >= 4 },
    { ok: false, label: "Mutation Validation Failed", show: activeIndex >= 8 },
  ];

  const renderFact = (f: Fact) => (
    <div
      key={f.label}
      className={`flex items-center justify-between gap-4 border-b border-border/50 pb-2.5 transition-opacity duration-500 ${
        f.show ? "opacity-100" : "opacity-0"
      }`}
    >
      <dt className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-soft">{f.label}</dt>
      <dd
        className={`truncate text-right text-[13px] font-semibold text-ink tabular-nums ${f.mono ? "font-mono" : ""}`}
      >
        {f.show ? f.value : "—"}
      </dd>
    </div>
  );

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-7 animate-card-in">
      <div className="absolute right-6 top-6 hidden h-24 w-24 rounded-full bg-white/[0.015] blur-2xl sm:block" />
      <div className="relative">
        <div className="flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
          <span className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5" />
            AI Executive Summary
          </span>
          {!done && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-status-running-bg px-2 py-0.5 text-[10px] font-medium text-status-running normal-case tracking-normal">
              <span className="h-1.5 w-1.5 rounded-full bg-status-running animate-soft-pulse" />
              Live
            </span>
          )}
        </div>

        <div className="mt-6 grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
          {/* Left: Facts, grouped */}
          <div className="space-y-7">
            <div>
              <div className="mb-3.5 text-[10px] font-medium uppercase tracking-[0.14em] text-ink-soft">Execution</div>
              <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">{executionFacts.map(renderFact)}</dl>
            </div>
            <div>
              <div className="mb-3.5 text-[10px] font-medium uppercase tracking-[0.14em] text-ink-soft">Analysis</div>
              <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">{analysisFacts.map(renderFact)}</dl>
            </div>
          </div>

          {/* Right: Final Decision */}
          <div
            className={`flex flex-col rounded-xl border p-6 transition-all duration-500 ${decisionMeta.tint} ${
              done ? "opacity-100" : "opacity-60"
            }`}
          >
            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-soft">Final Decision</div>

            <div className="mt-4 inline-flex items-center gap-2.5 self-start rounded-xl border border-border bg-surface px-4 py-2.5">
              <span className={`h-2.5 w-2.5 rounded-full ${decisionMeta.dot} ${!done ? "animate-soft-pulse" : ""}`} />
              <span className={`text-lg font-bold tracking-tight ${decisionMeta.text}`}>
                {done ? decisionMeta.label : "In progress…"}
              </span>
              {done && decision === "draft" && (
                <GitPullRequest className="h-4 w-4 text-status-draft" strokeWidth={1.75} />
              )}
            </div>

            <div className="mt-5 flex items-baseline justify-between gap-2 border-b border-border/50 pb-3">
              <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-soft">Trust Score</span>
              <span className="font-mono text-base font-semibold text-ink tabular-nums">
                {done ? <AnimatedNumber value={summary.trustScore} duration={700} /> : "—"}
              </span>
            </div>

            <div className={`mt-4 transition-opacity duration-500 ${done ? "opacity-100" : "opacity-0"}`}>
              <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-soft">Reason</div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink">{summary.decisionReason}</p>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {evidence.map((e) => (
                <span
                  key={e.label}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-all duration-500 hover:-translate-y-[1px] ${
                    e.show ? "opacity-100" : "opacity-0"
                  } ${
                    e.ok
                      ? "border-status-completed/30 bg-status-completed-bg/40 text-status-completed hover:border-status-completed/50"
                      : "border-status-failed/30 bg-status-failed-bg/40 text-status-failed hover:border-status-failed/50"
                  }`}
                >
                  {e.ok ? "✓" : "✗"} {e.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
