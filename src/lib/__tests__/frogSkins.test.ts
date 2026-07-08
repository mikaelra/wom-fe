import { describe, expect, it } from 'vitest';
import { ALL_FROG_SKINS, assignSkins, skinUrl } from '@/lib/frogSkins';

const players = (...names: string[]) => names.map((name) => ({ name }));

describe('skinUrl', () => {
  it('builds the model path', () => {
    expect(skinUrl('frog_green_v1')).toBe('/models/frogs/frog_green_v1.glb');
  });
});

describe('assignSkins', () => {
  it('assigns every player a known skin', () => {
    const result = assignSkins(players('Alice', 'Bob', 'Carol'), 'lobby1');
    const validUrls = new Set(ALL_FROG_SKINS.map(skinUrl));
    expect(result.size).toBe(3);
    for (const url of result.values()) {
      expect(validUrls.has(url)).toBe(true);
    }
  });

  it('is deterministic for the same players and lobby', () => {
    const a = assignSkins(players('Alice', 'Bob', 'Carol'), 'lobby1');
    const b = assignSkins(players('Alice', 'Bob', 'Carol'), 'lobby1');
    expect(Object.fromEntries(a)).toEqual(Object.fromEntries(b));
  });

  it('mixes the lobby id into the seed', () => {
    // A player's skin should not be globally fixed: across many lobbies,
    // at least one assignment must differ.
    const across = new Set(
      ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8'].map(
        (lobby) => assignSkins(players('Alice'), lobby).get('Alice'),
      ),
    );
    expect(across.size).toBeGreaterThan(1);
  });

  it('never assigns the same skin twice while unclaimed skins remain', () => {
    const names = ['Alice', 'Bob', 'Carol', 'Dave', 'Erin', 'Frank'];
    const result = assignSkins(players(...names), 'lobby1');
    expect(new Set(result.values()).size).toBe(names.length);
  });

  it('still assigns a skin to everyone in an overfull lobby', () => {
    const names = Array.from({ length: 15 }, (_, i) => `Player${i}`);
    const result = assignSkins(players(...names), 'lobby1');
    expect(result.size).toBe(15);
  });
});
