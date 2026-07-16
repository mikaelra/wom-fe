import { describe, expect, it } from 'vitest';
import { buildCombatAnimationPlan, WELL_FX_DURATION } from '@/lib/combatAnimationPlan';
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

      const SWORD_IMPACT_MS = 500; // (0.28 + 0.22) * 1000
      const KILL_LOOT_LAND_MS = 850;

      expect(plan[0].delayMs).toBe(0); // the strike itself
      expect(plan[0].actions[0].type).toBe('addStrike');

      expect(plan[1]).toEqual({
        delayMs: SWORD_IMPACT_MS,
        actions: [
          { type: 'addKillFire', event: expect.objectContaining({ pos: [0, 0, 0] }) },
          { type: 'markDead', name: 'Bob' },
        ],
      });

      expect(plan[2].delayMs).toBe(SWORD_IMPACT_MS);
      expect(plan[2].actions[0].type).toBe('addWellRewardEvents');
      if (plan[2].actions[0].type === 'addWellRewardEvents') {
        expect(plan[2].actions[0].events).toHaveLength(3); // 3 coins
      }

      expect(plan[3]).toEqual({
        delayMs: SWORD_IMPACT_MS + KILL_LOOT_LAND_MS,
        actions: [{ type: 'emitHpFx', event: { kind: 'killgain', coins: 3, atk: 1 } }],
      });
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

      const ONE_DEF_MS = 1050; // (0.28 + 0.22 + 0.55) * 1000
      const shieldDur = ONE_DEF_MS + 350;

      expect(plan[0].delayMs).toBe(0);
      expect(plan[0].actions.map((a) => a.type)).toEqual(['addStrike', 'addImpactShield']);

      expect(plan[1].delayMs).toBe(shieldDur);
      expect(plan[1].actions[0].type).toBe('removeImpactShield');
    });

    it('staggers a second incoming attack after the first one finishes, plus GAP_MS', () => {
      const events: GameEvent[] = [
        { kind: 'incoming', attacker: 'Bob', outcome: 'hit', attackerDied: false, damage: 1 },
        { kind: 'incoming', attacker: 'Carol', outcome: 'hit', attackerDied: false, damage: 1 },
      ];
      const plan = buildCombatAnimationPlan({ ...baseInput, events });

      const ONE_HIT_MS = 800; // (0.28 + 0.22 + 0.30) * 1000
      const GAP_MS = 200;

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

      const ONE_DEF_MS = 1050;
      const killFireBatch = plan.find((b) => b.actions.some((a) => a.type === 'addKillFire'));
      expect(killFireBatch?.delayMs).toBe(0 + ONE_DEF_MS);

      const lootBatch = plan.find((b) => b.actions.some((a) => a.type === 'addWellRewardEvents'));
      expect(lootBatch?.delayMs).toBe(0 + ONE_DEF_MS);
    });

    it('schedules kill-fire under the attacker when the local player is killed', () => {
      const events: GameEvent[] = [
        { kind: 'incoming', attacker: 'Bob', outcome: 'instakill', attackerDied: false },
      ];
      const plan = buildCombatAnimationPlan({ ...baseInput, events, myNowHp: 0 });

      const SWORD_IMPACT_MS = 500;
      const killFireBatch = plan.find((b) => b.actions.some((a) => a.type === 'addKillFire'));
      expect(killFireBatch?.delayMs).toBe(0 + SWORD_IMPACT_MS);
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

  describe('witnessed eliminations', () => {
    it('schedules a hit-flash, kill-fire, and kill-banner at wellDelayMs + SWORD_IMPACT_MS + i*450', () => {
      const events: GameEvent[] = [
        { kind: 'witness', attacker: 'Bob', victim: 'Carol' },
      ];
      const plan = buildCombatAnimationPlan({ ...baseInput, events });

      const SWORD_IMPACT_MS = 500;
      const expectedDelay = 0 + SWORD_IMPACT_MS + 0 * 450;

      const flashAdd = plan.find((b) => b.actions.some((a) => a.type === 'addHitFlash'));
      expect(flashAdd?.delayMs).toBe(expectedDelay);
      const flashRemove = plan.find((b) => b.actions.some((a) => a.type === 'removeHitFlash'));
      expect(flashRemove?.delayMs).toBe(expectedDelay + 650);

      const fireAdd = plan.find((b) => b.actions.some((a) => a.type === 'addKillFire'));
      expect(fireAdd?.delayMs).toBe(expectedDelay);
      const bannerAdd = plan.find((b) => b.actions.some((a) => a.type === 'addKillBanner'));
      expect(bannerAdd?.delayMs).toBe(expectedDelay);
      const bannerRemove = plan.find((b) => b.actions.some((a) => a.type === 'removeKillBanner'));
      expect(bannerRemove?.delayMs).toBe(expectedDelay + 2600);
    });

    it('staggers multiple witnessed eliminations by 450ms each', () => {
      const events: GameEvent[] = [
        { kind: 'witness', attacker: 'Bob', victim: 'Carol' },
        { kind: 'witness', attacker: 'Carol', victim: 'Bob' },
      ];
      const plan = buildCombatAnimationPlan({ ...baseInput, events });
      const fireBatches = plan.filter((b) => b.actions.some((a) => a.type === 'addKillFire'));
      expect(fireBatches).toHaveLength(2);
      expect(fireBatches[1].delayMs - fireBatches[0].delayMs).toBe(450);
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
    // Outgoing strike first, then its kill-fire/loot, then the well fx, then the
    // delayed incoming strike -- matching the original code's section order.
    expect(actionTypes[0]).toBe('addStrike'); // outgoing
    expect(actionTypes).toContain('addWellWinFx');
    expect(actionTypes.indexOf('addWellWinFx')).toBeLessThan(actionTypes.lastIndexOf('addStrike'));
  });
});
