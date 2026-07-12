import { useEffect, useState } from "react";

type Tone = "ok" | "warn" | "bad" | "primary";

interface Props {
  value: number; // 0-100
  label: string;
  size?: number;
  tone?: Tone;
  animate?: boolean;
}

const toneClass: Record<Tone, { text: string; stroke: string }> = {
  ok: { text: "text-status-completed", stroke: "stroke-status-completed" },
  warn: { text: "text-status-retry", stroke: "stroke-status-retry" },
  bad: { text: "text-status-failed", stroke: "stroke-status-failed" },
  primary: { text: "text-primary", stroke: "stroke-primary" },
};

export function ProgressRing({
  value,
  label,
  size = 72,
  tone = "primary",
  animate = true,
}: Props) {
  const [v, setV] = useState(animate ? 0 : value);
  useEffect(() => {
    if (!animate) {
      setV(value);
      return;
    }
    const t = window.setTimeout(() => setV(value), 60);
    return () => window.clearTimeout(t);
  }, [value, animate]);

  const stroke = 6;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const offset = C - (Math.max(0, Math.min(100, v)) / 100) * C;
  const c = toneClass[tone];

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            className="stroke-border"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={offset}
            className={`${c.stroke} transition-[stroke-dashoffset] duration-[900ms] ease-out`}
          />
        </svg>
        <span
          className={`absolute inset-0 flex items-center justify-center font-mono text-[13px] font-semibold ${c.text}`}
        >
          {Math.round(v)}%
        </span>
      </div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-ink-soft">
        {label}
      </div>
    </div>
  );
}
