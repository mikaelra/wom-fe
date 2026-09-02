import { getSfxVolume, isSfxEnabled } from './soundSettings';

// Prevent combat sounds from interrupting background music on mobile (iOS/Android)
if (typeof navigator !== 'undefined' && 'audioSession' in navigator) {
  (navigator as Navigator & { audioSession: { type: string } }).audioSession.type = 'ambient';
}

/**
 * Per-asset gain, because these clips were mastered independently and are
 * nowhere near each other. Measured off the files in
 * public/sounds/resources/ (mono, 44.1kHz), peak as a fraction of full
 * scale:
 *
 *   AttackBlocked   0.201   0.37s      AttackIncoming  0.464   0.68s
 *   AttackHit       0.250   0.41s      GetHp           0.570   0.16s
 *   GetCoin         0.758   0.12s      GetAtk          1.000   2.08s
 *
 * GetAtk is the one players actually complain about, and the numbers say
 * why: it is the only asset that reaches full scale, and it sustains for
 * 2.08 seconds where its two siblings are 0.12s and 0.16s blips. Its *RMS*
 * is unremarkable -- quieter than GetCoin's, in fact -- so anything
 * measuring average level would call it fine. Peak plus duration is what
 * the ear is reacting to.
 *
 * These can only ever attenuate: an <audio> element's .volume is capped at
 * 1, so there is no bringing the quiet attack sounds up. That fixes the
 * direction of the fix -- cut the loud outliers down toward the quiet ones,
 * never the reverse -- and makes the quietest asset the ceiling everything
 * else is judged against. Anything left at 1.0 below is already at or under
 * the level the trio is being pulled to.
 */
const GAIN = {
  /** Full scale and 2s long: matched to GetHp's peak (0.57 would do it) and
   *  then trimmed further, because loudness integrates over time and this
   *  clip runs ~13x longer than the blips it plays alongside. */
  getAtk: 0.45,
  /** 0.758 -> ~0.57, landing it on GetHp so the three resource sounds read
   *  as one set. */
  getCoin: 0.75,
  /** Already the quietest of the three at 0.570; the others come to it. */
  unchanged: 1,
} as const;

interface SoundSpec {
  src: string;
  /** Multiplied by the player's SFX volume at play time. */
  gain: number;
}

const COMBAT_SOUNDS: Record<string, SoundSpec> = {
  // My own outgoing attack lands unblocked (LobbyScene's onStrike), or a
  // reflected sword's second impact landing at the end of its bounce arc
  // (onDone) -- either side of a block+reflect hears this.
  attack_hit: { src: '/sounds/resources/AttackHit.wav', gain: GAIN.unchanged },
  // A block happens (onStrike) -- heard by the attacker when their own
  // outgoing attack gets blocked, AND by the defender when their own Defend
  // successfully blocks an incoming attack (see `attacked` below for what
  // the defender hears instead when it isn't blocked).
  attack_blocked: { src: '/sounds/resources/AttackBlocked.wav', gain: GAIN.unchanged },
  // An incoming attack actually lands on the local player, i.e. their
  // Defend failed to block it (onStrike) -- see `attack_blocked` for what
  // they hear instead when it's successfully blocked.
  attacked: { src: '/sounds/resources/AttackIncoming.wav', gain: GAIN.unchanged },
};

function play(spec: SoundSpec): void {
  if (!isSfxEnabled()) return;
  try {
    const el = new Audio(spec.src);
    // Clamped rather than trusted: .volume throws on anything outside 0..1,
    // and that would take down whatever is mid-render when a sound fires.
    el.volume = Math.min(1, Math.max(0, spec.gain * getSfxVolume()));
    el.play().catch(() => {});
  } catch {
    // ignore – audio blocked by browser policy
  }
}

export function playCombatSound(event: string): void {
  const spec = COMBAT_SOUNDS[event];
  if (spec) play(spec);
}

// gain_hp/gain_coin/gain_attack: the player's own resource choice landing
// (ResourceGainEffect's onDone), a well-won reward model landing (health/
// gold/sword -- WellRewardEffect's onLand), or a kill's victim-coins landing
// (also WellRewardEffect's onLand, type 'steal' -- reuses the coin sound,
// same model). Deliberately one call per model, not per round: a multi-unit
// grant (e.g. a "2_hp" Well reward, or looting several coins off a kill)
// mounts one effect instance per unit already (see combatAnimationPlan.ts's
// buildWellRewardEvents/scheduleKillLoot), so calling this from each
// instance's own onLand naturally plays the sound once per model, in step
// with each one actually landing -- not one sound for the whole batch.
export type ResourceSound = 'gain_hp' | 'gain_coin' | 'gain_attack';

const RESOURCE_SOUNDS: Record<ResourceSound, SoundSpec> = {
  gain_hp: { src: '/sounds/resources/GetHp.wav', gain: GAIN.unchanged },
  gain_coin: { src: '/sounds/resources/GetCoin.wav', gain: GAIN.getCoin },
  gain_attack: { src: '/sounds/resources/GetAtk.wav', gain: GAIN.getAtk },
};

export function playResourceSound(resource: ResourceSound): void {
  play(RESOURCE_SOUNDS[resource]);
}
