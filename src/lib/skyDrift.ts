// How far the globe's sky has turned so far (docs/MERCHANT_PLAN.md) --
// the Y rotation WorldMap's PlanetSprites group has reached, written by it
// every frame. The globe itself stays put and the sky turns around it, so
// anything that has to stand under a body in that sky (a merchant marker
// under the Moon) reads this rather than keeping its own count, which
// would start from its own mount and fall out of step.
export const skyDrift = { angle: 0 };
