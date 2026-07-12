import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

const STEPS = [
  "Connecting to GitHub…",
  "Cloning repository…",
  "Repository indexed…",
  "Initializing autonomous agents…",
  "Opening execution workspace…",
];

const STEP_MS = 700;

export function AnalyzingSequence({
  repo,
  onComplete,
}: {
  repo: string;
  onComplete: () => void;
}) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (step >= STEPS.length) {
      const t = setTimeout(onComplete, 250);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [step, onComplete]);

  const progress = Math.min(1, step / STEPS.length);

  return (
    <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center px-6">
      <div className="w-full max-w-lg animate-card-in rounded-2xl border border-border bg-surface/90 p-6 shadow-[0_8px_40px_-16px_rgba(0,0,0,0.25)] backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
              Analyzing
            </div>
            <div className="mt-1 truncate font-mono text-sm text-ink">{repo}</div>
          </div>
          <div className="font-mono text-[11px] tabular-nums text-ink-soft">
            {Math.round(progress * 100)}%
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 h-[3px] w-full overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full rounded-full bg-primary/80 transition-[width] duration-700 ease-out"
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        <ul className="mt-5 space-y-2.5">
          {STEPS.map((label, i) => {
            const state = i < step ? "done" : i === step ? "active" : "pending";
            return (
              <li
                key={label}
                className={`flex items-center gap-2.5 text-sm transition-all duration-500 ease-out ${
                  state === "pending"
                    ? "opacity-40"
                    : "opacity-100 translate-x-0"
                }`}
              >
                <span className="flex h-5 w-5 items-center justify-center">
                  {state === "done" ? (
                    <span className="inline-flex h-4 w-4 animate-line-in items-center justify-center rounded-full border-2 border-status-completed text-status-completed">
                      <Check className="h-2.5 w-2.5" strokeWidth={2} />
                    </span>
                  ) : state === "active" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-status-running" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-ink-soft/50" />
                  )}
                </span>
                <span
                  className={`transition-colors duration-300 ${
                    state === "pending" ? "text-ink-soft" : "text-ink"
                  }`}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
