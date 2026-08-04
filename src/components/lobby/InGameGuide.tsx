'use client';

import { useEffect, useRef, useState } from 'react';
import { useGuideEnabled } from '@/lib/useGuideEnabled';
import type { GuideHighlights } from '@/lib/guideHighlights';
import { GUIDE_STEPS as STEPS } from '@/lib/guideSteps';
import GuideBubble from './GuideBubble';

type Props = {
  gameStarted: boolean;
  onHighlightChange?: (highlights: GuideHighlights) => void;
};

export default function InGameGuide({ gameStarted, onHighlightChange }: Props) {
  const { enabled, setEnabled, mounted } = useGuideEnabled();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  // Toggles every blink on slides that alternate two button groups.
  const [altPhase, setAltPhase] = useState(false);
  const shownThisGameRef = useRef(false);

  // Auto-open once per game while enabled; re-arm for the next game.
  useEffect(() => {
    if (!gameStarted) {
      shownThisGameRef.current = false;
      return;
    }
    if (enabled && !shownThisGameRef.current) {
      shownThisGameRef.current = true;
      setStep(0);
      setDontShowAgain(false);
      setOpen(true);
    }
  }, [gameStarted, enabled]);

  // The final slide auto-ticks "don't show again" (the player may untick it).
  useEffect(() => {
    if (step === STEPS.length - 1) setDontShowAgain(true);
  }, [step]);

  // On slides that alternate two button groups, flip phase in step with the
  // 0.8s blink so the groups flash every other. Reset to the first group on
  // every slide change.
  const visible = mounted && enabled && open && gameStarted;
  useEffect(() => {
    setAltPhase(false);
    if (!visible || !STEPS[step].altHighlights) return;
    const id = setInterval(() => setAltPhase((p) => !p), 800);
    return () => clearInterval(id);
  }, [visible, step]);

  // Tell LobbyScene which real buttons to blink for the current slide.
  useEffect(() => {
    const cur = STEPS[step];
    const eff = altPhase && cur.altHighlights ? cur.altHighlights : cur.highlights;
    onHighlightChange?.(visible ? eff : {});
  }, [visible, step, altPhase, onHighlightChange]);
  // Clear highlights when the guide unmounts.
  useEffect(() => () => onHighlightChange?.({}), [onHighlightChange]);

  if (!visible) return null;

  const current = STEPS[step];

  const handleClose = () => {
    setOpen(false);
    if (dontShowAgain) setEnabled(false);
  };

  // Screen-fixed overlay card. It lives in the same UI layer as the round
  // messages (top) and resource cards (bottom), floating just above the
  // resource cards and nudged a little to the left. `max-w-[90vw]` plus the
  // clamped left offset keep the whole card inside a narrow phone viewport.
  return (
    <div className="absolute inset-0 pointer-events-none z-30">
      <div
        className="absolute pointer-events-none"
        style={{ bottom: '7rem', left: 'max(0.75rem, calc(50% - 11rem))' }}
      >
        <GuideBubble
          text={current.text}
          stepIndex={step}
          totalSteps={STEPS.length}
          isLast={step === STEPS.length - 1}
          dontShowAgain={dontShowAgain}
          onPrev={() => setStep((s) => Math.max(0, s - 1))}
          onNext={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
          onRestart={() => setStep(0)}
          onClose={handleClose}
          onToggleDontShow={setDontShowAgain}
        />
      </div>
    </div>
  );
}
