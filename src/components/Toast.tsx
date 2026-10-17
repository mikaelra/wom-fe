'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type ToastVariant = 'error' | 'success';

interface ToastEntry {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
}

const TOAST_DURATION_MS = 6000;

const TOAST_COLORS: Record<ToastVariant, string> = {
  error: '#dc2626',
  success: '#16a34a',
};

// Falls back to a console warning when no <ToastProvider> is mounted (e.g.
// a component test rendered in isolation) instead of throwing -- the real
// app always has one at the root layout.
const noopToast: ToastContextValue = {
  showError: (message: string) => console.error('[toast] shown with no ToastProvider mounted:', message),
  showSuccess: (message: string) => console.error('[toast] shown with no ToastProvider mounted:', message),
};

const ToastContext = createContext<ToastContextValue>(noopToast);

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, variant: ToastVariant) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, variant }]);
      setTimeout(() => dismiss(id), TOAST_DURATION_MS);
    },
    [dismiss],
  );

  const showError = useCallback((message: string) => show(message, 'error'), [show]);
  const showSuccess = useCallback((message: string) => show(message, 'success'), [show]);

  // Stable across renders -- `show`/`dismiss` never change, so this object
  // is built once. A fresh `{ showError, showSuccess }` every render made
  // every `useToast()` consumer see a new value on each toast, and any
  // effect with `toast` in its deps (e.g. the market page's profile load)
  // would re-fire -- one failing request then loops as fast as the network
  // allows, spraying identical error toasts.
  const value = useMemo(() => ({ showError, showSuccess }), [showError, showSuccess]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        style={{
          position: 'fixed',
          bottom: '1rem',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          zIndex: 9999,
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            style={{
              background: TOAST_COLORS[t.variant],
              color: 'white',
              padding: '0.75rem 1rem',
              borderRadius: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              maxWidth: '90vw',
            }}
          >
            <span>{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
