// Where the city's camera stands and how wide it sees (components/city/
// CityScene.tsx). Apart from the scene so the city page can use them without
// loading three.js -- in text mode it never shows the scene at all.
import { EYE_HEIGHT, LAND_LEVEL } from '@/lib/cityLayout';

/** Where the player stands: eye height above the GROUND, at the origin. Was
 *  measured from the sea until there was ground to stand on. */
export const EYE: [number, number, number] = [0, LAND_LEVEL + EYE_HEIGHT, 0];
/** How far the camera sits from the pin. Small enough to read as rotating in
 *  place, large enough to keep OrbitControls' maths well-conditioned. */
export const EYE_RADIUS = 0.01;
/** Start pose: offset along +Z of the pin, so the default view looks toward
 *  -Z -- where the signpost and both buildings stand. */
export const CITY_CAMERA: [number, number, number] = [EYE[0], EYE[1], EYE[2] + EYE_RADIUS];
/** Wider than the lobby's 75: standing among buildings and looking up wants
 *  more sky in frame than a table-top scene does. */
export const CITY_FOV = 70;
