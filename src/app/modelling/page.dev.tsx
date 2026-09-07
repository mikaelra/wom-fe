'use client';

import { Suspense, useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Canvas } from '@react-three/fiber';
import dynamic from 'next/dynamic';
import {
  MODELLING_MODELS,
  findModellingModel,
  type ModellingModelId,
} from '@/lib/modelling';
import { MODELLING_FOV, type MeasuredModel } from '@/components/modelling/ModellingScene';
import PromptBox from '@/components/modelling/PromptBox';

const ModellingScene = dynamic(() => import('@/components/modelling/ModellingScene'), { ssr: false });

/**
 * /modelling -- a scratch stage for sculpting the procedural buildings.
 *
 * TEMPORARY. It exists so the Senate (as the ranked arena) and the Market
 * can be iterated on without walking into Athens and waiting for a sky, a
 * terrain, a sun and a signpost to load first, and so the two can be
 * compared side by side in the same light. It is not linked from anywhere
 * in the game; you reach it by typing the URL. When the real models land,
 * this route, its scene and src/lib/modelling.ts all go.
 *
 * A query param (?model=ranked) rather than a path segment, for the same
 * reason /city and /lobby use one: a dynamic segment cannot be statically
 * exported for the native build (docs/MOBILE_AND_STEAM_PLAN.md §5.3).
 */
export default function ModellingPage() {
  return (
    <Suspense fallback={null}>
      <ModellingPageContent />
    </Suspense>
  );
}

function ModellingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const model = findModellingModel(searchParams.get('model'));

  const [spin, setSpin] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [measured, setMeasured] = useState<MeasuredModel | null>(null);
  // Bumped to re-frame the camera. The scene never re-frames itself on a
  // size change -- an edit that makes the building taller should look
  // taller, not be silently backed away from until it isn't.
  const [refitSignal, setRefitSignal] = useState(0);
  // Stable, so the scene's measuring layout effect does not re-run on every
  // render of this page (it depends on the callback).
  const handleMeasure = useCallback((m: MeasuredModel) => setMeasured(m), []);

  const select = (id: ModellingModelId) => {
    // replace, not push: flicking between three models should not bury the
    // page you came from under a dozen history entries.
    router.replace(`/modelling?model=${id}`);
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: '#0c1220' }}>
      <Canvas
        shadows
        camera={{ position: [0, 12, 40], fov: MODELLING_FOV }}
        dpr={[1, 2]}
        gl={{ powerPreference: 'high-performance' }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <ModellingScene
          key={model.id}
          modelId={model.id}
          spin={spin}
          wireframe={wireframe}
          refitSignal={refitSignal}
          onMeasure={handleMeasure}
        />
      </Canvas>

      {/* Controls. Plain DOM over the canvas rather than FreshHtml: none of
          this is anchored to anything in the scene. */}
      <div className="absolute top-0 left-0 p-4 flex flex-col gap-3 max-w-sm pointer-events-none">
        <div className="flex flex-wrap gap-2 pointer-events-auto">
          {MODELLING_MODELS.map((m) => {
            const active = m.id === model.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => select(m.id)}
                aria-pressed={active}
                className="px-3 py-2 rounded-lg text-sm font-semibold border cursor-pointer transition-colors backdrop-blur-sm"
                // Inline, not a Tailwind class: the accent comes from data,
                // and an interpolated class name is invisible to the
                // scanner and renders unstyled (see AuthGatePopup's ACCENT).
                style={{
                  borderColor: active ? m.accent : 'rgba(255,255,255,0.22)',
                  color: active ? m.accent : 'rgba(255,255,255,0.75)',
                  background: active ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0.5)',
                  boxShadow: active ? `0 0 14px -4px ${m.accent}` : 'none',
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-white/60 bg-black/50 rounded-lg px-3 py-2 backdrop-blur-sm pointer-events-auto">
          {model.blurb}
        </p>

        <div className="flex flex-wrap gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={() => setSpin((s) => !s)}
            aria-pressed={spin}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/20 bg-black/50 text-white/80 cursor-pointer hover:bg-black/70 transition-colors"
          >
            {spin ? 'Spin: on' : 'Spin: off'}
          </button>
          <button
            type="button"
            onClick={() => setWireframe((w) => !w)}
            aria-pressed={wireframe}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/20 bg-black/50 text-white/80 cursor-pointer hover:bg-black/70 transition-colors"
          >
            {wireframe ? 'Wireframe: on' : 'Wireframe: off'}
          </button>
          <button
            type="button"
            onClick={() => setRefitSignal((n) => n + 1)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/20 bg-black/50 text-white/80 cursor-pointer hover:bg-black/70 transition-colors"
          >
            Refit camera
          </button>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/20 bg-black/50 text-white/80 cursor-pointer hover:bg-black/70 transition-colors"
          >
            &larr; Back to Earth
          </button>
        </div>
      </div>

      {/* The prompt box: type a change, whoever is editing the models is
          tailing the file it writes to, and their edit comes back through
          Fast Refresh without a page change. */}
      <PromptBox />

      {/* Measured off the real geometry, so it stays honest as the buildings
          are re-sculpted -- and so the arena's footprint can be checked
          against lib/rankedArena.ts by eye. */}
      <div className="absolute bottom-0 left-0 p-4 text-[11px] leading-relaxed text-white/50 font-mono pointer-events-none">
        {measured && (
          <p>
            {measured.width.toFixed(2)} w &times; {measured.depth.toFixed(2)} d &times;{' '}
            {measured.height.toFixed(2)} h units &middot; grid squares are 1 unit
          </p>
        )}
        <p>drag to orbit &middot; scroll to zoom &middot; right-drag to pan</p>
      </div>
    </div>
  );
}
