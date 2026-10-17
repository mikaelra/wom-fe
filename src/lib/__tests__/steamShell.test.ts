import { describe, expect, it, vi } from 'vitest';

import { isSteamClient, quitGame, shouldOpenExitPrompt } from '@/lib/steamShell';

const steamWindow = (quit = vi.fn()) =>
  ({ wom: { isSteam: true, quit, getSteamInfo: vi.fn() } }) as unknown as Window;

const esc = (over: Partial<{ key: string; repeat: boolean; defaultPrevented: boolean; target: unknown }> = {}) =>
  ({ key: 'Escape', repeat: false, defaultPrevented: false, target: null, ...over }) as Parameters<
    typeof shouldOpenExitPrompt
  >[0];

const doc = (modalOpen = false) => ({ querySelector: () => (modalOpen ? ({} as Element) : null) });

describe('isSteamClient', () => {
  it('is true only inside the Steam shell', () => {
    expect(isSteamClient(steamWindow())).toBe(true);
    expect(isSteamClient({} as Window)).toBe(false);
    expect(isSteamClient(undefined)).toBe(false);
  });
});

describe('quitGame', () => {
  it('asks the shell to quit', () => {
    const quit = vi.fn();
    quitGame(steamWindow(quit));
    expect(quit).toHaveBeenCalledOnce();
  });

  it('does nothing outside the shell', () => {
    expect(() => quitGame({} as Window)).not.toThrow();
    expect(() => quitGame(undefined)).not.toThrow();
  });
});

describe('shouldOpenExitPrompt', () => {
  it('opens on a plain Escape with nothing else open', () => {
    expect(shouldOpenExitPrompt(esc(), doc())).toBe(true);
  });

  it('ignores other keys, repeats and handled presses', () => {
    expect(shouldOpenExitPrompt(esc({ key: 'Enter' }), doc())).toBe(false);
    expect(shouldOpenExitPrompt(esc({ repeat: true }), doc())).toBe(false);
    expect(shouldOpenExitPrompt(esc({ defaultPrevented: true }), doc())).toBe(false);
  });

  it('ignores Escape while typing', () => {
    expect(shouldOpenExitPrompt(esc({ target: { tagName: 'INPUT' } }), doc())).toBe(false);
    expect(shouldOpenExitPrompt(esc({ target: { tagName: 'TEXTAREA' } }), doc())).toBe(false);
    expect(shouldOpenExitPrompt(esc({ target: { isContentEditable: true } }), doc())).toBe(false);
  });

  it('leaves Escape to a dialog that is already open', () => {
    expect(shouldOpenExitPrompt(esc(), doc(true))).toBe(false);
  });
});
