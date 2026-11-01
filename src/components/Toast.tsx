import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';

interface ToastItem {
  id: number;
  message: string;
  undo?: () => void;
}

interface ToastApi {
  /** Shows a message for a few seconds. With `undo`, it gets an Undo button and stays a little longer. */
  show: (message: string, undo?: () => void) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<ToastItem | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);
  const reduce = useReducedMotion();

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setItem(null);
  }, []);

  const show = useCallback((message: string, undo?: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    counter.current += 1;
    setItem({ id: counter.current, message, undo });
    timer.current = setTimeout(() => setItem(null), undo ? 6500 : 3200);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const api = useMemo<ToastApi>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-6"
        role="status"
        aria-live="polite"
        data-testid="toast-region"
      >
        <AnimatePresence mode="popLayout">
          {item && (
            <motion.div
              key={item.id}
              layout
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 520, damping: 38 }}
              className="pointer-events-auto flex max-w-md items-center gap-3 rounded-md border border-line bg-fg px-3.5 py-2.5 text-sm text-canvas shadow-overlay"
              data-testid="toast"
            >
              <Check size={16} aria-hidden className="shrink-0 text-success-on-fg" />
              <span>{item.message}</span>
              {item.undo && (
                <button
                  type="button"
                  className="ml-1 rounded-sm px-1.5 py-0.5 font-semibold text-accent-on-fg underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-on-fg"
                  onClick={() => { item.undo?.(); dismiss(); }}
                  data-testid="toast-undo"
                >
                  Undo
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
