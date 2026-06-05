'use client';

import { useEffect, useState, type ReactNode } from 'react';

export type GuideBubbleProps = {
  text: ReactNode;
  stepIndex: number;
  totalSteps: number;
  isLast: boolean;
  dontShowAgain: boolean;
  onPrev: () => void;
  onNext: () => void;
  onRestart: () => void;
  onClose: () => void;
  onToggleDontShow: (value: boolean) => void;
};

/**
 * Presentational welcome-tour card. Designed to be rendered inside a drei
 * <Html> node so it floats in 3D space beside the element it describes.
 * Only the card itself is interactive; pointer events are stopped so taps on
 * the bubble never reach the canvas camera-pan handler.
 */
export default function GuideBubble({
  text,
  stepIndex,
  totalSteps,
  isLast,
  dontShowAgain,
  onPrev,
  onNext,
  onRestart,
  onClose,
  onToggleDontShow,
}: GuideBubbleProps) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const isFirst = stepIndex === 0;

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{ pointerEvents: 'auto' }}
      className={`relative w-64 max-w-[80vw] rounded-2xl border-2 border-gray-300 bg-white text-gray-800 shadow-2xl px-4 pt-3 pb-3 font-sans transition-all duration-300 ${
        visible ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
      }`}
    >
      {/* Close badge — floats just outside the top-right corner */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close guide"
        className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-gray-800 text-white text-sm font-bold flex items-center justify-center shadow-lg border-2 border-white hover:bg-gray-700 cursor-pointer"
      >
        ✕
      </button>

      {/* Top navigation row */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={isFirst}
          aria-label="Previous tip"
          className="w-7 h-7 rounded-full text-lg font-bold flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-default text-gray-700 hover:bg-gray-100 cursor-pointer"
        >
          ‹
        </button>
        <span className="text-xs font-semibold text-gray-400 select-none">
          {stepIndex + 1} / {totalSteps}
        </span>
        {isLast ? (
          <button
            type="button"
            onClick={onRestart}
            className="text-xs font-bold text-amber-600 hover:text-amber-500 px-2 py-1 cursor-pointer"
          >
            ↺ Start over
          </button>
        ) : (
          <button
            type="button"
            onClick={onNext}
            aria-label="Next tip"
            className="w-7 h-7 rounded-full text-lg font-bold flex items-center justify-center text-gray-700 hover:bg-gray-100 cursor-pointer"
          >
            ›
          </button>
        )}
      </div>

      {/* Body */}
      <div className="text-sm leading-snug text-center min-h-[3.5rem] flex items-center justify-center">
        {text}
      </div>

      {/* Persistent "don't show again" checkbox — visible on every slide */}
      <label className="mt-3 flex items-center gap-2 cursor-pointer select-none border-t border-gray-200 pt-2">
        <input
          type="checkbox"
          checked={dontShowAgain}
          onChange={(e) => onToggleDontShow(e.target.checked)}
          className="w-4 h-4 accent-amber-500 cursor-pointer"
        />
        <span className="text-xs text-gray-500">Do not show me this again</span>
      </label>
    </div>
  );
}
