import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { censorText, isChatFilterOn, setChatFilterOn, useChatFilterOn, useChatText } from '@/lib/chatFilter';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('censorText', () => {
  it('stars out bad words, look-alikes included', () => {
    expect(censorText('you are a fucking idiot')).toBe('you are a ****ing idiot');
    expect(censorText('sh1t happens')).toBe('**** happens');
  });

  it('leaves clean text, and innocent words containing one, alone', () => {
    expect(censorText('hello there')).toBe('hello there');
    expect(censorText('Scunthorpe assassin classic')).toBe('Scunthorpe assassin classic');
  });
});

describe('the setting', () => {
  it('is on by default and remembers being turned off', () => {
    expect(isChatFilterOn()).toBe(true);
    setChatFilterOn(false);
    expect(localStorage.getItem('wom_chat_filter')).toBe('off');
    expect(isChatFilterOn()).toBe(false);
    setChatFilterOn(true);
    expect(localStorage.getItem('wom_chat_filter')).toBeNull();
  });

  it('stays on when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(isChatFilterOn()).toBe(true);
    expect(() => setChatFilterOn(true)).not.toThrow();
  });

  it('useChatText follows the setting, here or in another tab', () => {
    const { result } = renderHook(() => ({ on: useChatFilterOn(), text: useChatText() }));
    expect(result.current.text('shit')).toBe('****');
    act(() => setChatFilterOn(false));
    expect(result.current.on).toBe(false);
    expect(result.current.text('shit')).toBe('shit');
    const off = result.current.text;
    act(() => {
      localStorage.removeItem('wom_chat_filter');
      window.dispatchEvent(new StorageEvent('storage'));
    });
    expect(result.current.text).not.toBe(off);
    expect(result.current.text('shit')).toBe('****');
  });
});
