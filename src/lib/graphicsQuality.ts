import { IS_NATIVE_BUILD } from '@/lib/buildTarget';
import { hdPreferred, setHdPreference } from '@/lib/hdTextures';
import { getTextMode, setTextMode } from '@/lib/textMode';

// How the game is drawn on this device (Mikael, 2026-10-11): Text (no 3D,
// lib/textMode.ts), SD -- the standard web textures -- or HD (lib/
// hdTextures.ts), for an account that has it. The scenes read it once as
// they load (useHdTextures pins its answer; the pages pick text or 3D on
// mount), so a change takes effect by loading the page again.

export type GraphicsQuality = 'text' | 'sd' | 'hd';

/** This device's choice, given whether the account may have HD. */
export function currentQuality(hdAllowed: boolean): GraphicsQuality {
  if (getTextMode()) return 'text';
  return hdAllowed && hdPreferred() ? 'hd' : 'sd';
}

/** Remember `quality` for this device. */
export function setQuality(quality: GraphicsQuality): void {
  setTextMode(quality === 'text');
  if (quality !== 'text') setHdPreference(quality === 'hd');
}

/** Whether HD is there without asking the server: the paid apps bundle it. */
export function hdAlways(): boolean {
  return IS_NATIVE_BUILD;
}
