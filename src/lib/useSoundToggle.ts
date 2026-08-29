import { useSyncExternalStore } from 'react';
import {
  isMusicEnabled,
  setMusicEnabled,
  isSfxEnabled,
  setSfxEnabled,
  subscribeSoundSettings,
} from './soundSettings';

const getServerSnapshot = () => true;

export function useMusicEnabled(): [boolean, (enabled: boolean) => void] {
  const enabled = useSyncExternalStore(subscribeSoundSettings, isMusicEnabled, getServerSnapshot);
  return [enabled, setMusicEnabled];
}

export function useSfxEnabled(): [boolean, (enabled: boolean) => void] {
  const enabled = useSyncExternalStore(subscribeSoundSettings, isSfxEnabled, getServerSnapshot);
  return [enabled, setSfxEnabled];
}
