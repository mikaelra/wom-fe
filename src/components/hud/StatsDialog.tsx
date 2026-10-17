'use client';

import { useEffect, type ReactNode } from 'react';

/** The stats page's pop-up frame (as SeasonHistoryOverlay's): a titled
 *  dialog over a dimmed page, closed by × or Escape. */
export default function StatsDialog({
  id,
  title,
  wide = false,
  onClose,
  children,
}: {
  id: string;
  title: string;
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-heading`}
        className={`bg-gray-900 border border-white/10 rounded-xl shadow-2xl ${wide ? 'max-w-2xl' : 'max-w-md'} w-full mx-4 p-6 relative text-white max-h-[80vh] flex flex-col`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 text-white/70 hover:text-white transition-colors text-2xl leading-none cursor-pointer"
        >
          ×
        </button>
        <h2 id={`${id}-heading`} className="text-lg font-semibold mb-4">
          {title}
        </h2>
        <div className="overflow-y-auto -mx-2 px-2">{children}</div>
      </div>
    </div>
  );
}
