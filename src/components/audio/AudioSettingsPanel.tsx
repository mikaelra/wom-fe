'use client';

import {
  useMusicEnabled,
  useMusicInBackground,
  useMusicVolume,
  useSfxEnabled,
  useSfxVolume,
} from '@/lib/useSoundToggle';

function VolumeRow({
  label,
  enabled,
  setEnabled,
  volume,
  setVolume,
  muteLabel,
}: {
  label: string;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  volume: number;
  setVolume: (v: number) => void;
  muteLabel: string;
}) {
  return (
    <div>
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={enabled}
          onChange={() => setEnabled(!enabled)}
          className="w-5 h-5 accent-amber-500 cursor-pointer"
          aria-label={muteLabel}
        />
        <span className="text-base font-semibold">{label}</span>
      </label>
      <div className="flex items-center gap-3 mt-2 pl-8">
        <input
          type="range"
          min={0}
          max={100}
          // Stored as 0..1 but driven as 0..100: a step of 0.01 on a range
          // input invites float dust in localStorage for no gain.
          value={Math.round(volume * 100)}
          onChange={(e) => setVolume(Number(e.target.value) / 100)}
          // The slider stays live while muted -- setting a level you are
          // about to unmute into is a normal thing to want -- but dims so
          // it is clear it is not what you are currently hearing.
          className={`flex-1 accent-amber-500 cursor-pointer ${enabled ? '' : 'opacity-40'}`}
          aria-label={`${label} volume`}
        />
        <span className="text-sm text-white/60 tabular-nums w-10 text-right">
          {Math.round(volume * 100)}%
        </span>
      </div>
    </div>
  );
}

/**
 * Music and sound-effect levels. Lives on the settings page but outside its
 * account section on purpose: these are stored per-device in localStorage,
 * so gating them behind a login would mean a guest -- or anyone on a shared
 * machine -- could not turn the music down.
 */
export default function AudioSettingsPanel() {
  const [musicEnabled, setMusicEnabled] = useMusicEnabled();
  const [sfxEnabled, setSfxEnabled] = useSfxEnabled();
  const [musicVolume, setMusicVolume] = useMusicVolume();
  const [sfxVolume, setSfxVolume] = useSfxVolume();
  const [musicInBackground, setMusicInBackground] = useMusicInBackground();

  return (
    <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl p-6 mt-6 flex flex-col gap-5">
      <h2 className="text-lg font-bold tracking-wide">Audio</h2>

      <VolumeRow
        label="Music"
        enabled={musicEnabled}
        setEnabled={setMusicEnabled}
        volume={musicVolume}
        setVolume={setMusicVolume}
        muteLabel={musicEnabled ? 'Mute music' : 'Unmute music'}
      />

      <VolumeRow
        label="Sound effects"
        enabled={sfxEnabled}
        setEnabled={setSfxEnabled}
        volume={sfxVolume}
        setVolume={setSfxVolume}
        muteLabel={sfxEnabled ? 'Mute sound effects' : 'Unmute sound effects'}
      />

      <div>
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={musicInBackground}
            onChange={() => setMusicInBackground(!musicInBackground)}
            className="w-5 h-5 accent-amber-500 cursor-pointer"
            aria-label="Keep playing music in the background"
          />
          <span className="text-base font-semibold">Keep music playing in the background</span>
        </label>
        <p className="text-sm text-white/70 mt-2 pl-8 leading-relaxed">
          Off by default: music stops when you lock your phone or switch to
          another app, the way the rest of the page does. Turn this on to let
          it keep playing.
        </p>
      </div>
    </div>
  );
}
