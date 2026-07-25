import { describe, expect, it } from 'vitest';
import {
  FLAPPER_MAX_THETA,
  applyPegImpulse,
  cruiseOmega,
  settleOffset,
  stepFlapper,
  stoppingRotation,
  type FlapperState,
} from '@/lib/wheelPhysics';

describe('stepFlapper', () => {
  it('stays at rest with no forcing', () => {
    const state: FlapperState = { theta: 0, omega: 0 };
    const next = stepFlapper(state, 1 / 60);
    expect(next.theta).toBe(0);
    expect(next.omega).toBe(0);
  });

  it('is a damped oscillator: displaced with no velocity, it overshoots zero then decays', () => {
    let state: FlapperState = { theta: degToRadTest(20), omega: 0 };
    const dt = 1 / 240; // fine step for a stable, accurate integration
    let crossedZero = false;
    let sawOppositeSign = false;
    for (let i = 0; i < 240 * 3; i++) {
      state = stepFlapper(state, dt);
      if (state.theta < 0) {
        crossedZero = true;
        sawOppositeSign = true;
      }
    }
    expect(crossedZero).toBe(true);
    expect(sawOppositeSign).toBe(true);
    // Underdamped but still dissipative -- after 3s it should have settled
    // close to rest, not be sustaining full-amplitude oscillation.
    expect(Math.abs(state.theta)).toBeLessThan(degToRadTest(1));
  });

  it('respects the hard clamp on |theta|', () => {
    let state: FlapperState = { theta: 0, omega: 1000 };
    for (let i = 0; i < 100; i++) {
      state = stepFlapper(state, 1 / 60);
    }
    expect(Math.abs(state.theta)).toBeLessThanOrEqual(FLAPPER_MAX_THETA + 1e-9);
  });

  it('settles toward a nonzero restTheta rather than zero', () => {
    let state: FlapperState = { theta: 0, omega: 0.001 };
    const rest = degToRadTest(6);
    for (let i = 0; i < 240 * 5; i++) {
      state = stepFlapper(state, 1 / 240, rest);
    }
    expect(state.theta).toBeCloseTo(rest, 3);
    expect(Math.abs(state.omega)).toBeLessThan(0.05);
  });
});

describe('applyPegImpulse', () => {
  it('increases |omega| in the direction of wheel travel', () => {
    const state: FlapperState = { theta: 0, omega: 0 };
    const next = applyPegImpulse(state, 10, 1);
    expect(next.omega).toBeGreaterThan(0);

    const nextNeg = applyPegImpulse(state, -10, 1);
    expect(nextNeg.omega).toBeLessThan(0);
  });

  it('is a no-op when nothing was crossed', () => {
    const state: FlapperState = { theta: 0.1, omega: 0.2 };
    expect(applyPegImpulse(state, 10, 0)).toEqual(state);
  });

  it('scales with (but stays clamped for) boundaries crossed', () => {
    const state: FlapperState = { theta: 0, omega: 0 };
    const one = applyPegImpulse(state, 5, 1);
    const many = applyPegImpulse(state, 5, 50);
    expect(many.omega).toBeGreaterThanOrEqual(one.omega);
    // Clamped: doesn't blow up even for a huge crossing count.
    expect(many.omega).toBeLessThan(1000);
  });

  it('does not itself violate the theta clamp on the following step', () => {
    let state: FlapperState = { theta: 0, omega: 0 };
    for (let i = 0; i < 50; i++) {
      state = applyPegImpulse(state, 20, 3);
      state = stepFlapper(state, 1 / 60);
    }
    expect(Math.abs(state.theta)).toBeLessThanOrEqual(FLAPPER_MAX_THETA + 1e-9);
  });
});

describe('cruiseOmega / stoppingRotation continuity', () => {
  it('stoppingRotation starts at thetaEnd - D and ends at thetaEnd', () => {
    const thetaEnd = 12.5;
    const D = 20;
    expect(stoppingRotation(0, thetaEnd, D)).toBeCloseTo(thetaEnd - D, 9);
    expect(stoppingRotation(4.8, thetaEnd, D)).toBeCloseTo(thetaEnd, 9);
  });

  it('the ease-out\'s velocity at t=0 matches cruiseOmega (no jolt at STOP ROLL)', () => {
    const thetaEnd = 0;
    const D = 20;
    const T = 4.8;
    const p = 3.2;
    const dt = 1e-5;
    const numericVelocity =
      (stoppingRotation(dt, thetaEnd, D, T, p) - stoppingRotation(0, thetaEnd, D, T, p)) / dt;
    expect(numericVelocity).toBeCloseTo(cruiseOmega(D, T, p), 1);
  });

  it('clamps t outside [0, T]', () => {
    const thetaEnd = 5;
    const D = 10;
    expect(stoppingRotation(-1, thetaEnd, D)).toBeCloseTo(stoppingRotation(0, thetaEnd, D), 9);
    expect(stoppingRotation(100, thetaEnd, D)).toBeCloseTo(thetaEnd, 9);
  });
});

describe('settleOffset', () => {
  it('starts at full amplitude and decays to zero by durationMs', () => {
    const amplitude = degToRadTest(1.2);
    expect(settleOffset(0, amplitude, 500)).toBeCloseTo(amplitude, 9);
    expect(settleOffset(500, amplitude, 500)).toBeCloseTo(0, 9);
    expect(settleOffset(600, amplitude, 500)).toBe(0);
  });

  it('oscillates (crosses zero) before settling', () => {
    const amplitude = degToRadTest(1.2);
    const samples = Array.from({ length: 50 }, (_, i) => settleOffset((i / 49) * 500, amplitude, 500));
    const hasPositive = samples.some((v) => v > 0.001);
    const hasNegative = samples.some((v) => v < -0.001);
    expect(hasPositive).toBe(true);
    expect(hasNegative).toBe(true);
  });
});

function degToRadTest(deg: number): number {
  return (deg * Math.PI) / 180;
}
