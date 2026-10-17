'use client';

import { useEffect, useState } from 'react';
import { hdUnlocked } from '@/lib/hdTextures';
import { currentQuality, hdAlways, setQuality, type GraphicsQuality } from '@/lib/graphicsQuality';
import GraphicsQualityIcon, { QUALITY_LABEL } from '@/components/hud/GraphicsQualityIcon';
import ExpandingChoice from '@/components/hud/ExpandingChoice';
import { reloadPage } from '@/lib/reloadPage';

// The graphics quality on the Earth and city scenes (Mikael, 2026-10-11): a
// round button showing the current one -- LD (text mode), SD or HD -- that
// widens to the qualities this account can have (ExpandingChoice): HD only
// once it has HD (lib/hdTextures.ts). Choosing another
// loads the page again in it (lib/graphicsQuality.ts).


export default function GraphicsQualityButton({ hidden = false }: { hidden?: boolean }) {
  const [hd, setHd] = useState(hdAlways);
  const [quality, setQualityState] = useState<GraphicsQuality | null>(null);

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

  if (!quality || hidden) return null;
  const qualities: GraphicsQuality[] = hd ? ['text', 'sd', 'hd'] : ['text', 'sd'];

  return (
    <ExpandingChoice
      label="Graphics"
      value={quality}
      choices={qualities.map((q) => ({ value: q, label: QUALITY_LABEL[q], node: <GraphicsQualityIcon quality={q} /> }))}
      onChoose={(q) => {
        setQuality(q);
        reloadPage();
      }}
      className="bg-black/50 border border-white/20 hover:bg-black/70"
    />
  );
}
