import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const state = vi.hoisted(() => ({ native: false, unlocked: true }));

vi.mock('@/lib/buildTarget', () => ({
  get IS_NATIVE_BUILD() { return state.native; },
}));
vi.mock('@/lib/hdTextures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hdTextures')>()),
  hdUnlocked: () => Promise.resolve(state.unlocked),
}));

import HdTexturesPanel from '@/components/settings/HdTexturesPanel';
import { getHdPreference } from '@/lib/hdTextures';

beforeEach(() => {
  Object.assign(state, { native: false, unlocked: true });
  localStorage.clear();
});

describe('HdTexturesPanel', () => {
  it('offers HD, off, to a web account that has it, and remembers the choice', async () => {
    render(<HdTexturesPanel />);
    const box = (await screen.findByRole('checkbox', { name: 'HD textures' })) as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(box.checked).toBe(true);
    expect(getHdPreference()).toBe(true);
    expect(screen.getByText(
      'Load HD textures (41mb). Will start to load on entering earth or city scene.',
    )).toBeTruthy();
  });

  it('says how to unlock it on the web without HD', async () => {
    state.unlocked = false;
    render(<HdTexturesPanel />);
    expect(await screen.findByText(/come with the game on Steam/)).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('starts on in the paid apps, and can be turned off', () => {
    state.native = true;
    render(<HdTexturesPanel />);
    const box = screen.getByRole('checkbox', { name: 'HD textures' }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(screen.getByText('Load HD textures.')).toBeTruthy();
    fireEvent.click(box);
    expect(getHdPreference()).toBe(false);
  });
});
