'use client';

import { useEffect, useRef, useState } from 'react';
import { hdUnlocked } from '@/lib/hdTextures';
import { currentQuality, hdAlways, setQuality, type GraphicsQuality } from '@/lib/graphicsQuality';
import GraphicsQualityIcon, { QUALITY_LABEL } from '@/components/hud/GraphicsQualityIcon';

// The graphics quality on the Earth and city scenes (Mikael, 2026-10-11): a
// round button showing the current one -- a low-res cube (SD), a high-res
// cube (HD), a T (Text) -- that opens an oval of the qualities this account
// can have: HD only once it has HD (lib/hdTextures.ts). Choosing another
// loads the page again in it (lib/graphicsQuality.ts).

const chip = 'w-9 h-9 rounded-full flex items-center justify-center cursor-pointer';

export default function GraphicsQualityButton({ hidden = false }: { hidden?: boolean }) {
  const [hd, setHd] = useState(hdAlways);
  const [quality, setQualityState] = useState<GraphicsQuality | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQualityState(currentQuality(hdAlways()));
    if (hdAlways()) return;
    let live = true;
    hdUnlocked().then((u) => {
      if (!live) return;
      setHd(u);
      setQualityState(currentQuality(u));
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!quality || hidden) return null;
  const choices: GraphicsQuality[] = hd ? ['text', 'sd', 'hd'] : ['text', 'sd'];

  const choose = (q: GraphicsQuality) => {
    setOpen(false);
    if (q === quality) return;
    setQuality(q);
    window.location.reload();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Graphics: ${QUALITY_LABEL[quality]}`}
        aria-expanded={open}
        title={`Graphics: ${QUALITY_LABEL[quality]}`}
        className={`${chip} bg-black/50 border border-white/20 hover:bg-black/70`}
      >
        <GraphicsQualityIcon quality={quality} />
      </button>
      {open && (
        <div
          role="radiogroup"
          aria-label="Graphics"
          className="absolute top-full right-0 mt-2 flex items-center gap-1 p-1 rounded-full bg-black/80 border border-white/20 backdrop-blur-sm shadow-lg"
        >
          {choices.map((q) => (
            <button
              key={q}
              type="button"
              role="radio"
              aria-checked={q === quality}
              aria-label={QUALITY_LABEL[q]}
              title={QUALITY_LABEL[q]}
              onClick={() => choose(q)}
              className={`${chip} ${q === quality ? 'bg-white/25 ring-1 ring-white/60' : 'hover:bg-white/10'}`}
            >
              <GraphicsQualityIcon quality={q} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
