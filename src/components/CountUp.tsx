import { useEffect, useRef } from 'react';
import { animate, useReducedMotion } from 'framer-motion';

interface CountUpProps {
  value: number;
  /** Turns the in-between numbers into text. */
  format: (n: number) => string;
  className?: string;
  testId?: string;
}

/**
 * A number that glides from its last value to the new one. Screen readers and tests get the final text
 * straight away from a hidden copy; the animated copy is decoration.
 */
export function CountUp({ value, format, className, testId }: CountUpProps) {
  const shown = useRef<HTMLSpanElement>(null);
  const last = useRef(0);
  const fmt = useRef(format);
  fmt.current = format;
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = shown.current;
    if (!el) return;
    const write = (n: number): void => { el.textContent = fmt.current(n); };
    if (reduce) {
      write(value);
      last.current = value;
      return;
    }
    const controls = animate(last.current, value, {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: n => { last.current = n; write(n); }
    });
    return () => controls.stop();
  }, [value, reduce]);

  return (
    <span className={className} data-testid={testId}>
      <span className="sr-only">{format(value)}</span>
      <span ref={shown} aria-hidden="true">{format(value)}</span>
    </span>
  );
}
