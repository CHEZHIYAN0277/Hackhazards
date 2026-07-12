import { useEffect, useState } from "react";
import { Check, Bug, GitMerge, Skull, ShieldCheck, AlertTriangle, Terminal } from "lucide-react";
import type { LiveAgent } from "./useExecutionRun";
import type {
  AgentVisualizationPayload,
  BlastPayload,
  DepsPayload,
  MergePayload,
  MutationPayload,
  PatchPayload,
  PlannerPayload,
  ReproducePayload,
  RepoIntelPayload,
  RootCausePayload,
  StaticPayload,
} from "./visualizationTypes";

/**
 * Per-agent execution visualization. Each agent renders a distinct scene that
 * progresses with `entry.visibleLines / entry.lines.length`. Visuals are
 * intentionally lightweight (no heavy libs) and reuse design tokens.
 *
 * Every concrete viz is purely a renderer over its typed payload — no
 * inline literals, no hardcoded findings/metrics/patches. Payloads are
 * provided by `AgentEntry.visualization` (sourced via runService).
 */
export function AgentVisualization({ entry }: { entry: LiveAgent }) {
  const total = entry.lines.length || 1;
  const progress = Math.min(1, entry.visibleLines / total);
  const done =
    entry.liveStatus === "completed" ||
    entry.liveStatus === "draft" ||
    entry.liveStatus === "failed";

  const payload: AgentVisualizationPayload | undefined = entry.visualization;
  if (!payload) return null;

  switch (payload.kind) {
    case "repo-intel":
      return <RepoIntelViz data={payload.data} progress={progress} done={done} />;
    case "deps":
      return <DepsViz data={payload.data} progress={progress} done={done} />;
    case "static":
      return <StaticViz data={payload.data} progress={progress} done={done} />;
    case "reproduce":
      return <ReproduceViz data={payload.data} progress={progress} done={done} />;
    case "root":
      return <RootCauseViz data={payload.data} progress={progress} done={done} />;
    case "blast":
      return <BlastViz data={payload.data} progress={progress} done={done} />;
    case "planner":
      return <PlannerViz data={payload.data} progress={progress} done={done} />;
    case "patch":
      return <PatchViz data={payload.data} progress={progress} done={done} />;
    case "mutation":
      return (
        <MutationViz
          data={payload.data}
          progress={progress}
          failed={entry.liveStatus === "failed"}
          done={done}
        />
      );
    case "merge":
      return <MergeViz data={payload.data} progress={progress} done={done} />;
    default:
      return null;
  }
}

function Frame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-ink-soft">
        {label}
      </div>
      {children}
    </div>
  );
}

/** Smoothly counts a number up to `value` while `active`. */
function useCountUp(value: number, active: boolean, duration = 700) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) {
      setN(0);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setN(Math.round(p * value));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, active, duration]);
  return n;
}

/* ============================================================
 * A1 — Semantic Repository Mapper
 * ============================================================ */
function RepoIntelViz({
  data,
  progress,
  done,
}: {
  data: RepoIntelPayload;
  progress: number;
  done: boolean;
}) {
  const repoFiles = data.files;
  const totalNodes = data.graphNodes;

  const scanEnd = 0.45;
  const astEnd = 0.7;
  const fileProg = Math.min(1, progress / scanEnd);
  const astProg = Math.max(0, Math.min(1, (progress - scanEnd) / (astEnd - scanEnd)));
  const graphProg = Math.max(0, Math.min(1, (progress - astEnd) / (1 - astEnd)));

  const filesIndexed = Math.floor(fileProg * repoFiles.length);
  const currentScanning = fileProg < 1 ? filesIndexed : -1;

  const nodesShown = Math.round(graphProg * totalNodes);

  const fileCount = useCountUp(data.metrics.files, done);
  const astCount = useCountUp(data.metrics.astNodes, done);
  const imports = useCountUp(data.metrics.imports, done);
  const deps = useCountUp(data.metrics.dependencies, done);
  const roles = useCountUp(data.metrics.semanticRoles, done);

  const nodes = Array.from({ length: totalNodes }).map((_, i) => {
    const angle = (i / totalNodes) * Math.PI * 2 - Math.PI / 2;
    const r = 38 + (i % 3) * 7;
    return { x: 90 + Math.cos(angle) * r, y: 60 + Math.sin(angle) * r };
  });

  return (
    <Frame label="Semantic Intent Graph">
      <div className="grid gap-3 md:grid-cols-[180px_1fr]">
        <ul className="space-y-1 font-mono text-[11px]">
          <li className="text-ink-soft">repo/</li>
          {repoFiles.map((f, i) => {
            const state =
              i < filesIndexed
                ? "indexed"
                : i === currentScanning
                  ? "scanning"
                  : "waiting";
            const astBadge = i < filesIndexed && astProg > 0;
            return (
              <li key={f.name} className="flex items-center justify-between gap-2 pl-3">
                <span className="flex items-center gap-1.5 truncate">
                  {state === "indexed" ? (
                    <Check className="h-3 w-3 shrink-0 text-status-completed" strokeWidth={3} />
                  ) : state === "scanning" ? (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-status-running animate-soft-pulse" />
                  ) : (
                    <span className="h-2 w-2 shrink-0 rounded-full border border-border" />
                  )}
                  <span
                    className={
                      state === "indexed"
                        ? "text-ink"
                        : state === "scanning"
                          ? "text-status-running"
                          : "text-ink-soft opacity-60"
                    }
                  >
                    {f.name}
                  </span>
                </span>
                {astBadge && (
                  <span className="animate-line-in rounded bg-surface-muted px-1 py-0.5 text-[9px] text-ink-soft">
                    {Math.round(astProg * f.ast)} AST
                  </span>
                )}
              </li>
            );
          })}
          <li className="pl-3 text-[10px] italic text-ink-soft">
            {currentScanning >= 0
              ? `Scanning ${repoFiles[currentScanning].name}…`
              : filesIndexed === repoFiles.length && astProg < 1
                ? "Extracting AST…"
                : graphProg > 0 && graphProg < 1
                  ? "Building Semantic Intent Graph…"
                  : done
                    ? "✓ Indexed"
                    : ""}
          </li>
        </ul>

        <svg viewBox="0 0 180 120" className="animate-graph-in h-[130px] w-full">
          {nodes.slice(0, nodesShown).map((n, i) => (
            <line
              key={`e-${i}`}
              x1={90}
              y1={60}
              x2={n.x}
              y2={n.y}
              stroke="currentColor"
              className={`text-ink-soft transition-opacity duration-500 ${done ? "opacity-50" : "opacity-30"}`}
              strokeWidth={0.8}
            />
          ))}
          {nodes.slice(0, nodesShown).map((n, i) => {
            const next = nodes[(i + 3) % nodesShown];
            if (!next || i + 3 >= nodesShown) return null;
            return (
              <line
                key={`x-${i}`}
                x1={n.x}
                y1={n.y}
                x2={next.x}
                y2={next.y}
                stroke="currentColor"
                className="text-ink-soft/20"
                strokeWidth={0.5}
              />
            );
          })}
          {nodes.slice(0, nodesShown).map((n, i) => (
            <circle
              key={`n-${i}`}
              cx={n.x}
              cy={n.y}
              r={2.8}
              className={`fill-ink-soft ${done ? "" : "animate-line-in"}`}
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
          <circle
            cx={90}
            cy={60}
            r={6}
            className={done ? "fill-status-completed" : "fill-primary animate-soft-pulse"}
          />
        </svg>
      </div>

      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {[
          { label: "Files", value: fileCount },
          { label: "AST Nodes", value: astCount.toLocaleString() },
          { label: "Imports", value: imports },
          { label: "Dependencies", value: deps },
          { label: "Semantic Roles", value: roles },
        ].map((m) => (
          <div key={m.label} className="rounded-md border border-border bg-surface-muted/60 px-2 py-1.5">
            <div className="text-[9px] font-medium uppercase tracking-wider text-ink-soft">
              {m.label}
            </div>
            <div className="font-mono text-xs font-semibold text-ink">{m.value}</div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/* ============================================================
 * A2 — Dependency Analyzer
 * ============================================================ */
function DepsViz({
  data,
  progress,
  done,
}: {
  data: DepsPayload;
  progress: number;
  done: boolean;
}) {
  const path = data.path;
  const nodeW = 150;
  const nodeH = 32;
  const gapY = 22;
  const col = 110;
  const top = 8;
  const stepY = nodeH + gapY;
  const ys = path.map((_, i) => top + i * stepY);
  const totalH = top + path.length * stepY;

  const pulseSeg = progress * (path.length - 1);
  const segIdx = Math.min(path.length - 2, Math.floor(pulseSeg));
  const segT = pulseSeg - segIdx;
  const pulseY =
    ys[segIdx] + nodeH / 2 + (ys[segIdx + 1] + nodeH / 2 - (ys[segIdx] + nodeH / 2)) * segT;
  const reachedCount = Math.min(path.length, Math.ceil(progress * path.length));

  const dead = data.unreachable.map((d, i) => ({
    name: d.name,
    y: ys[Math.min(i, ys.length - 1)] + nodeH / 2 + (i === 0 ? 0 : 8),
  }));

  const reachable = useCountUp(data.metrics.reachable, done);
  const deadFindings = useCountUp(data.metrics.deadFindings, done);
  const attack = useCountUp(data.metrics.attackPaths, done);

  return (
    <Frame label="Reachability — Live Trace">
      <svg viewBox={`0 0 220 ${totalH + 8}`} className="animate-graph-in w-full" style={{ height: totalH + 8 }}>
        <defs>
          <radialGradient id="dep-pulse">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.9" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </radialGradient>
        </defs>

        {path.slice(0, -1).map((_, i) => {
          const reached = i < reachedCount - 1;
          return (
            <line
              key={`l-${i}`}
              x1={col}
              y1={ys[i] + nodeH}
              x2={col}
              y2={ys[i + 1]}
              stroke="currentColor"
              strokeWidth={reached ? 1.4 : 0.9}
              className={`transition-all duration-500 ${
                reached ? "text-ink-soft" : "text-border"
              }`}
            />
          );
        })}

        {path.map((p, i) => {
          const reached = i < reachedCount;
          const isHead = i === reachedCount - 1 && !done;
          return (
            <g key={p.name} className="transition-all duration-500">
              <rect
                x={col - nodeW / 2}
                y={ys[i]}
                width={nodeW}
                height={nodeH}
                rx={6}
                className={`transition-all duration-500 ${
                  reached
                    ? "fill-surface-muted stroke-border"
                    : "fill-surface-muted/40 stroke-border"
                } ${isHead ? "animate-soft-pulse" : ""}`}
                strokeWidth={1}
              />
              <text
                x={col}
                y={ys[i] + 13}
                textAnchor="middle"
                className={`fill-current font-mono text-[10px] font-semibold ${
                  reached ? "text-ink" : "text-ink-soft opacity-60"
                }`}
              >
                {p.name}
              </text>
              <text
                x={col}
                y={ys[i] + 24}
                textAnchor="middle"
                className={`fill-current text-[8px] ${
                  reached ? "text-ink-soft" : "text-ink-soft opacity-50"
                }`}
              >
                {p.sub}
              </text>
            </g>
          );
        })}

        {!done && reachedCount > 0 && (
          <>
            <circle cx={col} cy={pulseY} r={10} fill="url(#dep-pulse)" />
            <circle
              cx={col}
              cy={pulseY}
              r={3.5}
              className="fill-primary animate-soft-pulse"
            />
          </>
        )}

        {dead.map((d) => (
          <g key={d.name} className="opacity-40 transition-opacity duration-700">
            <line
              x1={col + nodeW / 2}
              y1={d.y}
              x2={col + nodeW / 2 + 14}
              y2={d.y}
              stroke="currentColor"
              strokeDasharray="2 2"
              strokeWidth={0.6}
              className="text-border"
            />
            <circle
              cx={col + nodeW / 2 + 18}
              cy={d.y}
              r={2.2}
              className="fill-ink-soft/40"
            />
            <text
              x={col + nodeW / 2 + 24}
              y={d.y + 3}
              className="fill-current font-mono text-[8px] text-ink-soft"
            >
              {d.name}
            </text>
          </g>
        ))}
      </svg>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {[
          { label: "Reachable Findings", value: reachable, tone: "text-status-running" },
          { label: "Dead Findings", value: deadFindings, tone: "text-ink-soft" },
          { label: "Attack Paths", value: attack, tone: "text-status-failed" },
        ].map((m) => (
          <div key={m.label} className="rounded-md border border-border bg-surface-muted/60 px-2 py-1.5">
            <div className="text-[9px] font-medium uppercase tracking-wider text-ink-soft">
              {m.label}
            </div>
            <div className={`font-mono text-sm font-semibold ${m.tone}`}>{m.value}</div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/* ============================================================
 * A3 — Static Analysis
 * ============================================================ */
function StaticViz({
  data,
  progress,
  done,
}: {
  data: StaticPayload;
  progress: number;
  done: boolean;
}) {
  const findings = data.findings.filter((f) => progress >= f.at);
  const raw = useCountUp(data.metrics.raw, done);
  const dedup = useCountUp(data.metrics.deduped, done);
  const prio = useCountUp(data.metrics.prioritized, done);

  return (
    <Frame label="Scanners">
      <div className="grid gap-3 md:grid-cols-[200px_1fr]">
        <div className="space-y-2">
          {data.scanners.map((s, i) => {
            const p = Math.max(0, Math.min(1, progress * 1.3 - i * 0.12));
            return (
              <div key={s}>
                <div className="flex items-center justify-between text-[11px] text-ink">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        p >= 1 ? "bg-status-completed" : "bg-status-running animate-soft-pulse"
                      }`}
                    />
                    {s}
                  </span>
                  <span className="font-mono text-ink-soft">{Math.round(p * 100)}%</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full bg-primary transition-all duration-500"
                    style={{ width: `${p * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-md border border-border bg-surface-muted/40 p-2">
          <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-ink-soft">
            <span>Findings feed</span>
            <span className="font-mono">{findings.length}</span>
          </div>
          <ul className="space-y-1">
            {findings.map((f) => {
              const tone =
                f.sev === "HIGH"
                  ? "bg-status-failed-bg text-status-failed"
                  : f.sev === "MEDIUM"
                    ? "bg-status-retry-bg text-status-retry"
                    : "bg-status-running-bg text-status-running";
              return (
                <li
                  key={f.text}
                  className="animate-line-in flex items-center gap-2 text-[11px]"
                >
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${tone}`}>
                    {f.sev}
                  </span>
                  <span className="truncate text-ink">{f.text}</span>
                </li>
              );
            })}
            {findings.length === 0 && (
              <li className="text-[11px] italic text-ink-soft">Awaiting first signal…</li>
            )}
          </ul>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface-muted/60 px-3 py-2 font-mono text-[11px]">
        <span className="flex items-center gap-1.5">
          <AlertTriangle className="h-3 w-3 text-ink-soft" />
          <span className="text-ink">{raw}</span>
          <span className="text-ink-soft">Findings</span>
        </span>
        <span className="text-ink-soft">→ Dedup →</span>
        <span className="flex items-center gap-1.5">
          <span className="text-ink">{dedup}</span>
          <span className="text-ink-soft">Findings</span>
        </span>
        <span className="text-ink-soft">→ Prioritize →</span>
        <span className="rounded bg-status-completed-bg px-1.5 py-0.5 text-status-completed">
          {prio} actionable
        </span>
      </div>
    </Frame>
  );
}

/* ============================================================
 * A3.5 — Runtime Reproduction
 * ============================================================ */
function ReproduceViz({
  data,
  progress,
  done,
}: {
  data: ReproducePayload;
  progress: number;
  done: boolean;
}) {
  const tests = data.tests;
  const shown = Math.ceil(progress * tests.length);
  const bar = Math.min(100, Math.round(progress * 100));
  const failVisible = shown >= tests.length || done;

  return (
    <Frame label="pytest">
      <div className="rounded-md border border-border bg-[#0b0b0d] p-2.5 font-mono text-[11px] text-neutral-200">
        <div className="flex items-center gap-1.5 text-neutral-400">
          <Terminal className="h-3 w-3" />
          <span>{data.command}</span>
        </div>
        <div className="mt-1 text-neutral-500">Running…</div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-neutral-800">
          <div
            className="h-full bg-status-running transition-all duration-300"
            style={{ width: `${bar}%` }}
          />
        </div>
        <ul className="mt-2 space-y-0.5">
          {tests.slice(0, shown).map((t) => (
            <li key={t.name} className="animate-line-in flex items-center gap-2">
              <span
                className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                  t.result === "PASS"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-rose-500/15 text-rose-400"
                }`}
              >
                {t.result}
              </span>
              <span className="text-neutral-200">{t.name}</span>
            </li>
          ))}
          {!failVisible && shown < tests.length && (
            <li className="text-neutral-500">collecting…</li>
          )}
        </ul>
      </div>

      {failVisible && (
        <div className="animate-line-in mt-2 rounded-md border border-status-failed/30 bg-status-failed-bg p-2.5 font-mono text-[11px]">
          <div className="flex items-center gap-1.5 text-status-failed">
            <Bug className="h-3 w-3" />
            {data.failure.name}
          </div>
          <div className="mt-1 text-status-failed/90">{data.failure.assertion}</div>
          <div className="mt-0.5 grid grid-cols-2 gap-2 text-[10px] text-ink-soft">
            <div>
              <span>Expected </span>
              <span className="rounded bg-status-completed-bg px-1 text-status-completed">{data.failure.expected}</span>
            </div>
            <div>
              <span>Actual </span>
              <span className="rounded bg-status-failed-bg px-1 text-status-failed">{data.failure.actual}</span>
            </div>
          </div>
          <div className="mt-2 border-t border-status-failed/20 pt-1.5">
            <div className="text-[10px] uppercase tracking-wider text-ink-soft">Stack</div>
            <ol className="mt-1 space-y-0.5 text-[10px] text-ink">
              {data.failure.stack.map((f, i) => (
                <li
                  key={f}
                  className="animate-line-in flex items-center gap-1.5"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <span className="text-ink-soft">{i === data.failure.stack.length - 1 ? "└" : "├"}</span>
                  <span>{f}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {done && (
        <div className="animate-line-in mt-2 flex items-center gap-1.5 rounded-md border border-status-completed/30 bg-status-completed-bg px-2 py-1.5 text-[11px] font-semibold text-status-completed">
          <Check className="h-3 w-3" strokeWidth={3} />
          {data.successMessage}
        </div>
      )}
    </Frame>
  );
}

/* ============================================================
 * A4 — Root Cause Investigation
 * ============================================================ */
function RootCauseViz({
  data,
  progress,
  done,
}: {
  data: RootCausePayload;
  progress: number;
  done: boolean;
}) {
  const lines = data.lines;
  const inspectEnd = 0.6;
  const inspectProg = Math.min(1, progress / inspectEnd);
  const activeLine = Math.min(lines.length - 1, Math.floor(inspectProg * lines.length));
  const evidenceProg = Math.max(0, (progress - inspectEnd) / (1 - inspectEnd));
  const evidenceShown = Math.ceil(evidenceProg * data.evidence.length);
  const bugFound = activeLine >= lines.length - 1 && inspectProg >= 0.95;

  return (
    <Frame label="Root Cause — Inspection">
      <div className="rounded-md border border-border bg-surface-muted/60 p-2.5 font-mono text-[11px] leading-relaxed">
        {lines.map((l, i) => {
          const isActive = i === activeLine;
          const visited = i < activeLine;
          const isBug = i === lines.length - 1 && bugFound;
          return (
            <div
              key={i}
              className={`flex items-center gap-2 rounded px-1 transition-all duration-300 ${
                isActive
                  ? "bg-status-running-bg text-ink"
                  : isBug
                    ? "bg-status-failed-bg text-status-failed"
                    : visited
                      ? "text-ink opacity-80"
                      : "text-ink-soft opacity-40 blur-[1.5px]"
              }`}
            >
              <span className="w-3 text-[9px] text-ink-soft">{i + 1}</span>
              <span className="flex-1">{l.code}</span>
              {isActive && (
                <span className="animate-line-in inline-flex items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 text-[9px] text-primary">
                  ▸ {l.probe}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {bugFound && (
        <div className="animate-line-in mt-2 flex items-center gap-1.5 rounded-md border border-status-failed/30 bg-status-failed-bg px-2 py-1 text-[11px] font-semibold text-status-failed">
          <Bug className="h-3 w-3" /> {data.bugMessage}
        </div>
      )}

      <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
        {data.evidence.map((e, i) => {
          const visible = i < evidenceShown || done;
          return (
            <div
              key={e.n}
              className={`rounded-md border border-border bg-surface px-2 py-1.5 transition-all duration-300 ${
                visible ? "animate-line-in opacity-100" : "opacity-0"
              }`}
            >
              <div className="flex items-center justify-between text-[9px] uppercase tracking-wider text-ink-soft">
                <span>Evidence #{e.n}</span>
                <span className="font-mono text-status-completed">{e.conf}%</span>
              </div>
              <div className="text-[11px] font-medium text-ink">{e.title}</div>
              <div className="font-mono text-[9px] text-ink-soft">{e.detail}</div>
            </div>
          );
        })}
      </div>
    </Frame>
  );
}

/* ============================================================
 * A5 — Blast Radius (ripple waves)
 * ============================================================ */
function BlastViz({
  data,
  progress,
  done,
}: {
  data: BlastPayload;
  progress: number;
  done: boolean;
}) {
  const W = 320;
  const H = 220;
  const cx = W / 2;
  const cy = H / 2;
  const R = 78;

  const modules = data.modules;
  const placed = modules.map((m, i) => {
    const a = -Math.PI / 2 + (i / modules.length) * Math.PI * 2;
    const x = cx + Math.cos(a) * R;
    const y = cy + Math.sin(a) * R;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const anchor: "start" | "middle" | "end" =
      cos > 0.35 ? "start" : cos < -0.35 ? "end" : "middle";
    const tx = x + cos * 10;
    const ty = y + sin * 10 + (sin > 0.5 ? 9 : sin < -0.5 ? -2 : 3.5);
    return { ...m, x, y, tx, ty, anchor };
  });

  const affected = placed.filter((m) => progress >= m.hitAt).length;
  const affectedCount = useCountUp(
    modules.length,
    done || affected === modules.length,
  );

  return (
    <Frame label="Impact Propagation">
      <svg viewBox={`0 0 ${W} ${H}`} className="animate-graph-in w-full" style={{ height: H }}>
        <style>{`@keyframes blast-ripple { 0%{r:10;opacity:0.85} 100%{r:${R + 12};opacity:0} }`}</style>

        {!done &&
          [0, 1, 2].map((i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={10}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.1}
              className="text-status-failed"
              style={{
                animation: `blast-ripple 2.4s ${i * 0.8}s ease-out infinite`,
              }}
            />
          ))}

        {placed.map((m) => {
          const reached = progress >= m.hitAt;
          return (
            <line
              key={`l-${m.name}`}
              x1={cx}
              y1={cy}
              x2={m.x}
              y2={m.y}
              stroke="currentColor"
              strokeWidth={reached ? 1 : 0.5}
              strokeDasharray={reached ? "0" : "2 2"}
              className={`transition-all duration-500 ${
                reached ? "text-ink-soft/60" : "text-border"
              }`}
            />
          );
        })}

        {placed.map((m) => {
          const reached = progress >= m.hitAt;
          return (
            <g key={m.name} className="transition-all duration-500">
              <circle
                cx={m.x}
                cy={m.y}
                r={reached ? 5 : 3}
                className={`transition-all duration-500 ${
                  reached ? "fill-surface-muted stroke-ink-soft/40" : "fill-surface-muted stroke-border"
                } ${reached && !done ? "animate-soft-pulse" : ""}`}
                strokeWidth={0.8}
              />
              <text
                x={m.tx}
                y={m.ty}
                textAnchor={m.anchor}
                className={`fill-current font-mono text-[9px] ${
                  reached ? "text-ink" : "text-ink-soft opacity-60"
                }`}
              >
                {m.name}
              </text>
            </g>
          );
        })}

        <circle
          cx={cx}
          cy={cy}
          r={8}
          className="fill-status-failed animate-soft-pulse"
        />
        <text
          x={cx}
          y={cy + 22}
          textAnchor="middle"
          className="fill-current font-mono text-[10px] font-semibold text-status-failed"
        >
          {data.source}
        </text>
      </svg>

      <div className="mt-2 flex items-center justify-between rounded-md border border-border bg-surface-muted/60 px-3 py-1.5 font-mono text-[11px]">
        <span className="text-ink-soft">Affected modules</span>
        <span className="font-semibold text-status-failed">
          {done ? affectedCount : affected} / {modules.length}
        </span>
      </div>
    </Frame>
  );
}

/* ============================================================
 * A6 — Repair Planner (DAG draws itself)
 * ============================================================ */
function PlannerViz({
  data,
  progress,
  done,
}: {
  data: PlannerPayload;
  progress: number;
  done: boolean;
}) {
  const nodesShown = Math.ceil(progress * data.nodes.length);
  const edgesShown = Math.ceil(progress * data.edges.length);
  const rectW = 84;
  const rectH = 22;

  return (
    <Frame label="Repair DAG">
      <svg viewBox="0 0 260 210" className="animate-graph-in w-full" style={{ height: 220 }}>
        <style>{`@keyframes dag-draw { to { stroke-dashoffset: 0; } }`}</style>
        {data.edges.slice(0, edgesShown).map(([a, b], i) => {
          const A = data.nodes[a];
          const B = data.nodes[b];
          return (
            <line
              key={i}
              x1={A.x}
              y1={A.y + rectH / 2}
              x2={B.x}
              y2={B.y - rectH / 2}
              stroke="currentColor"
              strokeWidth={1}
              className="text-ink-soft/60"
              style={{
                strokeDasharray: 120,
                strokeDashoffset: 120,
                animation: "dag-draw 0.6s ease-out forwards",
              }}
            />
          );
        })}
        {data.nodes.slice(0, nodesShown).map((n, i) => (
          <g
            key={n.id}
            className="animate-line-in transition-all duration-500"
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <rect
              x={n.x - rectW / 2}
              y={n.y - rectH / 2}
              width={rectW}
              height={rectH}
              rx={5}
              className={`${
                done
                  ? "fill-status-completed-bg stroke-status-completed/40"
                  : "fill-surface stroke-border"
              }`}
              strokeWidth={1}
            />
            <text
              x={n.x}
              y={n.y + 3.5}
              textAnchor="middle"
              className="fill-current font-mono text-[9px] font-medium text-ink"
            >
              {n.label}
            </text>
          </g>
        ))}
      </svg>
    </Frame>
  );
}

/* ============================================================
 * A7 — Patch Generator (Cursor-style)
 * ============================================================ */
function PatchViz({
  data,
  progress,
  done,
}: {
  data: PatchPayload;
  progress: number;
  done: boolean;
}) {
  const thoughtsEnd = 0.35;
  const thoughtsShown = Math.ceil(Math.min(1, progress / thoughtsEnd) * data.thoughts.length);
  const editorOpen = progress >= thoughtsEnd;

  const generated = data.generated;
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (!editorOpen) {
      setTyped("");
      return;
    }
    let i = 0;
    const id = setInterval(() => {
      i++;
      setTyped(generated.slice(0, i));
      if (i >= generated.length) clearInterval(id);
    }, 24);
    return () => clearInterval(id);
  }, [editorOpen, generated]);

  const badgeProg = Math.max(0, (progress - 0.75) / 0.25);
  const badgesShown = Math.ceil(badgeProg * data.badges.length);

  return (
    <Frame label="Patch Generator">
      {!editorOpen && (
        <ul className="space-y-1 rounded-md border border-border bg-surface-muted/40 p-2 font-mono text-[11px]">
          {data.thoughts.slice(0, thoughtsShown).map((t, i) => (
            <li
              key={t}
              className="animate-line-in flex items-center gap-1.5 text-ink"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-status-running animate-soft-pulse" />
              {t}
            </li>
          ))}
        </ul>
      )}

      {editorOpen && (
        <div className="animate-line-in grid grid-cols-2 gap-2">
          <div className="rounded-md border border-border bg-surface-muted/60">
            <div className="border-b border-border px-2 py-1 text-[9px] font-medium uppercase tracking-wider text-ink-soft">
              Original
            </div>
            <pre className="p-2 font-mono text-[10px] leading-relaxed">
              {data.original.map((l, i) => (
                <div
                  key={i}
                  className={
                    l.op === "del"
                      ? "rounded bg-status-failed-bg/60 px-1 text-status-failed line-through opacity-70 transition-opacity duration-700"
                      : "px-1 text-ink-soft"
                  }
                >
                  {l.t}
                </div>
              ))}
            </pre>
          </div>
          <div className="rounded-md border border-status-completed/30 bg-status-completed-bg/30">
            <div className="border-b border-status-completed/20 px-2 py-1 text-[9px] font-medium uppercase tracking-wider text-status-completed">
              Generated Patch
            </div>
            <pre className="whitespace-pre p-2 font-mono text-[10px] leading-relaxed text-ink">
{typed}
{typed.length < generated.length && <span className="animate-soft-pulse">▌</span>}
            </pre>
          </div>
        </div>
      )}

      {(badgesShown > 0 || done) && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
          {data.badges.map((t, i) => {
            const on = i < badgesShown || done;
            return (
              <span
                key={t}
                className={`rounded-md px-1.5 py-0.5 font-mono transition-all duration-300 ${
                  on
                    ? "animate-line-in bg-status-completed-bg text-status-completed"
                    : "bg-surface-muted text-ink-soft opacity-40"
                }`}
                style={{ animationDelay: `${i * 100}ms` }}
              >
                ✓ {t}
              </span>
            );
          })}
        </div>
      )}
    </Frame>
  );
}

/* ============================================================
 * A8 — Mutation Validation
 * ============================================================ */
function MutationViz({
  data,
  progress,
  failed,
  done,
}: {
  data: MutationPayload;
  progress: number;
  failed: boolean;
  done: boolean;
}) {
  const mutants = data.mutants;
  const shown = Math.ceil(progress * mutants.length);
  const runIdx = shown - 1;
  const killedCount = mutants.slice(0, shown).filter((m) => m.killed).length;
  const score = shown ? Math.round((killedCount / shown) * 100) : 0;
  const threshold = data.threshold;
  const animatedScore = useCountUp(score, true, 400);

  return (
    <Frame label="Mutation Testing">
      <ul className="space-y-1 font-mono text-[11px]">
        {mutants.slice(0, shown).map((m, i) => {
          const isRunning = i === runIdx && !done;
          return (
            <li
              key={m.id}
              className={`animate-line-in flex items-center justify-between rounded px-2 py-1 transition-all duration-500 ${
                isRunning
                  ? "bg-status-running-bg"
                  : m.killed
                    ? "opacity-40"
                    : "bg-status-failed-bg/60 ring-1 ring-status-failed/30"
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isRunning
                      ? "bg-status-running animate-soft-pulse"
                      : m.killed
                        ? "bg-status-completed"
                        : "bg-status-failed"
                  }`}
                />
                <span className="text-ink">Mutation {m.id}</span>
                <span className="text-ink-soft">·</span>
                <span className="truncate text-ink-soft">{m.label}</span>
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  isRunning
                    ? "bg-status-running-bg text-status-running"
                    : m.killed
                      ? "bg-status-completed-bg text-status-completed"
                      : "bg-status-failed-bg text-status-failed"
                }`}
              >
                {isRunning ? (
                  "running…"
                ) : m.killed ? (
                  <>
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    Killed
                  </>
                ) : (
                  <>
                    <Skull className="h-2.5 w-2.5" />
                    Survived
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] text-ink-soft">
          <span>Mutation Score</span>
          <span className={`font-mono ${failed ? "text-status-failed" : "text-status-completed"}`}>
            {animatedScore}% / threshold {threshold}%
          </span>
        </div>
        <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-surface-muted">
          <div
            className={`h-full transition-all duration-500 ${
              failed ? "bg-status-failed" : "bg-status-completed"
            }`}
            style={{ width: `${animatedScore}%` }}
          />
          <div
            className="absolute top-0 h-full w-px bg-ink"
            style={{ left: `${threshold}%` }}
            title="Threshold"
          />
        </div>
      </div>

      {done && failed && (
        <div className="animate-line-in mt-2 rounded-md border border-status-failed/30 bg-status-failed-bg px-2 py-1.5 text-[11px] text-status-failed">
          <span className="font-semibold">Validation failed</span>
          <span className="text-status-failed/80">
            {" "}— {data.failureMessage}
          </span>
        </div>
      )}
    </Frame>
  );
}

/* ============================================================
 * A10 — Mergeability Router
 * ============================================================ */
function MergeViz({
  data,
  progress,
  done,
}: {
  data: MergePayload;
  progress: number;
  done: boolean;
}) {
  const metrics = data.metrics;
  // Independent count-ups so each metric resolves to its own number.
  // We still rely on a fixed-arity tuple for typing but only use as many
  // as the payload supplies.
  const v0 = useCountUp(metrics[0]?.value ?? 0, progress > 0.05);
  const v1 = useCountUp(metrics[1]?.value ?? 0, progress > 0.18);
  const v2 = useCountUp(metrics[2]?.value ?? 0, progress > 0.36);
  const v3 = useCountUp(metrics[3]?.value ?? 0, progress > 0.54);
  const animated = [v0, v1, v2, v3];

  const [w0, w1, w2] = data.weights;
  const composite = Math.round(v0 * w0 + v1 * w1 + v2 * w2);
  const compositeAnim = useCountUp(composite, progress > 0.72, 600);

  const allDone = progress >= 0.85;

  const stage = allDone
    ? progress < 0.92
      ? 1
      : progress < 0.97
        ? 2
        : 3
    : 0;

  const size = 96;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const gaugeOffset = C - (compositeAnim / 100) * C;
  const gaugeColor =
    compositeAnim >= 85
      ? "stroke-status-completed"
      : compositeAnim >= 70
        ? "stroke-status-retry"
        : "stroke-status-failed";

  return (
    <Frame label="Trust Evaluation">
      <div className="grid items-center gap-4 sm:grid-cols-[1fr_auto]">
        <div className="space-y-2">
          {metrics.map((m, i) => {
            const v = animated[i] ?? 0;
            const reveal = progress > 0.05 + i * 0.16;
            const tone = m.ok ? "text-status-completed" : "text-status-retry";
            const display =
              m.scopeLabel && v >= m.value - 1 ? m.scopeLabel : `${v}%`;
            return (
              <div
                key={m.label}
                className={`flex items-center justify-between gap-3 rounded-md border border-border bg-surface-muted/40 px-2.5 py-1.5 transition-opacity duration-500 ${
                  reveal ? "opacity-100" : "opacity-40"
                }`}
              >
                <span className="text-[11px] font-medium text-ink">{m.label}</span>
                <span className={`font-mono text-[13px] font-semibold ${tone}`}>
                  {display}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col items-center justify-center">
          <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="animate-graph-in -rotate-90">
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke="currentColor"
                strokeWidth={stroke}
                fill="none"
                className="text-surface-muted"
              />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                strokeWidth={stroke}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={gaugeOffset}
                className={`${gaugeColor} transition-all duration-700 ease-out`}
              />
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-[18px] font-semibold text-ink">
                {compositeAnim}
              </span>
              <span className="text-[8px] uppercase tracking-wider text-ink-soft">
                Trust
              </span>
            </div>
          </div>
          <span className="mt-1 text-[9px] uppercase tracking-wider text-ink-soft">
            Composite
          </span>
        </div>
      </div>

      {allDone && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[11px]">
          <span
            className={`flex items-center gap-1.5 transition-opacity duration-500 ${
              stage >= 1 ? "opacity-100" : "opacity-40"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full bg-primary ${
                stage === 1 ? "animate-soft-pulse" : ""
              }`}
            />
            <span className="text-ink-soft">Evaluating Trust</span>
          </span>
          <span className="text-ink-soft">↓</span>
          <span
            className={`transition-opacity duration-500 ${
              stage >= 2 ? "opacity-100" : "opacity-40"
            }`}
          >
            <span className="text-ink">Decision Generated</span>
          </span>
          <span className="text-ink-soft">↓</span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-semibold text-primary transition-all duration-500 ${
              stage >= 3 ? "opacity-100" : "opacity-40"
            }`}
            style={{
              background: "hsl(var(--primary) / 0.10)",
              boxShadow:
                stage >= 3
                  ? "0 0 18px hsl(var(--primary) / 0.35), inset 0 0 0 1px hsl(var(--primary) / 0.35)"
                  : "inset 0 0 0 1px hsl(var(--primary) / 0.20)",
            }}
          >
            <GitMerge className="h-3.5 w-3.5" />
            {data.decisionLabel}
          </span>
        </div>
      )}

      {done && (
        <div className="mt-2 text-[10px] text-ink-soft">
          {data.reviewNote}
        </div>
      )}
    </Frame>
  );
}

/* Evidence handoff — the previous agent's output becoming the next agent's input */
export function EvidenceHandoff({
  label,
  active,
  toLabel,
  live,
}: {
  label: string;
  active: boolean;
  toLabel?: string;
  live?: boolean;
}) {
  if (!active) return null;
  return (
    <div
      className="relative ml-[11px] flex flex-col items-center gap-1 py-1.5 motion-reduce:[&_*]:!animate-none"
      aria-hidden
    >
      {/* Vertical pipe with a flowing pulse when the next agent is live */}
      <div className="relative h-6 w-px overflow-hidden bg-border animate-handoff-line-grow">
        {live && (
          <span
            className="absolute left-1/2 top-0 h-2 w-px -translate-x-1/2 bg-primary/70 animate-handoff-flow"
          />
        )}
      </div>
      {/* From → To chip: previous output visually becoming next input */}
      <div className="animate-line-in flex items-center gap-1.5 rounded-full border border-border/70 bg-surface-muted/60 px-2 py-[2px] font-mono text-[9px] uppercase tracking-wider text-ink-soft/80">
        <ShieldCheck className="h-2.5 w-2.5 text-status-completed/70" />
        <span>{label}</span>
        {toLabel && (
          <>
            <span className="text-ink-soft/40">→</span>
            <span className="text-ink-soft/70">{toLabel}</span>
          </>
        )}
      </div>
      <div className="h-6 w-px bg-border animate-handoff-line-grow" />
    </div>
  );
}


