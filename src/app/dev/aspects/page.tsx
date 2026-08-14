import Link from 'next/link';
import { allPresets } from '@/lib/astrologyPresets';

export const metadata = { title: 'Aspect presets — World of Mythos' };

// Visual-inspection harness for docs/ASPECTS_PLAN.md §6.3. Plain index of
// every registered preset, linking to `/?astro=<id>` -- the homescreen
// already mounts WorldMap, and astrology.ts's getSky() reads the `astro`
// query param on its first call. Inert without the param and undiscoverable,
// same call the original conjunction-lighting PR (#291) made leaving
// DEBUG_FORCED_CONJUNCTIONS in place -- left enabled in production builds
// rather than gated behind an env flag. An unknown preset id just falls
// back to the live sky (astrologyPresets.ts's resolvePreset), never crashes.
//
// Preset links are plain <a> tags, not next/link -- getSky()'s Sky
// singleton is deliberately session-length (astrology.ts §3.2), computed
// once and cached for the rest of the browser session. A next/link
// transition between two `/?astro=` URLs is a client-side SPA navigation
// that keeps the JS module alive, so the second click would silently
// return the FIRST preset's already-cached sky. A plain <a> forces a full
// page load, which resets the module (and the cache) every time -- the
// only way to actually compare two presets in the same tab.
export default function AspectPresetsPage() {
  const presets = allPresets();

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 text-white p-6 flex flex-col items-center">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold tracking-wide">Aspect presets</h1>
          <Link
            href="/"
            className="bg-white/10 backdrop-blur-sm border border-white/20 text-white px-3 py-2 rounded-lg text-lg font-semibold hover:bg-white/20 transition-colors no-underline"
            aria-label="Back to Home"
          >
            🏠
          </Link>
        </div>

        <p className="text-sm text-white/60 mb-6">
          Each link opens the world map pinned to that sky. See docs/ASPECTS_PLAN.md §6.2 for
          the full acceptance criteria this list is meant to cover.
        </p>

        <ul className="space-y-3">
          {presets.map((preset) => (
            <li
              key={preset.id}
              className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl p-4"
            >
              <a
                href={`/?astro=${preset.id}`}
                className="text-lg font-semibold text-blue-300 hover:underline no-underline"
              >
                {preset.label}
              </a>
              <p className="text-xs text-white/40 mt-1">/?astro={preset.id}</p>
              {preset.note && (
                <p className="text-sm text-white/70 mt-2 leading-relaxed">{preset.note}</p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
