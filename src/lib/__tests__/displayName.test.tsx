import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({ getConnections: vi.fn() }));

import { getConnections } from '@/lib/api';
import { setStoredAccountToken } from '@/lib/http';
import {
  getShownNamePreference,
  setShownNamePreference,
  shownName,
  steamNameToShow,
} from '@/lib/displayName';

const connections = vi.mocked(getConnections);

const steamClient = {
  wom: {
    isSteam: true as const,
    getSteamTicket: vi.fn(),
    getSteamInfo: vi.fn(async () => ({ enabled: true, steamId: '765', playerName: 'Gaben', appId: 4913070 })),
    quit: vi.fn(),
  },
} as unknown as Pick<Window, 'wom'>;
const browser = {} as Pick<Window, 'wom'>;

beforeEach(() => {
  localStorage.clear();
  setStoredAccountToken(null);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('shown name preference', () => {
  it('defaults to the Steam name in the Steam client and the web name elsewhere', () => {
    expect(getShownNamePreference()).toBeNull();
    expect(shownName(steamClient)).toBe('steam');
    expect(shownName(browser)).toBe('web');
  });

  it('keeps the choice', () => {
    setShownNamePreference('steam');
    expect(shownName(browser)).toBe('steam');
    setShownNamePreference('web');
    expect(shownName(steamClient)).toBe('web');
  });

  it('ignores a stored value it does not know', () => {
    localStorage.setItem('shownName', 'nonsense');
    expect(getShownNamePreference()).toBeNull();
  });
});

describe('steamNameToShow', () => {
  it('is null when the web name is shown', async () => {
    expect(await steamNameToShow(browser)).toBeNull();
    setShownNamePreference('web');
    expect(await steamNameToShow(steamClient)).toBeNull();
  });

  it("is the Steam client's name in the Steam build", async () => {
    expect(await steamNameToShow(steamClient)).toBe('Gaben');
    expect(connections).not.toHaveBeenCalled();
  });

  it('is the connected Steam account\'s name elsewhere', async () => {
    setShownNamePreference('steam');
    setStoredAccountToken('sess');
    connections.mockResolvedValue({ steam: { name: 'Gaben' }, apple: null, web: null });
    expect(await steamNameToShow(browser)).toBe('Gaben');
    expect(connections).toHaveBeenCalledWith('sess');
  });

  it('falls back to the web name without a session, a Steam account, or the backend', async () => {
    setShownNamePreference('steam');
    expect(await steamNameToShow(browser)).toBeNull();
    setStoredAccountToken('sess');
    connections.mockResolvedValue({ steam: null, apple: null, web: null });
    expect(await steamNameToShow(browser)).toBeNull();
    connections.mockRejectedValue(new Error('offline'));
    expect(await steamNameToShow(browser)).toBeNull();
  });
});
