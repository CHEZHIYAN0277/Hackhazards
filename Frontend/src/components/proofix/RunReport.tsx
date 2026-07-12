import { Download, Copy, GitPullRequest, ShieldCheck, FileCode } from "lucide-react";
import type { LiveAgent } from "./useExecutionRun";
import { StatusBadge } from "./StatusBadge";
import { StatusIcon } from "./StatusIcon";
import { ProgressRing } from "./ProgressRing";
import { AnimatedNumber } from "./AnimatedNumber";
import type { RunReportModel } from "@/mocks";

export function RunReport({
  done,
  agents,
  activeIndex,
  report,
}: {
  done: boolean;
  agents?: LiveAgent[];
  activeIndex?: number;
  report: RunReportModel;
}) {
  const decision = report.decision;
  const current =
    !done && agents && activeIndex !== undefined ? agents[activeIndex] : null;

  const copyJson = () => {
    const payload = {
      run: report.shortRunId,
      decision: report.decisionLabel,
      rootCause: report.rootCause.summary,
      trust: report.trust,
      files: report.files,
      proofBundle: report.proofBundle,
    };
    void navigator.clipboard?.writeText(JSON.stringify(payload, null, 2));
  };

  return (
    <aside className="hidden w-[380px] shrink-0 self-start sticky top-3 xl:block animate-panel-in-right">
      <div className="flex h-[calc(100vh-1.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_1px_0_hsl(var(--border)),0_20px_40px_-24px_rgba(0,0,0,0.35)]">

        <header className="border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft">
              Run Report
            </span>
            {current ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-status-running-bg px-2 py-0.5 text-[10px] font-medium text-status-running">
                <span className="h-1.5 w-1.5 rounded-full bg-status-running animate-soft-pulse" />
                Live
              </span>
            ) : (
              <span className="font-mono text-[11px] text-ink-soft">{report.shortRunId}</span>
            )}
          </div>
          <h3 className="mt-2.5 text-base font-semibold tracking-tight text-ink">
            {report.repository} · {report.branch}
          </h3>
          <p className="mt-1 text-sm text-ink-soft">
            {done ? "Execution complete · awaiting review" : "Execution in progress…"}
          </p>
        </header>

        {current ? (
          <LiveObserving agent={current} />
        ) : (
        <div className="flex-1 overflow-y-auto px-6 py-6 divide-y divide-border/70">
          {/* Final decision */}
          <Section title="Final Decision">
            <div className="rounded-xl border border-border bg-surface-muted/40 px-4 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <StatusBadge
                  status={decision === "merge" ? "completed" : decision}
                  label={report.decisionLabel}
                />
                <div className="text-right">
                  <div className="font-mono text-xl font-semibold leading-none tracking-tight text-ink tabular-nums">
                    <AnimatedNumber value={report.trustScore.toFixed(2)} duration={700} />
                  </div>
                  <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-soft">
                    Trust score
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-ink-soft">
                <span>Confidence below threshold</span>
                <span className="font-mono tabular-nums">
                  {report.trustScore.toFixed(2)} / {report.trustThreshold.toFixed(2)}
                </span>
              </div>
            </div>
          </Section>

          {/* Root cause */}
          <Section title="Root Cause">
            <p className="text-sm leading-relaxed text-ink">
              Missing expiry comparison branch in{" "}
              <span className="font-mono font-semibold text-primary">{report.rootCause.function}</span>{" "}
              at{" "}
              <span className="font-mono text-ink">
                {report.rootCause.location.split(":")[0]}
                <span className="text-ink-soft">:</span>
                <span className="font-semibold">{report.rootCause.location.split(":")[1]}</span>
              </span>
              . Expired tokens were treated as valid because{" "}
              <span className="font-mono text-ink">{report.rootCause.expression}</span> was never
              checked.
            </p>
          </Section>

          {/* Why this decision */}
          <Section title="Why this decision">
            <div className="space-y-2.5 text-sm leading-relaxed text-ink">
              <p>
                {report.rejection.attempts} patch candidates were rejected by mutation testing —{" "}
                {report.rejection.survivors} mutants survived, scoring{" "}
                {report.rejection.score.toFixed(2)} against a{" "}
                {report.rejection.threshold.toFixed(2)} threshold.
              </p>
              <p>
                The repair touches authentication logic, so ProoFix routed to a Draft PR for human
                review rather than auto-merging.
              </p>
            </div>
          </Section>

          {/* Evidence summary */}
          <Section title="Evidence Summary">
            <ul className="space-y-3">
              {report.evidence.map((e) => (
                <li key={e.text} className="flex items-start gap-2.5 text-sm text-ink">
                  <StatusIcon ok={e.ok} size="sm" className="mt-0.5" />
                  <span className="leading-relaxed">{e.text}</span>
                </li>
              ))}
            </ul>
          </Section>

          {/* Trust metrics */}
          <Section title="Trust Metrics">
            <div className="grid grid-cols-2 gap-x-2 gap-y-5 rounded-xl border border-border bg-surface-muted/50 p-4">
              {report.trust.map((b) => (
                <ProgressRing
                  key={b.label}
                  value={b.value}
                  label={b.label}
                  tone={b.tone}
                  size={76}
                />
              ))}
            </div>
          </Section>

          {/* Files affected */}
          <Section title="Files Affected">
            <div className="flex flex-wrap gap-2">
              {report.files.map((f) => (
                <span
                  key={f}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 font-mono text-xs text-ink transition-colors hover:border-primary/40 hover:bg-surface-muted/60"
                >
                  <FileCode className="h-3 w-3 text-ink-soft" />
                  {f}
                </span>
              ))}
            </div>
          </Section>

          {/* Proof bundle */}
          <Section title="Proof Bundle">
            <div className="flex items-center gap-2.5 rounded-lg border border-status-completed/25 bg-status-completed-bg/40 px-3 py-2.5">
              <ShieldCheck className="h-4 w-4 shrink-0 text-status-completed" />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-soft">
                  Signed artifact
                </div>
                <div className="mt-0.5 truncate font-mono text-xs text-ink">
                  {report.proofBundle}
                </div>
              </div>
            </div>
          </Section>

          <div className="pt-5 text-[11px] text-ink-soft">
            {report.agentCount} agents · {report.totalDurationSeconds.toFixed(1)}s execution
          </div>
        </div>
        )}



        {!current && (
        <footer className="border-t border-border bg-surface-muted/40 px-6 py-4 space-y-2.5">
          <div className="flex gap-2">
            <button
              type="button"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-ink transition-all duration-150 hover:border-primary/40 hover:bg-surface-muted/60 active:scale-[0.98]"
            >
              <Download className="h-3.5 w-3.5" /> Download
            </button>
            <button
              type="button"
              onClick={copyJson}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-ink transition-all duration-150 hover:border-primary/40 hover:bg-surface-muted/60 active:scale-[0.98]"
            >
              <Copy className="h-3.5 w-3.5" /> Copy JSON
            </button>
          </div>
          <button
            type="button"
            disabled={decision === "draft"}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-ink px-3 py-2.5 text-xs font-medium text-surface shadow-[0_1px_0_rgba(255,255,255,0.05)_inset,0_8px_20px_-10px_rgba(0,0,0,0.5)] transition-all duration-150 hover:-translate-y-[1px] hover:shadow-[0_1px_0_rgba(255,255,255,0.05)_inset,0_12px_24px_-10px_rgba(0,0,0,0.55)] active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
          >
            <GitPullRequest className="h-3.5 w-3.5" />
            {decision === "draft" ? "GitHub PR (Draft — review required)" : "Open GitHub PR"}
          </button>
        </footer>
        )}
      </div>
    </aside>
  );
}

function LiveObserving({ agent }: { agent: LiveAgent }) {
  const visible = agent.lines.slice(0, agent.visibleLines);
  const stillStreaming = agent.visibleLines < agent.lines.length;
  return (
    <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wider text-ink-soft">
          Currently observing
        </div>
        <h3 className="mt-1.5 text-lg font-semibold tracking-tight text-ink">
          {agent.agent}
        </h3>
        <p className="mt-0.5 text-sm text-ink-soft">{agent.purpose}</p>
      </div>

      <div className="rounded-xl border border-border bg-surface-muted/60 p-4">
        <ul className="space-y-2">
          {visible.map((line, i) => (
            <li
              key={i}
              className="animate-line-in flex items-start gap-2.5 text-sm text-ink"
            >
              <StatusIcon ok className="mt-0.5" />
              <span className="leading-relaxed">{line}</span>
            </li>
          ))}
          {stillStreaming && (
            <li className="flex items-start gap-2.5 text-sm text-ink-soft">
              <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 border-status-running animate-soft-pulse" />
              <span className="leading-relaxed italic">
                {visible.length === 0 ? "Waiting for first signal…" : "working…"}
              </span>
            </li>
          )}
        </ul>
      </div>

      {agent.metrics && (
        <div>
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-ink-soft">
            Live Metrics
          </div>
          <div className="grid grid-cols-2 gap-2">
            {agent.metrics.map((m) => (
              <div
                key={m.label}
                className="rounded-lg border border-border bg-surface px-2.5 py-2"
              >
                <div className="text-[10px] font-medium uppercase tracking-wider text-ink-soft">
                  {m.label}
                </div>
                <div className="mt-0.5 font-mono text-sm font-semibold text-ink">
                  {m.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs italic text-ink-soft">
        Waiting for completion — the final report appears once all agents finish.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-5 first:pt-0 last:pb-0">
      <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft">
        {title}
      </div>
      {children}
    </div>
  );
}
