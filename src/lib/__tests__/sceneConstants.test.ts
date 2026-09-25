import { describe, expect, it } from 'vitest';
import {
  getBossPlayerPositions,
  getBossPosition,
  getCameraTargetPosition,
  getPlayerFrontPositions,
  getPlayerPositions,
  getResponsiveFov,
  radiusGrowthFactor,
  PLAYER_Y,
  BOSS_Y_LIFT,
  SCENE_CENTER,
  getSpectatorPositions,
  getSpectatorCameraPosition,
  atStandardCameraDistance,
  standardCameraDistance,
  SPECTATOR_ARC_STEP,
} from '@/lib/sceneConstants';

const distanceFromCenter = ([x, , z]: [number, number, number]) => Math.hypot(x, z);

describe('getPlayerPositions', () => {
  it('seats everyone evenly on the base radius for up to 6 players', () => {
    const seats = getPlayerPositions(4);
    expect(seats).toHaveLength(4);
    for (const seat of seats) {
      expect(distanceFromCenter(seat.position)).toBeCloseTo(2.1, 5);
      expect(seat.position[1]).toBe(PLAYER_Y);
    }
    // Slot 0 faces the camera (z+)
    expect(seats[0].position[0]).toBeCloseTo(0, 5);
    expect(seats[0].position[2]).toBeCloseTo(2.1, 5);
  });

  it('widens the circle by 15% for every 6 players', () => {
    expect(distanceFromCenter(getPlayerPositions(7)[0].position)).toBeCloseTo(2.1 * 1.15, 5);
    expect(distanceFromCenter(getPlayerPositions(13)[0].position)).toBeCloseTo(2.1 * 1.3, 5);
  });
});

describe('boss layout', () => {
  it('puts the boss elevated on the far side', () => {
    const boss = getBossPosition();
    expect(boss.position[2]).toBeCloseTo(-2.1, 5);
    expect(boss.position[1]).toBeCloseTo(PLAYER_Y + BOSS_Y_LIFT, 5);
  });

  it('centers a single player opposite the boss', () => {
    const [seat] = getBossPlayerPositions(1);
    expect(seat.position[0]).toBeCloseTo(0, 5);
    expect(seat.position[2]).toBeCloseTo(2.1, 5);
  });

  it('spreads players symmetrically across the near half', () => {
    const [left, right] = getBossPlayerPositions(2);
    expect(left.position[0]).toBeCloseTo(-right.position[0], 5);
    expect(left.position[2]).toBeCloseTo(right.position[2], 5);
    expect(left.position[2]).toBeGreaterThan(0);
  });
});

describe('getPlayerFrontPositions', () => {
  it('pushes labels 0.6 units further out than the seats', () => {
    const [front] = getPlayerFrontPositions(4);
    expect(distanceFromCenter(front)).toBeCloseTo(2.7, 5);
  });
});

describe('responsive camera', () => {
  it('picks the fov by aspect ratio', () => {
    expect(getResponsiveFov(1600, 900)).toBe(82); // wide
    expect(getResponsiveFov(1200, 1000)).toBe(78); // landscape
    expect(getResponsiveFov(800, 1000)).toBe(80); // portrait
  });

  it('moves the camera closer on wide screens', () => {
    const wide = getCameraTargetPosition(1600, 900);
    const portrait = getCameraTargetPosition(800, 1000);
    expect(wide[2]).toBeLessThan(portrait[2]);
    expect(wide[1]).toBeGreaterThan(SCENE_CENTER[1]);
  });

  it('defaults to a radiusFactor of 1, unchanged from before the param existed', () => {
    expect(getCameraTargetPosition(1600, 900, 1)).toEqual(getCameraTargetPosition(1600, 900));
  });

  it('backs the camera off (and raises it) proportionally to radiusFactor', () => {
    const base = getCameraTargetPosition(1600, 900);
    const widened = getCameraTargetPosition(1600, 900, 1.3);
    expect(widened[2]).toBeCloseTo(base[2] * 1.3, 5);
    expect(widened[1] - SCENE_CENTER[1]).toBeCloseTo((base[1] - SCENE_CENTER[1]) * 1.3, 5);
  });
});

describe('radiusGrowthFactor', () => {
  it('stays at 1 for up to 6 players, then grows 15% for every 6 more', () => {
    expect(radiusGrowthFactor(1)).toBe(1);
    expect(radiusGrowthFactor(6)).toBe(1);
    expect(radiusGrowthFactor(7)).toBeCloseTo(1.15, 5);
    expect(radiusGrowthFactor(12)).toBeCloseTo(1.15, 5);
    expect(radiusGrowthFactor(13)).toBeCloseTo(1.3, 5);
  });
});

// ── Spectators ─────────────────────────────────────────────────────────────

describe('getSpectatorPositions', () => {
  const bearing = ([x, , z]: [number, number, number]) => Math.atan2(x, z);
  const HADES = getBossPosition();
  const hadesBearing = Math.atan2(HADES.position[0], HADES.position[2]);

  it('starts a quarter turn away from Hades', () => {
    // The anchor the layout is specified against. Hades sits at a fixed
    // far-side angle whether or not a boss is in the lobby, so this holds in
    // an ordinary PvP lobby too -- there is just no model standing there.
    const [first] = getSpectatorPositions(1, 4);
    const gap = Math.abs(bearing(first.position) - hadesBearing);
    expect(Math.min(gap, Math.PI * 2 - gap)).toBeCloseTo(Math.PI / 2, 6);
  });

  it('runs from there toward the players, not away toward Hades', () => {
    // Players centre on the near side (bearing 0). Each successive watcher
    // must get closer to that, or the ring would fill up behind Hades where
    // nobody can see it.
    const seats = getSpectatorPositions(4, 4);
    const distanceToPlayers = seats.map((s) => Math.abs(bearing(s.position)));
    for (let i = 1; i < distanceToPlayers.length; i++) {
      expect(distanceToPlayers[i]).toBeLessThan(distanceToPlayers[i - 1]);
    }
  });

  it('stands them above the players', () => {
    for (const seat of getSpectatorPositions(5, 5)) {
      expect(seat.position[1]).toBeGreaterThan(PLAYER_Y);
    }
  });

  it('stands them outside the players\' own ring, never directly overhead', () => {
    // Exactly overhead would read as part of the player below rather than as
    // someone watching.
    const playerRadius = Math.hypot(...[getPlayerPositions(6)[0].position[0], getPlayerPositions(6)[0].position[2]]);
    for (const seat of getSpectatorPositions(6, 6)) {
      expect(Math.hypot(seat.position[0], seat.position[2])).toBeGreaterThan(playerRadius);
    }
  });

  it('keeps a comfortable gap for a few watchers rather than spreading them out', () => {
    // Two spectators should stand together near the start, not be flung to
    // opposite ends of an arc.
    const [a, b] = getSpectatorPositions(2, 4);
    const gap = Math.abs(bearing(a.position) - bearing(b.position));
    expect(gap).toBeCloseTo(SPECTATOR_ARC_STEP, 6);
  });

  it('compresses rather than overlapping once there are many', () => {
    const many = getSpectatorPositions(40, 6);
    const seen = new Set(many.map((s) => bearing(s.position).toFixed(4)));
    expect(seen.size).toBe(many.length);
  });

  it('faces every watcher the same way the players face', () => {
    // Same convention as the seat helpers above: rotation trails the angle
    // by a quarter turn so the model looks in toward the Well.
    for (const seat of getSpectatorPositions(3, 3)) {
      expect(seat.rotation[1]).toBeCloseTo(Math.atan2(seat.position[0], seat.position[2]) + Math.PI / 2, 6);
    }
  });

  it('returns nothing when nobody is watching', () => {
    expect(getSpectatorPositions(0, 4)).toEqual([]);
  });
});

describe('getSpectatorCameraPosition', () => {
  const seat = getSpectatorPositions(3, 4)[1];
  const cam = getSpectatorCameraPosition(1, 3, 4);

  it('stands behind the watcher, further from the Well than they are', () => {
    const seatR = Math.hypot(seat.position[0] - SCENE_CENTER[0], seat.position[2] - SCENE_CENTER[2]);
    const camR = Math.hypot(cam[0] - SCENE_CENTER[0], cam[2] - SCENE_CENTER[2]);
    expect(camR).toBeGreaterThan(seatR);
  });

  it('sits above the model, at about shoulder height', () => {
    expect(cam[1]).toBeGreaterThan(seat.position[1]);
    expect(cam[1] - seat.position[1]).toBeLessThan(1.5);
  });

  it('is over the model\'s LEFT shoulder, not its right', () => {
    // The figure faces the Well, so its left is worldUp x facing. Getting
    // this backwards lands on the right shoulder, which looks deliberate
    // and is wrong. Measured as the sign of the offset along that axis.
    const len = Math.hypot(SCENE_CENTER[0] - seat.position[0], SCENE_CENTER[2] - seat.position[2]);
    const fx = (SCENE_CENTER[0] - seat.position[0]) / len;
    const fz = (SCENE_CENTER[2] - seat.position[2]) / len;
    const lx = fz;
    const lz = -fx;
    const offX = cam[0] - seat.position[0];
    const offZ = cam[2] - seat.position[2];
    expect(offX * lx + offZ * lz).toBeGreaterThan(0);
  });

  it('gives each watcher their own shoulder, not a shared one', () => {
    const a = getSpectatorCameraPosition(0, 3, 4);
    const b = getSpectatorCameraPosition(2, 3, 4);
    expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeGreaterThan(0.5);
  });

  it('stays put rather than throwing when the index is out of range', () => {
    expect(() => getSpectatorCameraPosition(99, 3, 4)).not.toThrow();
    expect(getSpectatorCameraPosition(99, 3, 4)).toHaveLength(3);
  });
});

describe('atStandardCameraDistance', () => {
  // The spectator shoulder-cam is built by offsetting from a seat, which put
  // it closer to the table than the view every other player gets. It is now
  // pushed out along its own line of sight, so the framing is untouched and
  // only the distance changes.
  const W = 1920;
  const H = 1080;
  const pose = getSpectatorCameraPosition(1, 3, 4);
  const pushed = atStandardCameraDistance(pose, W, H);

  const armLength = (p: [number, number, number]) =>
    Math.hypot(p[0] - SCENE_CENTER[0], p[1] - SCENE_CENTER[1], p[2] - SCENE_CENTER[2]);

  it('stands exactly as far from the Well as the ordinary camera does', () => {
    expect(armLength(pushed)).toBeCloseTo(standardCameraDistance(W, H), 6);
    expect(armLength(pushed)).toBeCloseTo(armLength(getCameraTargetPosition(W, H)), 6);
  });

  it('actually moved the shoulder-cam further out, which was the complaint', () => {
    expect(armLength(pushed)).toBeGreaterThan(armLength(pose));
  });

  it('keeps the pose pointing from precisely where it did before', () => {
    // Same direction from the look-at point => same framing, just further
    // back. Compared as a unit-vector dot product; anything less than 1 here
    // means the shoulder view has been swung somewhere else.
    const dir = (p: [number, number, number]) => {
      const v = [p[0] - SCENE_CENTER[0], p[1] - SCENE_CENTER[1], p[2] - SCENE_CENTER[2]];
      const len = Math.hypot(v[0], v[1], v[2]);
      return v.map((c) => c / len);
    };
    const a = dir(pose);
    const b = dir(pushed);
    expect(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]).toBeCloseTo(1, 9);
  });

  it('backs a watcher off on a phone just like it does anyone else', () => {
    const portrait = atStandardCameraDistance(pose, 430, 932);
    expect(armLength(portrait)).toBeGreaterThan(armLength(pushed));
    expect(armLength(portrait)).toBeCloseTo(standardCameraDistance(430, 932), 6);
  });

  it('grows with the seat circle, via the same radiusFactor', () => {
    expect(armLength(atStandardCameraDistance(pose, W, H, 1.3)))
      .toBeGreaterThan(armLength(pushed));
  });

  it('falls back to the ordinary view for a pose sat on the look-at point', () => {
    const degenerate = atStandardCameraDistance([...SCENE_CENTER], W, H);
    expect(degenerate).toEqual(getCameraTargetPosition(W, H));
  });
});
