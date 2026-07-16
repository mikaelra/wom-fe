'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface ToastEntry {
  id: number;
  message: string;
}

interface ToastContextValue {
  showError: (message: string) => void;
}

const TOAST_DURATION_MS = 6000;

// Falls back to a console warning when no <ToastProvider> is mounted (e.g.
// a component test rendered in isolation) instead of throwing -- the real
// app always has one at the root layout.
const noopToast: ToastContextValue = {
  showError: (message: string) => console.error('[toast] shown with no ToastProvider mounted:', message),
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

  const showError = useCallback(
    (message: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message }]);
      setTimeout(() => dismiss(id), TOAST_DURATION_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ showError }}>
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
              background: '#dc2626',
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
