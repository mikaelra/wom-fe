import { describe, expect, it } from 'vitest';
import { buildCombatAnimationPlan, buildHadesCoinEvents, HADES_COIN_SCALE, WELL_FX_DURATION } from '@/lib/combatAnimationPlan';
import { WELL_REWARD_SCALE } from '@/components/lobby/WellRewardEffect';
import type { GameEvent } from '@/lib/gameEvents';

const ME = 'Alice';
const posMap = new Map<string, [number, number, number]>([
  [ME, [0, 0, 0]],
  ['Bob', [1, 0, 0]],
  ['Carol', [2, 0, 0]],
]);

const baseInput = {
  playerName: ME,
  posMap,
  myNowHp: 5,
  wonWell: false,
};

describe('buildCombatAnimationPlan', () => {
  it('returns an empty plan when there is nothing to animate', () => {
    const plan = buildCombatAnimationPlan({ ...baseInput, events: [] });
    expect(plan).toEqual([]);
  });

  describe('outgoing attacks', () => {
    it('adds a strike immediately for a plain hit', () => {
      const events: GameEvent[] = [
        { kind: 'outgoing', target: 'Bob', outcome: 'hit', attackerDied: false },
      ];
      const plan = buildCombatAnimationPlan({ ...baseInput, events });

      expect(plan).toEqual([
        {
          delayMs: 0,
          actions: [{
            type: 'addStrike',
            strike: expect.objectContaining({
              fromPos: [0, 0.3, 0],
              toPos: [1, 0.3, 0],
              targetDefended: false,
              targetHit: true,
              isIncoming: false,
              postImpact: 'retreat',
              flashPosition: [1, 0, 0],
              bounceFlashPos: undefined,
            }),
          }],
        },
      ]);
    });

    it('offsets toPos away from the attacker when the target defended', () => {
      const events: GameEvent[] = [
        { kind: 'outgoing', target: 'Bob', outcome: 'blocked', attackerDied: false },
      ];
      const plan = buildCombatAnimationPlan({ ...baseInput, events });
      const strike = (plan[0].actions[0] as { strike: { toPos: number[] } }).strike;
      // Shifted 0.8 back toward the attacker (me, at x=0) along the x axis.
      expect(strike.toPos[0]).toBeCloseTo(1 - 0.8, 5);
    });

    it('ramps the block glow up before impact and cuts it to fade out right on impact, under the target, when the target blocks', () => {
      const events: GameEvent[] = [
        { kind: 'outgoing', target: 'Bob', outcome: 'blocked', attackerDied: false },
      ];
      const plan = buildCombatAnimationPlan({ ...baseInput, events });

      const SWORD_IMPACT_MS = 600; // (0.34 + 0.26) * 1000
      const BLOCK_GLOW_EARLY_MS = 100;
      const BLOCK_GLOW_LEAD_MS = 150;
      const impactMs = 0 + SWORD_IMPACT_MS - BLOCK_GLOW_EARLY_MS;
      const addBatch = plan.find((b) => b.actions.some((a) => a.type === 'addBlockGlow'));
      const removeBatch = plan.find((b) => b.actions.some((a) => a.type === 'removeBlockGlow'));
      expect(addBatch?.delayMs).toBeCloseTo(impactMs - BLOCK_GLOW_LEAD_MS, 5);
      expect(removeBatch?.delayMs).toBeCloseTo(impactMs, 5);
      const event = addBatch?.actions.find((a) => a.type === 'addBlockGlow') as { event: { pos: number[] } };
      expect(event.event.pos).toEqual([1, 0, 0]); // Bob's seat, not mine
    });

    it('does not schedule a block glow for a plain (unblocked) hit', () => {
      const events: GameEvent[] = [
        { kind: 'outgoing', target: 'Bob', outcome: 'hit', attackerDied: false },
      ];
      const plan = buildCombatAnimationPlan({ ...baseInput, events });
      expect(plan.some((b) => b.actions.some((a) => a.type === 'addBlockGlow'))).toBe(false);
    });

    it('marks a reflected block as bounce, flashing back at the attacker', () => {
      const events: GameEvent[] = [
        { kind: 'outgoing', target: 'Bob', outcome: 'reflected', attackerDied: false },
      ];
      const plan = buildCombatAnimationPlan({ ...baseInput, events });
      const strike = (plan[0].actions[0] as { strike: { postImpact: string; bounceFlashPos?: number[] } }).strike;
      expect(strike.postImpact).toBe('bounce');
      expect(strike.bounceFlashPos).toEqual([0, 0, 0]);
    });

    it('schedules kill-fire and kill-loot at SWORD_IMPACT_MS when the outgoing attack eliminates the target', () => {
      const events: GameEvent[] = [
        { kind: 'outgoing', target: 'Bob', outcome: 'hit', attackerDied: false, eliminated: true, coinsReceived: 3 },
      ];
      const plan = buildCombatAnimationPlan({ ...baseInput, events });

      const SWORD_IMPACT_MS = 600; // (0.34 + 0.26) * 1000
      const KILL_LOOT_LAND_MS = 1030;

      expect(plan[0].delayMs).toBe(0); // the strike itself
      expect(plan[0].actions[0].type).toBe('addStrike');

      expect(plan[1].delayMs).toBeCloseTo(SWORD_IMPACT_MS, 5);
      expect(plan[1].actions).toEqual([
        { type: 'addKillFire', event: expect.objectContaining({ pos: [0, 0, 0] }) },
        { type: 'markDead', name: 'Bob' },
      ]);

      expect(plan[2].delayMs).toBeCloseTo(SWORD_IMPACT_MS, 5);
      expect(plan[2].actions[0].type).toBe('addWellRewardEvents');
      if (plan[2].actions[0].type === 'addWellRewardEvents') {
        expect(plan[2].actions[0].events).toHaveLength(3); // 3 coins
      }

      expect(plan[3].delayMs).toBeCloseTo(SWORD_IMPACT_MS + KILL_LOOT_LAND_MS, 5);
      expect(plan[3].actions).toEqual([{ type: 'emitHpFx', event: { kind: 'killgain', coins: 3, atk: 1 } }]);
    });

    it('still emits the ATK-gain hpFx on a coinless kill, but no coin-fling batch', () => {
      const events: GameEvent[] = [
        { kind: 'outgoing', target: 'Bob', outcome: 'hit', attackerDied: false, eliminated: true, coinsReceived: 0 },
      ];
      const plan = buildCombatAnimationPlan({ ...baseInput, events });
      const actionTypes = plan.flatMap((b) => b.actions.map((a) => a.type));
      expect(actionTypes).toEqual(['addStrike', 'addKillFire', 'markDead', 'emitHpFx']);
    });

    it('produces no batches when the attacker has no known position', () => {
      const events: GameEvent[] = [
        { kind: 'outgoing', target: 'Ghost', outcome: 'hit', attackerDied: false },
      ];
      const plan = buildCombatAnimationPlan({ ...baseInput, events });
      expect(plan).toEqual([]);
    });
  });

  describe('incoming attacks', () => {
    it('adds an undefended hit immediately with no shield', () => {
      const events: GameEvent[] = [
        { kind: 'incoming', attacker: 'Bob', outcome: 'hit', attackerDied: false, damage: 2 },
      ];
      const plan = buildCombatAnimationPlan({ ...baseInput, events });

      expect(plan).toEqual([
        {
          delayMs: 0,
          actions: [{
            type: 'addStrike',
            strike: expect.objectContaining({
              isIncoming: true,
              targetDefended: false,
              targetHit: true,
              postImpact: 'retreat',
              incomingFx: { kind: 'hit', damage: 2 },
            }),
          }],
        },
      ]);
    });

    it('bundles the strike and its shield in one batch, and schedules shield removal separately', () => {
      const events: GameEvent[] = [
        { kind: 'incoming', attacker: 'Bob', outcome: 'blocked', attackerDied: false },
      ];
      const plan = buildCombatAnimationPlan({ ...baseInput, events });

      const ONE_DEF_MS = 1260; // (0.34 + 0.26 + 0.66) * 1000
      const shieldDur = ONE_DEF_MS + 424;

      expect(plan[0].delayMs).toBe(0);
      expect(plan[0].actions.map((a) => a.type)).toEqual(['addStrike', 'addImpactShield']);

      expect(plan[1].delayMs).toBeCloseTo(shieldDur, 5);
      expect(plan[1].actions[0].type).toBe('removeImpactShield');
    });

    it('ramps the block glow up before impact and cuts it to fade out right on impact, under me, when I block', () => {
      const events: GameEvent[] = [
        { kind: 'incoming', attacker: 'Bob', outcome: 'blocked', attackerDied: false },
      ];
      const plan = buildCombatAnimationPlan({ ...baseInput, events });

      const SWORD_IMPACT_MS = 600; // (0.34 + 0.26) * 1000
      const BLOCK_GLOW_EARLY_MS = 100;
      const BLOCK_GLOW_LEAD_MS = 150;
      const impactMs = 0 + SWORD_IMPACT_MS - BLOCK_GLOW_EARLY_MS;
      const addBatch = plan.find((b) => b.actions.some((a) => a.type === 'addBlockGlow'));
      const removeBatch = plan.find((b) => b.actions.some((a) => a.type === 'removeBlockGlow'));
      expect(addBatch?.delayMs).toBeCloseTo(impactMs - BLOCK_GLOW_LEAD_MS, 5);
      expect(removeBatch?.delayMs).toBeCloseTo(impactMs, 5);
      const event = addBatch?.actions.find((a) => a.type === 'addBlockGlow') as { event: { pos: number[] } };
      expect(event.event.pos).toEqual([0, 0, 0]); // my own seat
    });

    it('does not schedule a block glow for a plain (unblocked) incoming hit', () => {
      const events: GameEvent[] = [
        { kind: 'incoming', attacker: 'Bob', outcome: 'hit', attackerDied: false, damage: 1 },
      ];
      const plan = buildCombatAnimationPlan({ ...baseInput, events });
      expect(plan.some((b) => b.actions.some((a) => a.type === 'addBlockGlow'))).toBe(false);
    });

    it('staggers a second incoming attack after the first one finishes, plus GAP_MS', () => {
      const events: GameEvent[] = [
        { kind: 'incoming', attacker: 'Bob', outcome: 'hit', attackerDied: false, damage: 1 },
        { kind: 'incoming', attacker: 'Carol', outcome: 'hit', attackerDied: false, damage: 1 },
      ];
      const plan = buildCombatAnimationPlan({ ...baseInput, events });

      const ONE_HIT_MS = 960; // (0.34 + 0.26 + 0.36) * 1000
      const GAP_MS = 242;

      const strikeBatches = plan.filter((b) => b.actions.some((a) => a.type === 'addStrike'));
      expect(strikeBatches).toHaveLength(2);
      expect(strikeBatches[0].delayMs).toBe(0);
      expect(strikeBatches[1].delayMs).toBe(ONE_HIT_MS + GAP_MS);
    });

    it('schedules kill-fire and kill-loot at delay+ONE_DEF_MS on a reflection kill', () => {
      const events: GameEvent[] = [
        { kind: 'incoming', attacker: 'Bob', outcome: 'reflected_back', attackerDied: true, coinsReceived: 2 },
      ];
      const plan = buildCombatAnimationPlan({ ...baseInput, events });

      const ONE_DEF_MS = 1260;
      const killFireBatch = plan.find((b) => b.actions.some((a) => a.type === 'addKillFire'));
      expect(killFireBatch?.delayMs).toBeCloseTo(0 + ONE_DEF_MS, 5);

      const lootBatch = plan.find((b) => b.actions.some((a) => a.type === 'addWellRewardEvents'));
      expect(lootBatch?.delayMs).toBeCloseTo(0 + ONE_DEF_MS, 5);
    });

    it('schedules kill-fire under the attacker when the local player is killed', () => {
      const events: GameEvent[] = [
        { kind: 'incoming', attacker: 'Bob', outcome: 'instakill', attackerDied: false },
      ];
      const plan = buildCombatAnimationPlan({ ...baseInput, events, myNowHp: 0 });

      // Instakill: dead pose waits for the kill burst (STRIKE_DUR + burst duration),
      // which runs longer than the plain SWORD_IMPACT_MS strike-and-hold window.
      const INSTAKILL_DEATH_MS = 0.34 * 1000 + 0.85 * 1000;
      const killFireBatch = plan.find((b) => b.actions.some((a) => a.type === 'addKillFire'));
      expect(killFireBatch?.delayMs).toBe(0 + INSTAKILL_DEATH_MS);
      if (killFireBatch?.actions[0].type === 'addKillFire') {
        expect(killFireBatch.actions[0].event.pos).toEqual([1, 0, 0]); // Bob's position
      }
    });

    it('does not schedule a death kill-fire when the local player survives', () => {
      const events: GameEvent[] = [
        { kind: 'incoming', attacker: 'Bob', outcome: 'hit', attackerDied: false, damage: 1 },
      ];
      const plan = buildCombatAnimationPlan({ ...baseInput, events, myNowHp: 4 });
      expect(plan.some((b) => b.actions.some((a) => a.type === 'addKillFire'))).toBe(false);
    });

    it('reveals the dead pose only once, timed to the last of several attackers, not the first', () => {
      const events: GameEvent[] = [
        { kind: 'incoming', attacker: 'Bob', outcome: 'hit', attackerDied: false, damage: 1 },
        { kind: 'incoming', attacker: 'Carol', outcome: 'hit', attackerDied: false, damage: 1 },
      ];
      const plan = buildCombatAnimationPlan({ ...baseInput, events, myNowHp: 0 });

      const SWORD_IMPACT_MS = 600; // (0.34 + 0.26) * 1000
      const ONE_HIT_MS = 960;      // (0.34 + 0.26 + 0.36) * 1000
      const GAP_MS = 242;

      const markDeadBatches = plan.filter((b) => b.actions.some((a) => a.type === 'markDead'));
      // Only one markDead for the whole round...
      expect(markDeadBatches).toHaveLength(1);
      // ...timed to Carol's (the second, last-landing attacker's) strike, not Bob's.
      expect(markDeadBatches[0].delayMs).toBe(ONE_HIT_MS + GAP_MS + SWORD_IMPACT_MS);
    });

    it('still reveals the dead pose when the killing attacker is anonymised (no known position)', () => {
      const events: GameEvent[] = [
        { kind: 'incoming', attacker: null, outcome: 'instakill', attackerDied: false },
      ];
      const plan = buildCombatAnimationPlan({ ...baseInput, events, myNowHp: 0 });

      const markDeadBatch = plan.find((b) => b.actions.some((a) => a.type === 'markDead'));
      expect(markDeadBatch).toBeDefined();
      // No attacker position known, so no kill-fire glow is scheduled alongside it.
      expect(markDeadBatch?.actions.some((a) => a.type === 'addKillFire')).toBe(false);
    });
  });

  describe('well reward', () => {
    it('adds well-win-fx and reward events immediately, and removes the fx after WELL_FX_DURATION', () => {
      const events: GameEvent[] = [
        { kind: 'well_reward', components: [{ type: 'gold', count: 2 }] },
      ];
      const plan = buildCombatAnimationPlan({ ...baseInput, events, wonWell: true });

      // Matches the original's exact order: add the fx, schedule its removal,
      // *then* compute and add the reward events.
      expect(plan[0].delayMs).toBe(0);
      expect(plan[0].actions[0].type).toBe('addWellWinFx');
      expect(plan[1]).toEqual({
        delayMs: WELL_FX_DURATION,
        actions: [{ type: 'removeWellWinFx', id: expect.any(String) }],
      });
      expect(plan[2].delayMs).toBe(0);
      expect(plan[2].actions[0].type).toBe('addWellRewardEvents');
      if (plan[2].actions[0].type === 'addWellRewardEvents') {
        expect(plan[2].actions[0].events).toHaveLength(2); // 2 gold instances
      }
    });

    it('builds one flying coin per stolen coin, sourced from each victim seat', () => {
      const events: GameEvent[] = [
        {
          kind: 'well_reward',
          components: [{ type: 'steal', count: 3, victims: [{ name: 'Bob', amount: 2 }, { name: 'Carol', amount: 1 }] }],
        },
      ];
      const plan = buildCombatAnimationPlan({ ...baseInput, events, wonWell: true });
      const rewardBatch = plan.find((b) => b.actions.some((a) => a.type === 'addWellRewardEvents'));
      if (rewardBatch?.actions[0].type === 'addWellRewardEvents') {
        expect(rewardBatch.actions[0].events).toHaveLength(3); // 2 from Bob + 1 from Carol
      } else {
        throw new Error('expected addWellRewardEvents batch');
      }
    });

    it('produces no well batches when wonWell is false, even if a well_reward event is present', () => {
      const events: GameEvent[] = [
        { kind: 'well_reward', components: [{ type: 'gold', count: 1 }] },
      ];
      const plan = buildCombatAnimationPlan({ ...baseInput, events, wonWell: false });
      expect(plan).toEqual([]);
    });

    it('delays incoming attacks until the well animation finishes', () => {
      const events: GameEvent[] = [
        { kind: 'well_reward', components: [{ type: 'gold', count: 1 }] },
        { kind: 'incoming', attacker: 'Bob', outcome: 'hit', attackerDied: false, damage: 1 },
      ];
      const plan = buildCombatAnimationPlan({ ...baseInput, events, wonWell: true });
      const strikeBatch = plan.find((b) => b.actions.some((a) => a.type === 'addStrike'));
      expect(strikeBatch?.delayMs).toBe(WELL_FX_DURATION); // no reward-flight events, so WELL_FX_DURATION wins
    });
  });

  describe('outgoing + incoming in the same round', () => {
    const findIncomingStrikeBatch = (plan: ReturnType<typeof buildCombatAnimationPlan>) =>
      plan.find((b) =>
        b.actions.some((a) => a.type === 'addStrike' && (a as { strike: { isIncoming: boolean } }).strike.isIncoming),
      );

    it('delays the incoming strike until my own outgoing strike finishes, instead of playing at once', () => {
      const events: GameEvent[] = [
        { kind: 'outgoing', target: 'Bob', outcome: 'hit', attackerDied: false },
        { kind: 'incoming', attacker: 'Carol', outcome: 'hit', attackerDied: false, damage: 1 },
      ];
      const plan = buildCombatAnimationPlan({ ...baseInput, events });

      const ONE_HIT_MS = 960; // (0.34 + 0.26 + 0.36) * 1000

      expect(plan[0].delayMs).toBe(0); // my outgoing strike plays immediately
      expect(plan[0].actions[0].type).toBe('addStrike');
      expect(findIncomingStrikeBatch(plan)?.delayMs).toBeCloseTo(ONE_HIT_MS, 5);
    });

    it('uses the longer defended-strike duration for the incoming delay when my own attack was blocked', () => {
      const events: GameEvent[] = [
        { kind: 'outgoing', target: 'Bob', outcome: 'blocked', attackerDied: false },
        { kind: 'incoming', attacker: 'Carol', outcome: 'hit', attackerDied: false, damage: 1 },
      ];
      const plan = buildCombatAnimationPlan({ ...baseInput, events });

      const ONE_DEF_MS = 1260; // (0.34 + 0.26 + 0.66) * 1000

      expect(findIncomingStrikeBatch(plan)?.delayMs).toBeCloseTo(ONE_DEF_MS, 5);
    });

    it('stacks the outgoing delay after the well delay when both apply', () => {
      const events: GameEvent[] = [
        { kind: 'outgoing', target: 'Bob', outcome: 'hit', attackerDied: false },
        { kind: 'well_reward', components: [{ type: 'gold', count: 1 }] },
        { kind: 'incoming', attacker: 'Carol', outcome: 'hit', attackerDied: false, damage: 1 },
      ];
      const plan = buildCombatAnimationPlan({ ...baseInput, events, wonWell: true });

      const ONE_HIT_MS = 960;

      expect(findIncomingStrikeBatch(plan)?.delayMs).toBeCloseTo(WELL_FX_DURATION + ONE_HIT_MS, 5);
    });
  });

  describe('witnessed eliminations', () => {
    it('schedules a hit-flash, kill-fire, and kill-banner at wellDelayMs + SWORD_IMPACT_MS + i*546', () => {
      const events: GameEvent[] = [
        { kind: 'witness', attacker: 'Bob', victim: 'Carol' },
      ];
      const plan = buildCombatAnimationPlan({ ...baseInput, events });

      const SWORD_IMPACT_MS = 600;
      const expectedDelay = 0 + SWORD_IMPACT_MS + 0 * 546;

      const flashAdd = plan.find((b) => b.actions.some((a) => a.type === 'addHitFlash'));
      expect(flashAdd?.delayMs).toBeCloseTo(expectedDelay, 5);
      const flashRemove = plan.find((b) => b.actions.some((a) => a.type === 'removeHitFlash'));
      expect(flashRemove?.delayMs).toBeCloseTo(expectedDelay + 788, 5);

      const fireAdd = plan.find((b) => b.actions.some((a) => a.type === 'addKillFire'));
      expect(fireAdd?.delayMs).toBeCloseTo(expectedDelay, 5);
      const bannerAdd = plan.find((b) => b.actions.some((a) => a.type === 'addKillBanner'));
      expect(bannerAdd?.delayMs).toBeCloseTo(expectedDelay, 5);
      const bannerRemove = plan.find((b) => b.actions.some((a) => a.type === 'removeKillBanner'));
      expect(bannerRemove?.delayMs).toBeCloseTo(expectedDelay + 3151, 5);
    });

    it('staggers multiple witnessed eliminations by 546ms each', () => {
      const events: GameEvent[] = [
        { kind: 'witness', attacker: 'Bob', victim: 'Carol' },
        { kind: 'witness', attacker: 'Carol', victim: 'Bob' },
      ];
      const plan = buildCombatAnimationPlan({ ...baseInput, events });
      const fireBatches = plan.filter((b) => b.actions.some((a) => a.type === 'addKillFire'));
      expect(fireBatches).toHaveLength(2);
      expect(fireBatches[1].delayMs - fireBatches[0].delayMs).toBeCloseTo(546, 5);
    });
  });

  it('preserves ordering across a round with an outgoing kill, a well win, and incoming attacks', () => {
    const events: GameEvent[] = [
      { kind: 'outgoing', target: 'Bob', outcome: 'hit', attackerDied: false, eliminated: true, coinsReceived: 1 },
      { kind: 'well_reward', components: [{ type: 'gold', count: 1 }] },
      { kind: 'incoming', attacker: 'Carol', outcome: 'hit', attackerDied: false, damage: 1 },
    ];
    const plan = buildCombatAnimationPlan({ ...baseInput, events, wonWell: true });
    const actionTypes = plan.flatMap((b) => b.actions.map((a) => a.type));
    // The well fx still always reads first, by design (it's a rewarding
    // moment we don't want interrupted by combat -- see the well block's own
    // comment); the two combat strikes follow in event order, outgoing (as
    // listed first here) before incoming.
    expect(actionTypes[0]).toBe('addWellWinFx');
    const outgoingIdx = actionTypes.indexOf('addStrike');
    const incomingStrikeBatch = plan.find((b) =>
      b.actions.some((a) => a.type === 'addStrike' && (a as { strike: { isIncoming: boolean } }).strike.isIncoming),
    );
    const incomingIdx = plan.indexOf(incomingStrikeBatch!);
    expect(outgoingIdx).toBeGreaterThan(-1);
    expect(incomingIdx).toBeGreaterThan(-1);
    expect(outgoingIdx).toBeLessThan(incomingIdx);
  });

  it('plays the incoming strike before my own outgoing strike when the incoming event is listed first', () => {
    const events: GameEvent[] = [
      { kind: 'incoming', attacker: 'Carol', outcome: 'hit', attackerDied: false, damage: 1 },
      { kind: 'outgoing', target: 'Bob', outcome: 'hit', attackerDied: false },
    ];
    const plan = buildCombatAnimationPlan({ ...baseInput, events });

    const ONE_HIT_MS = 960; // (0.34 + 0.26 + 0.36) * 1000
    const GAP_MS = 242;

    const strikeBatches = plan.filter((b) => b.actions.some((a) => a.type === 'addStrike'));
    expect(strikeBatches).toHaveLength(2);
    const incomingBatch = strikeBatches[0];
    const outgoingBatch = strikeBatches[1];
    expect((incomingBatch.actions[0] as { strike: { isIncoming: boolean } }).strike.isIncoming).toBe(true);
    expect((outgoingBatch.actions[0] as { strike: { isIncoming: boolean } }).strike.isIncoming).toBe(false);
    expect(incomingBatch.delayMs).toBe(0);
    expect(outgoingBatch.delayMs).toBe(ONE_HIT_MS + GAP_MS);
  });
});

describe('buildHadesCoinEvents', () => {
  const bossPos: [number, number, number] = [0, 0, -5];
  const winnerPositions: [number, number, number][] = [[1, 0, 0], [2, 0, 0], [3, 0, 0]];

  it('spawns one 3x gold coin per winner, launched from the boss', () => {
    const events = buildHadesCoinEvents(bossPos, winnerPositions);
    expect(events).toHaveLength(3);
    events.forEach((ev, i) => {
      expect(ev.type).toBe('gold');
      expect(ev.fromPos).toEqual([bossPos[0], bossPos[1] + 0.5, bossPos[2]]);
      expect(ev.toPos).toEqual(winnerPositions[i]);
      expect(ev.scale).toBe(HADES_COIN_SCALE);
      expect(ev.scale).toBe(WELL_REWARD_SCALE.gold * 3);
    });
  });

  it('holds off 1.82s before the first coin launches, so it does not overlap the kill-loot coins', () => {
    const events = buildHadesCoinEvents(bossPos, winnerPositions);
    expect(events[0].delay).toBe(1.82);
  });

  it('staggers each winner so the coins land one at a time', () => {
    const events = buildHadesCoinEvents(bossPos, winnerPositions);
    expect(events[1].delay).toBeGreaterThan(events[0].delay);
    expect(events[2].delay).toBeGreaterThan(events[1].delay);
  });

  it('returns no events when nobody survived to be credited', () => {
    expect(buildHadesCoinEvents(bossPos, [])).toEqual([]);
  });
});
