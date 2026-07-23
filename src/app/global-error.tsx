'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

// Only fires if an error escapes the root layout itself (ErrorBoundary
// covers everything inside it) -- Next.js requires this exact file to
// report those, since a normal error.tsx can't reach above the layout.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          background: '#0a0a0a',
          color: 'white',
          textAlign: 'center',
          padding: '2rem',
        }}
      >
        <p>Something went wrong.</p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '0.5rem 1.5rem',
            borderRadius: '0.5rem',
            border: '1px solid rgba(255,255,255,0.3)',
            background: 'transparent',
            color: 'white',
            cursor: 'pointer',
          }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
