import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

const crash = { value: false };
vi.mock('@/lib/textModeOffer', async (orig) => ({
  ...(await orig<typeof import('@/lib/textModeOffer')>()),
  endedInACrash: () => crash.value,
}));

import TextModeOffer from '@/components/TextModeOffer';
import { getTextMode } from '@/lib/textMode';
import { OFFER_EVENT } from '@/lib/textModeOffer';

beforeEach(() => {
  localStorage.clear();
  crash.value = false;
});

describe('TextModeOffer', () => {
  it('stays away normally', () => {
    render(<TextModeOffer />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offers text mode after a crash, and turns it on', () => {
    crash.value = true;
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { value: { ...window.location, reload }, configurable: true });
    render(<TextModeOffer />);
    fireEvent.click(screen.getByText('Turn on text mode'));
    expect(getTextMode()).toBe(true);
    expect(reload).toHaveBeenCalled();
  });

  it('offers it on a reconnect loop, and "Not now" puts it away for a week', () => {
    render(<TextModeOffer />);
    act(() => {
      window.dispatchEvent(new Event(OFFER_EVENT));
    });
    fireEvent.click(screen.getByText('Not now'));
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => {
      window.dispatchEvent(new Event(OFFER_EVENT));
    });
    expect(screen.queryByRole('dialog')).toBeNull(); // quiet for the week
  });
});
