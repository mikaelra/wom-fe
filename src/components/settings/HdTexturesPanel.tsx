'use client';

import { useEffect, useState } from 'react';
import { IS_NATIVE_BUILD } from '@/lib/buildTarget';
import { HD_DOWNLOAD_MB, hdPreferred, hdUnlocked, setHdPreference } from '@/lib/hdTextures';
import { getTextMode, setTextMode } from '@/lib/textMode';

// Settings -> Graphics: one choice of how the game is drawn (Mikael,
// 2026-10-11) -- LD (text mode, lib/textMode.ts, no 3D), SD, or HD textures
// (lib/hdTextures.ts). HD is offered once the account has it: always in the
// paid apps, where it is also the default; on the web once the account is
// connected to a Steam account that owns the game or to the Apple account
// that bought the iOS app -- before that the panel says how to get it. SD is
// the web's default.

type Graphics = 'text' | 'sd' | 'hd';

const radio = 'w-5 h-5 accent-amber-500 cursor-pointer';
const note = 'text-sm text-white/70 mt-1 ml-8 leading-relaxed';

export default function HdTexturesPanel() {
  const [unlocked, setUnlocked] = useState<boolean | null>(IS_NATIVE_BUILD ? true : null);
  const [hd, setHd] = useState(false);
  const [text, setText] = useState(false);

  useEffect(() => {
    setHd(hdPreferred());
    setText(getTextMode());
    if (IS_NATIVE_BUILD) return;
    let live = true;
    hdUnlocked().then((u) => live && setUnlocked(u));
    return () => {
      live = false;
    };
  }, []);

  const chosen: Graphics = text ? 'text' : hd && unlocked ? 'hd' : 'sd';
  const choose = (g: Graphics) => {
    setTextMode(g === 'text');
    setText(g === 'text');
    if (g !== 'text') {
      setHdPreference(g === 'hd');
      setHd(g === 'hd');
    }
  };

  const option = (g: Graphics, label: string) => (
    <label className="flex items-center gap-3 cursor-pointer select-none mt-4">
      <input type="radio" name="graphics" checked={chosen === g} onChange={() => choose(g)} className={radio} />
      <span className="text-base font-semibold">{label}</span>
    </label>
  );

  return (
    <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl p-6 mt-6">
      <h2 className="text-lg font-bold tracking-wide">Graphics</h2>
      <div role="radiogroup" aria-label="Graphics">
        {option('text', 'LD')}
        <p className={note}>Play matches as text, without 3D.</p>
        {option('sd', 'SD')}
        {unlocked && (
          <>
            {option('hd', 'HD')}
            <p className={note}>
              {IS_NATIVE_BUILD
                ? 'Load HD textures.' // bundled in the app: nothing to download
                : `Load HD textures (${HD_DOWNLOAD_MB}mb). Will start to load on entering earth or city scene.`}
            </p>
          </>
        )}
      </div>
      {unlocked === false && (
        <p className="text-sm text-white/70 mt-4 leading-relaxed">
          HD textures come with the game on Steam and iPhone. Log in to this account in the Steam
          version or the iPhone app to unlock them here.
        </p>
      )}
    </div>
  );
}
