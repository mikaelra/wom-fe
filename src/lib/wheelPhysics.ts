// Pure physics for the Wheel (docs/MONETIZATION_PLAN.md §3.5.5/§3.5.6). No
// DOM, no rAF -- `stepFlapper` is a single integration step the caller
// drives from its own animation loop, so the spring itself stays testable
// without mocking time.

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export type FlapperState = { theta: number; omega: number };

// θ̈ = −k·θ − c·θ̇, k ≈ 900, c ≈ 26 -- natural frequency sqrt(k)/(2π) ≈ 4.8Hz,
// slightly under-damped (§3.5.5). Radians throughout: this k only produces
// 4.8Hz if theta is in radians.
export const FLAPPER_K = 900;
export const FLAPPER_C = 26;
export const FLAPPER_MAX_THETA = degToRad(34);
// The flapper rests leaning on the trailing peg rather than dead centre
// (§3.5.5) -- pass this as `restTheta` once the wheel has stopped.
export const FLAPPER_REST_BIAS = degToRad(6);

// Semi-implicit (symplectic) Euler: unconditionally stable for a damped
// spring at animation-frame timesteps, unlike explicit Euler.
export function stepFlapper(state: FlapperState, dt: number, restTheta = 0): FlapperState {
  const displacement = state.theta - restTheta;
  const angularAccel = -FLAPPER_K * displacement - FLAPPER_C * state.omega;
  const omega = state.omega + angularAccel * dt;
  const theta = clamp(state.theta + omega * dt, -FLAPPER_MAX_THETA, FLAPPER_MAX_THETA);
  return { theta, omega };
}

// Tuned by feel, not derived -- the spec (§3.5.5) leaves these as free
// constants. At cruise, impulses arrive far faster than the spring can
// settle between them (crossing rate is hundreds/sec against a ~208ms
// natural period), so the exact magnitude mostly sets how hard the chatter
// looks; IMPULSE_MAX plus FLAPPER_MAX_THETA's hard clamp keep it bounded.
const IMPULSE_K1 = 0.05;
const IMPULSE_MIN = 3;
const IMPULSE_MAX = 14;

// Call once per frame when boundaryIndexAt's result changed (never more
// than once per frame, per §3.5.5's crossing-detection rule) with the
// number of boundaries crossed since the last frame and the wheel's signed
// angular velocity. Direction follows the surface travel at the pointer.
export function applyPegImpulse(state: FlapperState, wheelOmega: number, boundariesCrossed: number): FlapperState {
  if (boundariesCrossed <= 0 || wheelOmega === 0) return state;
  const magnitude = clamp(IMPULSE_K1 * Math.abs(wheelOmega) * boundariesCrossed, IMPULSE_MIN, IMPULSE_MAX);
  const direction = wheelOmega >= 0 ? 1 : -1;
  return { theta: state.theta, omega: state.omega + direction * magnitude };
}

// ω_cruise = p·D/T (§3.5.6) -- derived, not chosen, so cruise speed always
// matches the ease-out's velocity at t=0: zero discontinuity the instant
// STOP ROLL is pressed.
export function cruiseOmega(D: number, T = 4.8, p = 3.2): number {
  return (p * D) / T;
}

// θ(t) = θ_end − D·(1 − t/T)^p (§3.5.6). Clamped to [0, T] so callers can
// evaluate slightly past T without the exponent misbehaving.
export function stoppingRotation(t: number, thetaEnd: number, D: number, T = 4.8, p = 3.2): number {
  const clampedT = clamp(t, 0, T);
  return thetaEnd - D * Math.pow(1 - clampedT / T, p);
}

// Damped rock of ±1.2° over ~500ms as the wheel settles against the
// flapper (§3.5.6) -- an offset added on top of the final resting rotation.
export function settleOffset(t: number, amplitude = degToRad(1.2), durationMs = 500): number {
  if (t <= 0) return amplitude;
  if (t >= durationMs) return 0;
  const progress = t / durationMs;
  return amplitude * (1 - progress) * Math.cos(progress * Math.PI * 3);
}
