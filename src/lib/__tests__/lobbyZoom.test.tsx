import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultLobbyZoom, isPhoneView, MAX_ZOOM, PHONE_ZOOM } from '@/lib/lobbyZoom';

const setScreen = (width: number, coarse: boolean) => {
  vi.stubGlobal('innerWidth', width);
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: coarse && q.includes('coarse'), media: q }));
};

afterEach(() => vi.unstubAllGlobals());

describe('lobbyZoom', () => {
  it('lets the camera out twice as far as before', () => {
    expect(MAX_ZOOM).toBe(6);
    expect(PHONE_ZOOM).toBe(3);
  });

  it('starts a phone at the old furthest, a PC at the usual framing', () => {
    setScreen(390, true);
    expect(isPhoneView()).toBe(true);
    expect(defaultLobbyZoom()).toBe(3);
    setScreen(1440, false);
    expect(defaultLobbyZoom()).toBe(1);
    setScreen(700, false); // a narrow window counts too
    expect(defaultLobbyZoom()).toBe(3);
  });
});
