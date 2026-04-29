// Shared 3D scene layout for home and lobby
export const TABLE_POSITION: [number, number, number] = [0, 3.15, 0];
export const SCENE_CENTER: [number, number, number] = [0, 3.2, 0];

const MAX_PLAYERS = 12;
const PLAYER_RADIUS = 1.4;
const PLAYER_Y = 3.2;

// 12 seats evenly distributed in a circle around The Well.
// Slot 0 is at the near-camera side (z+), proceeding clockwise.
export const PLAYER_POSITIONS: { position: [number, number, number]; rotation: [number, number, number] }[] =
  Array.from({ length: MAX_PLAYERS }, (_, i) => {
    const angle = (2 * Math.PI * i) / MAX_PLAYERS;
    return {
      position: [
        PLAYER_RADIUS * Math.sin(angle),
        PLAYER_Y,
        PLAYER_RADIUS * Math.cos(angle),
      ] as [number, number, number],
      // rotation[1] + Math.PI/2 is applied in LobbyScene, so store angle + Math.PI/2
      // so the final value (angle + Math.PI) faces the frog inward toward the center.
      rotation: [0, angle + Math.PI / 2, 0] as [number, number, number],
    };
  });

// Position "in front of" each seat (further from table) for choice labels
export const CHOICE_LABEL_OFFSET = 0.6;
export const PLAYER_FRONT_POSITIONS: [number, number, number][] =
  Array.from({ length: MAX_PLAYERS }, (_, i) => {
    const angle = (2 * Math.PI * i) / MAX_PLAYERS;
    return [
      (PLAYER_RADIUS + CHOICE_LABEL_OFFSET) * Math.sin(angle),
      PLAYER_Y,
      (PLAYER_RADIUS + CHOICE_LABEL_OFFSET) * Math.cos(angle),
    ] as [number, number, number];
  });

export const BASE_FOV = 75;
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
