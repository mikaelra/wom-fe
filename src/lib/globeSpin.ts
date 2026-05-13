// Shared signed angular velocity (radians/sec) of the world-map camera around
// the globe. The world map writes to this each frame; the HUD button models
// read from it to tilt opposite to the spin direction.

let velocity = 0;

export function setGlobeSpin(v: number) {
  velocity = v;
}

export function getGlobeSpin() {
  return velocity;
}
