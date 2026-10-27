'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { Icon, type IconName } from './icons';

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const KIND_ICON: Record<ToastKind, IconName> = {
  success: 'check',
  error: 'alert',
  info: 'message',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const durations = useRef(new Map<number, number>());
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    durations.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const schedule = useCallback(
    (id: number, duration: number) => {
      const existing = timers.current.get(id);
      if (existing !== undefined) {
        clearTimeout(existing);
      }
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      );
    },
    [dismiss],
  );

  const pause = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const resume = useCallback(
    (id: number) => {
      if (timers.current.has(id)) {
        return;
      }
      const duration = durations.current.get(id);
      if (duration !== undefined) {
        schedule(id, duration);
      }
    },
    [schedule],
  );

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current;
      nextId.current += 1;
      const duration = kind === 'error' ? 6000 : 4000;
      durations.current.set(id, duration);
      setItems((current) => [...current.slice(-3), { id, kind, message }]);
      schedule(id, duration);
    },
    [schedule],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) {
        clearTimeout(timer);
      }
      pending.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message),
      info: (message) => push('info', message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="toast-viewport"
        aria-live="polite"
        aria-atomic="false"
        aria-relevant="additions"
      >
        {items.map((item) => (
          <div
            className={`toast toast-${item.kind}`}
            key={item.id}
            role={item.kind === 'error' ? 'alert' : 'status'}
            onMouseEnter={() => pause(item.id)}
            onMouseLeave={() => resume(item.id)}
            onFocus={() => pause(item.id)}
            onBlur={(event) => {
              if (
                event.relatedTarget instanceof Node &&
                event.currentTarget.contains(event.relatedTarget)
              ) {
                return;
              }
              resume(item.id);
            }}
          >
            <span className="toast-icon">
              <Icon name={KIND_ICON[item.kind]} />
            </span>
            <span className="toast-message">{item.message}</span>
            <button
              className="toast-close"
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="关闭提示"
            >
              <Icon name="x" width={15} height={15} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (context === null) {
    throw new Error('useToast must be used inside ToastProvider');
  }
  return context;
}
