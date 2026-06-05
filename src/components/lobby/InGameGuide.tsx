'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Html } from '@react-three/drei';
import { SCENE_CENTER, INITIAL_CAMERA_YAW } from '@/lib/sceneConstants';
import { useGuideEnabled } from '@/lib/useGuideEnabled';
import GuideBubble from './GuideBubble';

type Vec3 = [number, number, number];

// Where each tip anchors. Vertical offsets are rotation-agnostic, so anchoring
// at `ownPos + (0, dy, 0)` lands beside the player's own buttons regardless of
// seat/camera. 'well' anchors to the absolute world position of The Well button.
type Anchor = 'above' | 'attack' | 'defend' | 'resources' | 'well';

type Step = {
  text: ReactNode;
  anchor: Anchor;
  marker: boolean; // draw a pulsing highlight ring at the anchor
};

// Inline styled tokens for the ATK / GOLD step.
const ATK = <strong style={{ color: '#2563eb' }}>⚔ ATK</strong>;
const GOLD = <strong style={{ color: '#d97706' }}>💰 GOLD</strong>;

const STEPS: Step[] = [
  { text: 'Welcome to World of Mythos! Be the last one standing!', anchor: 'above', marker: false },
  { text: 'This is your health. When it reaches 0 or lower, you are out.', anchor: 'resources', marker: true },
  { text: 'Each turn you must do one main action and one resource action.', anchor: 'above', marker: false },
  { text: 'The main actions are ATTACK, WELL or DEFEND.', anchor: 'attack', marker: true },
  { text: 'The resource actions are Gain 1 HP, Gain 1 Gold or upgrade ATK.', anchor: 'resources', marker: true },
  { text: 'How much damage you do to enemies is determined by your ATK.', anchor: 'resources', marker: true },
  { text: <>To upgrade your {ATK}, you need to spend your current {ATK} value in {GOLD}.</>, anchor: 'resources', marker: true },
  { text: 'Choosing DEFEND gives you a 50% chance to block all incoming attacks…', anchor: 'defend', marker: true },
  { text: '…and a 10% chance of REFLECTING the attack back to your attacker!', anchor: 'defend', marker: true },
  { text: 'The WELL is where you go to play the game of chance.', anchor: 'well', marker: true },
  { text: 'One player wins among all those who chose the WELL.', anchor: 'well', marker: true },
  { text: 'That player STARTS each round, shown with the crown, and gets a random prize.', anchor: 'well', marker: true },
  { text: 'The prize can be some gold, information and many more things.', anchor: 'well', marker: true },
  { text: 'You might get lucky and find the poisoned dagger.', anchor: 'well', marker: true },
  { text: 'Good luck!', anchor: 'above', marker: false },
];

// NOTE: per-step `anchor`/`marker` data is kept above for re-adding element
// highlights one at a time later. No highlight markers render for now.

// Every bubble card sits just to the left of the player. Screen-left in world
// space for a camera orbited by `yaw` about the scene centre is (-cos yaw, 0,
// sin yaw); we use INITIAL_CAMERA_YAW so the cards track the opened-up space.
const LEFT_DIST = 1.4; // how far left of the player the card floats
const CARD_LIFT = 0.4; // small upward nudge so it clears the player model
function cardPos(ownPosition: Vec3 | null): Vec3 {
  const base = ownPosition ?? SCENE_CENTER;
  const lx = -Math.cos(INITIAL_CAMERA_YAW);
  const lz = Math.sin(INITIAL_CAMERA_YAW);
  return [base[0] + lx * LEFT_DIST, base[1] + CARD_LIFT, base[2] + lz * LEFT_DIST];
}

type Props = {
  ownPosition: Vec3 | null;
  gameStarted: boolean;
};

export default function InGameGuide({ ownPosition, gameStarted }: Props) {
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

  if (!mounted || !enabled || !open || !gameStarted) return null;

  const current = STEPS[step];
  const card = cardPos(ownPosition);

  const handleClose = () => {
    setOpen(false);
    if (dontShowAgain) setEnabled(false);
  };

  return (
    <Html position={card} center distanceFactor={4.55} zIndexRange={[200, 200]}>
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
    </Html>
  );
}
