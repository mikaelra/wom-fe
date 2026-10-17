/**
 * Where the bossfight stands inside the temple (docs/CITY_SCENE_PLAN.md §5.2).
 *
 * Pure, because the one number that matters here was derived rather than
 * eyeballed and the derivation is worth keeping next to it.
 */

/**
 * How far above temple.glb's own base the figures stand.
 *
 * NOT a guess. LobbyScene places the temple at y = 4, and the model's
 * bounding box (measured from the GLB) starts 8.07 below its origin, putting
 * its base at -4.07. The lobby's players stand at PLAYER_Y = 3.2. The
 * difference, 7.27, is the height of the temple's floor above its base as
 * the lobby has always framed it -- so reusing it puts the city's tableau on
 * the same floor the lobby's stands on, rather than on a number somebody
 * picked until it looked right.
 */
export const TEMPLE_TABLEAU_LIFT = 3.2 - (4 - 8.07);

/**
 * The scales LobbyScene's avatars are actually drawn at
 * (PlayerAvatars.tsx: `scale={isBoss ? 2.88 : 0.6}`).
 *
 * Sourced from there rather than picked, because picking is how the first
 * version went wrong: it used 0.15, copied from the players-at-a-table demo
 * that step 12 deleted as dead code. A frog model is 1.90 units tall, so
 * that drew a player 0.29 units high -- about a third of a degree from
 * across the bay, which is to say invisible. Hades came out four times
 * SMALLER than the players from the same mistake, because hades_v4.glb is a
 * unit-sized model where the frogs are not.
 */
export const LOBBY_FIGURE_SCALE = 0.6;
export const LOBBY_BOSS_SCALE = 2.88;

/**
 * How much bigger than life the tableau is drawn.
 *
 * Honestly a cheat, and worth saying so. The lobby is viewed from about four
 * units away and the city's temple from forty-five, so matching the angle a
 * figure subtends in the lobby would need roughly 11x -- at which point the
 * Well alone is 130 units wide and bursts out through the temple's columns.
 * This is the compromise: big enough to read as people at a glance, small
 * enough that the whole arrangement still fits inside the building. It
 * scales the entire group, so the lobby's composition is preserved exactly
 * and only its size changes.
 */
export const TABLEAU_ZOOM = 2.4;

/**
 * Where to put the tableau group so its floor lands on the temple's floor.
 *
 * The lobby's seat helpers return y = PLAYER_Y, and the group is scaled, so
 * the offset has to account for the zoom -- a scaled group multiplies its
 * children's local y as well as their spacing.
 */
export function tableauGroupY(landLevel: number, playerY: number): number {
  return landLevel + TEMPLE_TABLEAU_LIFT - playerY * TABLEAU_ZOOM;
}

/**
 * How many player figures the city draws.
 *
 * A bossfight holds up to 24. Each figure is its own GLTF clone with its own
 * draw calls, and at 45 units a dozen already overlap into a crowd -- past
 * that they cost frames and add nothing the eye can separate.
 */
export const CITY_TABLEAU_MAX_FIGURES = 12;
