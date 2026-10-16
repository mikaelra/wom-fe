import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

const state = vi.hoisted(() => ({ native: false, unlocked: false }));

vi.mock('@/lib/buildTarget', () => ({
  get IS_NATIVE_BUILD() {
    return state.native;
  },
}));
vi.mock('@/lib/hdTextures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hdTextures')>()),
  hdUnlocked: () => Promise.resolve(state.unlocked),
}));

import GraphicsQualityButton from '@/components/hud/GraphicsQualityButton';
import { getTextMode } from '@/lib/textMode';
import { getHdPreference } from '@/lib/hdTextures';

const reload = vi.fn();
const flush = () => act(async () => Promise.resolve());

beforeEach(() => {
  Object.assign(state, { native: false, unlocked: false });
  localStorage.clear();
  // These tests are about the 3D game; the web's default is text mode.
  localStorage.setItem('textMode', 'off');
  reload.mockClear();
  vi.stubGlobal('location', { ...window.location, reload });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GraphicsQualityButton', () => {
  it('shows SD by default and offers LD and SD to an account without HD', async () => {
    render(<GraphicsQualityButton />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Graphics: SD' }));
    expect(screen.getByRole('radio', { name: 'LD' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'SD' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByRole('radio', { name: 'HD' })).toBeNull();
  });

  it('offers HD once the account has it, and switches to it with a reload', async () => {
    state.unlocked = true;
    render(<GraphicsQualityButton />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Graphics: SD' }));
    fireEvent.click(screen.getByRole('radio', { name: 'HD' }));
    expect(getHdPreference()).toBe(true);
    expect(getTextMode()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('switches to text mode, and does nothing when the same quality is picked', async () => {
    render(<GraphicsQualityButton />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Graphics: SD' }));
    fireEvent.click(screen.getByRole('radio', { name: 'SD' }));
    expect(reload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Graphics: SD' }));
    fireEvent.click(screen.getByRole('radio', { name: 'LD' }));
    expect(getTextMode()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('starts on HD in the paid apps', async () => {
    state.native = true;
    render(<GraphicsQualityButton />);
    await flush();
    expect(screen.getByRole('button', { name: 'Graphics: HD' })).toBeTruthy();
  });

  it('shows LD while in text mode, closes on Escape, and hides with the HUD', async () => {
    localStorage.setItem('textMode', 'on');
    const { rerender } = render(<GraphicsQualityButton />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Graphics: LD' }));
    expect(screen.getByRole('radiogroup')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('radiogroup')).toBeNull();
    rerender(<GraphicsQualityButton hidden />);
    expect(screen.queryByRole('button', { name: /Graphics/ })).toBeNull();
  });
});
