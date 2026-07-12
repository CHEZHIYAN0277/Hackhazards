import { useEffect, useRef, useState } from "react";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Animate a numeric value from 0 → target once, on mount or when the
 * target changes. Respects `prefers-reduced-motion`.
 */
export function useCountUp(target: number, duration = 600): number {
  const [value, setValue] = useState(prefersReducedMotion() ? target : 0);
  const rafRef = useRef<number | null>(null);
  const targetRef = useRef(target);

  useEffect(() => {
    if (!Number.isFinite(target)) return;
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    targetRef.current = target;
    const from = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (target - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return value;
}
