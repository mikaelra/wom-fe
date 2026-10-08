'use client';

import { useEffect, useState } from 'react';
import { IS_NATIVE_BUILD } from '@/lib/buildTarget';
import { HD_DOWNLOAD_MB, hdPreferred, hdUnlocked, setHdPreference } from '@/lib/hdTextures';

// Settings -> Graphics: HD textures on or off (lib/hdTextures.ts). In the
// paid apps the toggle is always there and starts on. On the web it is there
// once the account has HD -- today by being connected to a Steam account
// that owns the game -- and starts off; before that the panel says how to
// get it.

export default function HdTexturesPanel() {
  const [unlocked, setUnlocked] = useState<boolean | null>(IS_NATIVE_BUILD ? true : null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(hdPreferred());
    if (IS_NATIVE_BUILD) return;
    let live = true;
    hdUnlocked().then((u) => live && setUnlocked(u));
    return () => { live = false; };
  }, []);

  if (unlocked === null) return null;

  return (
    <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl p-6 mt-6">
      <h2 className="text-lg font-bold tracking-wide">Graphics</h2>
      {unlocked ? (
        <>
          <label className="flex items-center gap-3 cursor-pointer select-none mt-4">
            <input
              type="checkbox"
              checked={on}
              onChange={() => { setHdPreference(!on); setOn(!on); }}
              className="w-5 h-5 accent-amber-500 cursor-pointer"
            />
            <span className="text-base font-semibold">HD textures</span>
          </label>
          <p className="text-sm text-white/70 mt-3 leading-relaxed">
            {IS_NATIVE_BUILD
              ? 'Load HD textures.' // bundled in the app: nothing to download
              : `Load HD textures. Will start to load on entering earth or city scene. Warning: ${HD_DOWNLOAD_MB} megabytes gets downloaded.`}
          </p>
        </>
      ) : (
        <p className="text-sm text-white/70 mt-3 leading-relaxed">
          HD textures come with the game on Steam. Log in to this account in the Steam version to
          unlock them here.
        </p>
      )}
    </div>
  );
}
