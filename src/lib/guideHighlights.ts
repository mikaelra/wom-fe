// Shared types for the Rules reference's per-step button highlights (see
// GuideStepPreview, guideSteps.ts) -- which buttons a step calls out, and
// which colour. Only static preview illustration reads these now; the old
// live in-round tour that blinked the real buttons has been removed.

// Buttons a step can highlight. Each maps to a real in-game button
// (attack/defend/well live in the 3D scene; hp/coins/atk in the overlay).
export type GuideTarget = 'attack' | 'defend' | 'well' | 'hp' | 'coins' | 'atk';

// Glow colour for a highlighted button.
export type GuideGlow = 'blue' | 'gold';

export type GuideHighlights = Partial<Record<GuideTarget, GuideGlow>>;
