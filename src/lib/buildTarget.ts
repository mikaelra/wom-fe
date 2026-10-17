// True for a Capacitor (mobile) / Electron (Steam) build -- see
// next.config.ts's own `isNative` and docs/MOBILE_AND_STEAM_PLAN.md §5.3.
// That check reads plain process.env.BUILD_TARGET, which is a build-time
// server-side value Next does not inline into client bundles; next.config.ts's
// `env` block mirrors it into NEXT_PUBLIC_BUILD_TARGET specifically so this
// one can be read from client components too (e.g. to pick the native/Steam
// asset tier -- see WorldMap.tsx's milky way and earth textures).
export const IS_NATIVE_BUILD = process.env.NEXT_PUBLIC_BUILD_TARGET === 'native';
