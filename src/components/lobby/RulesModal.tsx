'use client';

import { useState } from 'react';
import { GUIDE_STEPS } from '@/lib/guideSteps';
import GuideStepPreview from '@/components/rules/GuideStepPreview';

type RulesModalProps = {
  onClose: () => void;
};

/**
 * On-demand rules reference for the pre-game lobby -- same step copy as the
 * live in-round welcome tour (InGameGuide/GUIDE_STEPS), so this never drifts
 * out of date the way the old static /rules SVG pages did. Unlike the live
 * tour, there's no round in progress here for a step's highlighted buttons
 * to actually blink on, so GuideStepPreview renders the real button
 * art/resource cards statically instead (see its own comment).
 */
export default function RulesModal({ onClose }: RulesModalProps) {
  const [step, setStep] = useState(0);
  const isFirst = step === 0;
  const isLast = step === GUIDE_STEPS.length - 1;
  const current = GUIDE_STEPS[step];

  return (
    // drei's <Html> markers (CityMarker's Bossfight/Play Ranked labels) set
    // their own inline z-index in the tens of millions (zIndexRange's
    // default), which beats any ordinary Tailwind z-* class -- explicit
    // inline style set to the practical CSS max so this modal always wins
    // regardless of what any Html marker is doing.
    <div
      style={{ zIndex: 2147483647 }}
      className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-6 shadow-2xl relative w-80 max-w-[90vw] flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close rules"
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold cursor-pointer transition-colors"
        >
          ✕
        </button>

        <h3 className="text-xl font-bold mb-4 text-gray-800">Rules</h3>

        <p className="text-sm leading-snug text-center min-h-[3rem] flex items-center justify-center text-gray-800">
          {current.text}
        </p>

        <div className="mt-3 w-full flex justify-center">
          <GuideStepPreview step={current} />
        </div>

        <div className="flex items-center justify-between w-full mt-4">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={isFirst}
            aria-label="Previous"
            className="w-8 h-8 rounded-full text-lg font-bold flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-default text-gray-700 hover:bg-gray-100 cursor-pointer"
          >
            ‹
          </button>
          <span className="text-xs font-semibold text-gray-400 select-none">
            {step + 1} / {GUIDE_STEPS.length}
          </span>
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(GUIDE_STEPS.length - 1, s + 1))}
            disabled={isLast}
            aria-label="Next"
            className="w-8 h-8 rounded-full text-lg font-bold flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-default text-gray-700 hover:bg-gray-100 cursor-pointer"
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
}
