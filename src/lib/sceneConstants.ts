// Shared 3D scene layout for home and lobby
export const TABLE_POSITION: [number, number, number] = [0, 3.15, 0];
export const SCENE_CENTER: [number, number, number] = [0, 3.2, 0];

export const MAX_PLAYERS = 24;
const BASE_PLAYER_RADIUS = 2.1;
export const PLAYER_Y = 3.2;

// Radius grows by 10% for every 6 players: 1–6 → base, 7–12 → +10%, 13–18 → +20%, etc.
function playerRadius(count: number): number {
  return BASE_PLAYER_RADIUS * (1 + Math.floor((count - 1) / 6) * 0.15);
}

// Returns `count` seats evenly distributed around The Well.
// Slot 0 is at the near-camera side (z+), proceeding clockwise.
// Call this with the live player count so spacing is always even.
export function getPlayerPositions(count: number): { position: [number, number, number]; rotation: [number, number, number] }[] {
  const radius = playerRadius(count);
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count;
    return {
      position: [
        radius * Math.sin(angle),
        PLAYER_Y,
        radius * Math.cos(angle),
      ] as [number, number, number],
      // LobbyScene adds another Math.PI/2 at render time, so storing angle + Math.PI/2
      // here produces a final rotation of angle + Math.PI — facing inward toward center.
      rotation: [0, angle + Math.PI / 2, 0] as [number, number, number],
    };
  });
}

// Boss fight layout: Hades is fixed on the far side (z-), facing the players.
export function getBossPosition(): { position: [number, number, number]; rotation: [number, number, number] } {
  const angle = Math.PI; // far side (z-)
  return {
    position: [
      BASE_PLAYER_RADIUS * Math.sin(angle),
      PLAYER_Y,
      BASE_PLAYER_RADIUS * Math.cos(angle),
    ] as [number, number, number],
    rotation: [0, angle + Math.PI / 2, 0] as [number, number, number],
  };
}

// Returns `count` seats spread evenly across the near half of The Well (z+ side).
// Players are centered so adding new ones doesn't move Hades.
export function getBossPlayerPositions(count: number): { position: [number, number, number]; rotation: [number, number, number] }[] {
  return Array.from({ length: count }, (_, i) => {
    // Distribute across -π/2 … +π/2 with equal spacing, centered
    const angle = count === 1 ? 0 : -Math.PI / 2 + (Math.PI * (i + 0.5)) / count;
    return {
      position: [
        BASE_PLAYER_RADIUS * Math.sin(angle),
        PLAYER_Y,
        BASE_PLAYER_RADIUS * Math.cos(angle),
      ] as [number, number, number],
      rotation: [0, angle + Math.PI / 2, 0] as [number, number, number],
    };
  });
}

// Position "in front of" each seat (further from table) for choice labels.
export const CHOICE_LABEL_OFFSET = 0.6;
export function getPlayerFrontPositions(count: number): [number, number, number][] {
  const radius = playerRadius(count);
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count;
    return [
      (radius + CHOICE_LABEL_OFFSET) * Math.sin(angle),
      PLAYER_Y,
      (radius + CHOICE_LABEL_OFFSET) * Math.cos(angle),
    ] as [number, number, number];
  });
}

export const BASE_FOV = 75;

// Initial horizontal orbit of the lobby camera. Rotating the start angle ~30°
// opens up empty space on the player's left where the welcome-tour bubbles sit.
// Flip the sign to turn the other way; the bubble placement follows this value.
export const INITIAL_CAMERA_YAW = -Math.PI / 6;

export function getResponsiveFov(width: number, height: number): number {
  const aspect = width / height;
  return aspect > 1.5 ? 82 : aspect > 1 ? 78 : 75;
}
export function getCameraTargetPosition(width: number, height: number): [number, number, number] {
  const aspect = width / height;
  const dist = aspect > 1.5 ? 3.2 : 3.5;
  const elevation = aspect > 1 ? 2.2 : 2.5;
  return [0, SCENE_CENTER[1] + elevation, dist];
}
