import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { getMutedPlayers, setMuted, useMutedPlayers, withoutMuted } from '@/lib/chatMute';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('chatMute', () => {
  it('mutes and unmutes by name, kept in localStorage', () => {
    expect(getMutedPlayers().size).toBe(0);
    setMuted('Toad', true);
    setMuted('Bo', true);
    expect([...getMutedPlayers()]).toEqual(['Bo', 'Toad']);
    expect(localStorage.getItem('wom_muted_players')).toBe('["Bo","Toad"]');
    setMuted('Toad', false);
    expect([...getMutedPlayers()]).toEqual(['Bo']);
  });

  it('hands back the same Set until the list changes', () => {
    setMuted('Bo', true);
    expect(getMutedPlayers()).toBe(getMutedPlayers());
  });

  it('treats a broken or odd stored value as nobody muted', () => {
    localStorage.setItem('wom_muted_players', '{not json');
    expect(getMutedPlayers().size).toBe(0);
    localStorage.setItem('wom_muted_players', '{"a":1}');
    expect(getMutedPlayers().size).toBe(0);
    localStorage.setItem('wom_muted_players', '["Bo", 3]');
    expect([...getMutedPlayers()]).toEqual(['Bo']);
  });

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(getMutedPlayers().size).toBe(0);
    expect(() => setMuted('Bo', true)).not.toThrow();
  });

  it('re-renders the hook on a change here or in another tab', () => {
    const { result } = renderHook(() => useMutedPlayers());
    expect(result.current.size).toBe(0);
    act(() => setMuted('Bo', true));
    expect(result.current.has('Bo')).toBe(true);
    act(() => {
      localStorage.setItem('wom_muted_players', '["Bo","Zed"]');
      window.dispatchEvent(new StorageEvent('storage'));
    });
    expect(result.current.has('Zed')).toBe(true);
  });

  it('withoutMuted drops the muted senders only', () => {
    const msgs = [{ sender: 'Bo', message: 'a' }, { sender: 'Toad', message: 'b' }];
    expect(withoutMuted(msgs, new Set())).toEqual(msgs);
    expect(withoutMuted(msgs, new Set(['Bo']))).toEqual([{ sender: 'Toad', message: 'b' }]);
  });
});
