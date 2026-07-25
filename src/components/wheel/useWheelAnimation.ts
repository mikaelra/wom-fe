'use client';

import { useEffect, useRef, useState } from 'react';
import { boundaryIndexAt, spinDistance, pickTargetRotation, type Slice } from '@/lib/wheelGeometry';
import {
  FLAPPER_REST_BIAS,
  applyPegImpulse,
  cruiseOmega,
  settleOffset,
  stepFlapper,
  stoppingRotation,
  type FlapperState,
} from '@/lib/wheelPhysics';
import type { QualityTier } from '@/lib/deviceQuality';

const TWO_PI = Math.PI * 2;

function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

const SPIN_UP_MS = 450;
const SETTLE_MS = 500;
const EASE_P = 3.2;
// A nominal reference distance/duration, not the actual per-spin stopping
// distance -- see the comment above `commitTarget` for why cruise speed
// has to be fixed independent of exactly when the result lands. Matches
// §3.5.6's own worked example (D ≈ 1050°).
const D_REF = (1050 * Math.PI) / 180;
const T_NOMINAL = 4.8;
const NOMINAL_CRUISE_OMEGA = cruiseOmega(D_REF, T_NOMINAL, EASE_P);
// One constant speed throughout -- spin-up, cruise, and the stopping
// ease-out's t=0 velocity all use this, deliberately with no jump when
// Roll commits a target (tried a faster "snap up at Roll" speed, product
// feedback was that the jump itself was the problem). Scaled down three
// times per product feedback that it read as too fast (0.5x, then 0.33x
// on top, then a further 0.5x on top of that).
const CRUISE_OMEGA = NOMINAL_CRUISE_OMEGA * 0.5 * 0.33 * 0.5;
// At CRUISE_OMEGA's now-much-slower speed, the old value of 2.5 forced
// revolutions made the stopping ease-out take 30-60s (T = p*D/omega scales
// linearly with forced distance, and omega dropped a lot) -- product
// feedback was that this was way too long. The idle cruise already runs
// for however long the player takes to press Roll, so the stop itself
// doesn't need extra forced revolutions to sell "this has been spinning";
// it can just be the tail end of that motion. A small floor (not exactly
// 0) avoids the rare near-instant stop when the remaining angle happens to
// be tiny. Lands the stop at ~8-11s on average instead of 30-60s.
const MIN_LANDING_REVOLUTIONS = 0.05;
// Below this many slice-widths of travel in a frame, temporal supersampling
// buys nothing (§3.5.9) -- everything is basically stationary already.
const BLUR_THRESHOLD_SLICES_PER_FRAME = 0.35;

export type AnimationPhase = 'spin-up' | 'cruise' | 'stopping' | 'settle' | 'result';

export type WheelAnimationState = {
  phase: AnimationPhase;
  /** Radians, unbounded (wraps only when read for rendering/boundary lookups). */
  rotation: number;
  /** Radians moved since the previous emitted frame -- feeds motion-blur spread. */
  rotationDelta: number;
  blurSteps: 1 | 2 | 4;
  /** Radians, the flapper's current deflection from vertical. */
  flapperTheta: number;
  /** Index into the `slices` array of the exact slice landed on, once known
   * -- only that one slice highlights, not every slice of its color. */
  landedIndex: number | null;
};

type Args = {
  slices: Slice[];
  resultSkin: string | null;
  reducedMotion: boolean;
  qualityTier: QualityTier;
  /** False while the wheel isn't actually being rendered (canvas-unavailable
   * fallback, §3.5.10) -- there's nothing to animate for, so the rAF loop
   * doesn't run at all rather than spinning in the background. */
  active?: boolean;
};

export function useWheelAnimation({
  slices,
  resultSkin,
  reducedMotion,
  qualityTier,
  active = true,
}: Args): WheelAnimationState {
  const [state, setState] = useState<WheelAnimationState>({
    phase: 'spin-up',
    rotation: 0,
    rotationDelta: 0,
    blurSteps: 1,
    flapperTheta: 0,
    landedIndex: null,
  });

  // Mutable per-frame state lives in refs, not React state -- state updates
  // happen once per emitted frame (batched via the single setState below),
  // not scattered across the physics computation.
  const rotationRef = useRef(0);
  const omegaRef = useRef(0);
  const flapperRef = useRef<FlapperState>({ theta: 0, omega: 0 });
  const phaseRef = useRef<AnimationPhase>('spin-up');
  const phaseStartRef = useRef(0);
  const lastBoundaryRef = useRef<number | null>(null);
  const targetRef = useRef<{ rotation: number; sliceIndex: number } | null>(null); // once resultSkin known
  const finalRotationRef = useRef<number | null>(null); // absolute (unbounded) landing rotation
  const stopEffDurationRef = useRef(T_NOMINAL);
  const stopStartTimeRef = useRef(0);
  const stopStartRotationRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const slicesRef = useRef(slices);
  slicesRef.current = slices;
  const resultSkinRef = useRef(resultSkin);
  resultSkinRef.current = resultSkin;

  // Reduced motion: no animation, just resolve straight to the resting
  // frame the moment the result is known. A separate effect (rather than a
  // branch inside the main one) so it correctly reacts to `resultSkin`
  // arriving after mount -- the main effect below is deliberately
  // mount-once and can't depend on it.
  useEffect(() => {
    if (!active || !reducedMotion || slices.length === 0 || !resultSkin) return;
    const target = pickTargetRotation(slices, resultSkin, Math.random);
    setState({
      phase: 'result',
      rotation: target.rotation,
      rotationDelta: 0,
      blurSteps: 1,
      flapperTheta: FLAPPER_REST_BIAS,
      landedIndex: target.sliceIndex,
    });
  }, [active, reducedMotion, slices, resultSkin]);

  useEffect(() => {
    if (!active || reducedMotion || slices.length === 0) return;

    let cancelled = false;

    const commitTarget = () => {
      // The wheel cruises cosmetically (no target, no server call) from the
      // moment the modal opens -- there's nothing to commit to until the
      // player presses Roll and spinWheel() resolves with a result. Cruise
      // speed can't wait for that to know the true stopping distance, so it
      // runs at a fixed speed (CRUISE_OMEGA) throughout, same before and
      // after Roll -- no discontinuity. Once the target slice is known, the
      // *duration* of the ease-out is solved backwards from CRUISE_OMEGA and
      // the actual distance-to-target, so the ease-out's t=0 velocity always
      // equals whatever the wheel is already doing.
      const skin = resultSkinRef.current;
      if (!skin || targetRef.current !== null) return;
      targetRef.current = pickTargetRotation(slicesRef.current, skin, Math.random);
    };

    const beginStopping = (now: number) => {
      const target = targetRef.current?.rotation ?? null;
      if (target === null) return; // not committed yet, or still waiting on the server
      const D = spinDistance(rotationRef.current, target, MIN_LANDING_REVOLUTIONS);
      const finalRotation = rotationRef.current + D;
      finalRotationRef.current = finalRotation;
      stopStartRotationRef.current = rotationRef.current;
      stopStartTimeRef.current = now;
      stopEffDurationRef.current = (EASE_P * D) / CRUISE_OMEGA;
      phaseRef.current = 'stopping';
      phaseStartRef.current = now;
    };

    const tick = (now: number) => {
      if (cancelled) return;
      const last = lastFrameTimeRef.current ?? now;
      // Cap dt so a backgrounded-tab gap (resumed via visibilitychange)
      // doesn't produce one huge simulation step.
      const dt = Math.min((now - last) / 1000, 1 / 30);
      lastFrameTimeRef.current = now;

      const phase = phaseRef.current;
      const elapsedInPhase = now - phaseStartRef.current;

      if (phase === 'spin-up') {
        const t = Math.min(1, elapsedInPhase / SPIN_UP_MS);
        omegaRef.current = CRUISE_OMEGA * t * t; // ease-in
        rotationRef.current += omegaRef.current * dt;
        if (elapsedInPhase >= SPIN_UP_MS) {
          phaseRef.current = 'cruise';
          phaseStartRef.current = now;
          omegaRef.current = CRUISE_OMEGA;
        }
      } else if (phase === 'cruise') {
        commitTarget();
        rotationRef.current += CRUISE_OMEGA * dt;
        // Lands automatically the instant a target is committed -- no
        // separate "stop" action, Roll (which triggers the spinWheel()
        // call upstream) is the only step the player takes.
        if (targetRef.current !== null) beginStopping(now);
      } else if (phase === 'stopping') {
        const t = now - stopStartTimeRef.current;
        const T = stopEffDurationRef.current;
        const prevRotation = rotationRef.current;
        rotationRef.current = stoppingRotation(
          t / 1000,
          finalRotationRef.current as number,
          finalRotationRef.current! - stopStartRotationRef.current,
          T,
          EASE_P,
        );
        omegaRef.current = dt > 0 ? (rotationRef.current - prevRotation) / dt : 0;
        if (t / 1000 >= T) {
          phaseRef.current = 'settle';
          phaseStartRef.current = now;
          omegaRef.current = 0;
        }
      } else if (phase === 'settle') {
        rotationRef.current = (finalRotationRef.current as number) + settleOffset(elapsedInPhase, undefined, SETTLE_MS);
        omegaRef.current = 0;
        if (elapsedInPhase >= SETTLE_MS) {
          phaseRef.current = 'result';
          phaseStartRef.current = now;
          rotationRef.current = finalRotationRef.current as number;
        }
      }
      // 'result': rotation stays fixed; nothing to integrate.

      // Peg-crossing detection drives the flapper regardless of phase, so
      // it keeps ticking through spin-up/cruise/stopping and settles
      // naturally as omega drops toward zero.
      const restTheta = phaseRef.current === 'settle' || phaseRef.current === 'result' ? FLAPPER_REST_BIAS : 0;
      if (slicesRef.current.length > 0) {
        const boundary = boundaryIndexAt(slicesRef.current, mod(rotationRef.current, TWO_PI));
        if (lastBoundaryRef.current !== null && boundary !== lastBoundaryRef.current) {
          const n = slicesRef.current.length;
          const raw = Math.abs(boundary - lastBoundaryRef.current);
          const crossed = Math.min(raw, n - raw);
          flapperRef.current = applyPegImpulse(flapperRef.current, omegaRef.current, crossed);
        }
        lastBoundaryRef.current = boundary;
      }
      flapperRef.current = stepFlapper(flapperRef.current, dt, restTheta);

      const prevRotationForDelta = rotationRef.current - omegaRef.current * dt;
      setState({
        phase: phaseRef.current,
        rotation: rotationRef.current,
        rotationDelta: rotationRef.current - prevRotationForDelta,
        blurSteps: computeBlurSteps(qualityTier, omegaRef.current * dt),
        flapperTheta: flapperRef.current.theta,
        landedIndex: targetRef.current?.sliceIndex ?? null,
      });

      if (phaseRef.current !== 'result') {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    const start = () => {
      lastFrameTimeRef.current = null;
      rafRef.current = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    const onVisibilityChange = () => {
      if (document.hidden) stop();
      else if (phaseRef.current !== 'result') start();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    start();

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
    // slices/resultSkin/reducedMotion/qualityTier changing mid-spin would
    // restart the whole animation from scratch, which never happens in
    // practice (the modal remounts per wheel via its wheelId key) -- this
    // effect is deliberately mount-once (modulo `active` toggling it on/off).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slices.length, reducedMotion, active]);

  return state;
}

function computeBlurSteps(qualityTier: QualityTier, rotationThisFrame: number): 1 | 2 | 4 {
  // Slice widths vary, but this is a coarse "are we basically stopped"
  // gate, not a precision measurement -- 1 slice-width ~= 2π/200 rad is a
  // reasonable stand-in regardless of the wheel's actual current N.
  const approxSliceAngle = TWO_PI / 200;
  const slicesThisFrame = Math.abs(rotationThisFrame) / approxSliceAngle;
  if (slicesThisFrame < BLUR_THRESHOLD_SLICES_PER_FRAME) return 1;
  return qualityTier === 'high' ? 4 : 2;
}
