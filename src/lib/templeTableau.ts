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
 * How many player figures the city draws.
 *
 * A bossfight holds up to 24. Each figure is its own GLTF clone with its own
 * draw calls, and at 45 units a dozen already overlap into a crowd -- past
 * that they cost frames and add nothing the eye can separate.
 */
export const CITY_TABLEAU_MAX_FIGURES = 12;
