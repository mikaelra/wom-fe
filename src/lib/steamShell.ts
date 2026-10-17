/**
 * The Electron/Steam shell's bridge (electron/preload.js, typed in
 * src/types/wom-shell.d.ts). Absent on the web and in the Capacitor build,
 * so everything here is a no-op there.
 */

type ShellWindow = Pick<Window, 'wom'>;

export function isSteamClient(w: ShellWindow | undefined = globalThis.window): boolean {
  return !!w?.wom?.isSteam;
}

/** Closes the game. Only the Steam client can; elsewhere it does nothing. */
export function quitGame(w: ShellWindow | undefined = globalThis.window): void {
  w?.wom?.quit?.();
}

type KeyLike = Pick<KeyboardEvent, 'key' | 'repeat' | 'defaultPrevented'> & {
  target: EventTarget | null;
};

/**
 * Whether an Escape press should open the exit prompt: not a held-down
 * repeat, not one another handler already consumed, not while typing, and
 * not while some other dialog is open -- that dialog's own Escape closes it.
 */
export function shouldOpenExitPrompt(e: KeyLike, doc: Pick<Document, 'querySelector'>): boolean {
  if (e.key !== 'Escape' || e.repeat || e.defaultPrevented) return false;
  const el = e.target as { tagName?: string; isContentEditable?: boolean } | null;
  if (el?.isContentEditable) return false;
  if (el?.tagName && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return false;
  return !doc.querySelector('[aria-modal="true"]');
}
