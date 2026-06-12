'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useGuideEnabled } from '@/lib/useGuideEnabled';
import type { GuideHighlights } from '@/lib/guideHighlights';
import GuideBubble from './GuideBubble';

type Step = {
  text: ReactNode;
  highlights: GuideHighlights;
};

const STEPS: Step[] = [
  { text: 'Welcome to World of Mythos! Be the last one standing!', highlights: {} },
  { text: 'This is your health. When it reaches 0 or lower, you are out.', highlights: { hp: 'blue' } },
  { text: 'Each turn you must do one main action and one resource action.', highlights: {} },
  { text: 'The main actions are ATTACK, WELL or DEFEND.', highlights: { attack: 'blue', well: 'blue', defend: 'blue' } },
  { text: 'The resource actions are Gain 1 HP, Gain 1 Gold or upgrade ATK.', highlights: { hp: 'blue', coins: 'blue', atk: 'blue' } },
  { text: 'How much damage you do to enemies is determined by your ATK.', highlights: { atk: 'blue' } },
  { text: 'To upgrade your ATK, you need to spend your current ATK value in GOLD.', highlights: { coins: 'gold', atk: 'blue' } },
  { text: 'Choosing DEFEND gives you a 50% chance to block all incoming attacks…', highlights: { defend: 'blue' } },
  { text: '…and a 10% chance of REFLECTING the attack back to your attacker!', highlights: { defend: 'blue' } },
  { text: 'The WELL is where you go to play the game of chance.', highlights: { well: 'blue' } },
  { text: 'One player wins among all those who chose the WELL.', highlights: { well: 'blue' } },
  { text: 'That player STARTS each round, shown with the crown, and gets a random prize.', highlights: { well: 'blue' } },
  { text: 'The prize can be some gold, information and many more things.', highlights: { well: 'blue' } },
  { text: 'You might get lucky and find the poisoned dagger.', highlights: { well: 'blue' } },
  { text: 'Good luck!', highlights: {} },
];

type Props = {
  gameStarted: boolean;
  onHighlightChange?: (highlights: GuideHighlights) => void;
};

export default function InGameGuide({ gameStarted, onHighlightChange }: Props) {
  const { enabled, setEnabled, mounted } = useGuideEnabled();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);
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

  // Tell LobbyScene which real buttons to blink for the current slide.
  const visible = mounted && enabled && open && gameStarted;
  useEffect(() => {
    onHighlightChange?.(visible ? STEPS[step].highlights : {});
  }, [visible, step, onHighlightChange]);
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
