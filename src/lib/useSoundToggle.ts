import { useSyncExternalStore } from 'react';
import {
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_SFX_VOLUME,
  getMusicVolume,
  getSfxVolume,
  isMusicEnabled,
  isMusicInBackgroundEnabled,
  isSfxEnabled,
  setMusicEnabled,
  setMusicInBackgroundEnabled,
  setMusicVolume,
  setSfxEnabled,
  setSfxVolume,
  subscribeSoundSettings,
} from './soundSettings';

const getServerSnapshot = () => true;
const getBackgroundServerSnapshot = () => false;
const getMusicVolumeServerSnapshot = () => DEFAULT_MUSIC_VOLUME;
const getSfxVolumeServerSnapshot = () => DEFAULT_SFX_VOLUME;

export function useMusicEnabled(): [boolean, (enabled: boolean) => void] {
  const enabled = useSyncExternalStore(subscribeSoundSettings, isMusicEnabled, getServerSnapshot);
  return [enabled, setMusicEnabled];
}

export function useSfxEnabled(): [boolean, (enabled: boolean) => void] {
  const enabled = useSyncExternalStore(subscribeSoundSettings, isSfxEnabled, getServerSnapshot);
  return [enabled, setSfxEnabled];
}

export function useMusicVolume(): [number, (volume: number) => void] {
  const volume = useSyncExternalStore(
    subscribeSoundSettings,
    getMusicVolume,
    getMusicVolumeServerSnapshot
  );
  return [volume, setMusicVolume];
}

export function useSfxVolume(): [number, (volume: number) => void] {
  const volume = useSyncExternalStore(
    subscribeSoundSettings,
    getSfxVolume,
    getSfxVolumeServerSnapshot
  );
  return [volume, setSfxVolume];
}

export function useMusicInBackground(): [boolean, (enabled: boolean) => void] {
  const enabled = useSyncExternalStore(
    subscribeSoundSettings,
    isMusicInBackgroundEnabled,
    getBackgroundServerSnapshot
  );
  return [enabled, setMusicInBackgroundEnabled];
}
